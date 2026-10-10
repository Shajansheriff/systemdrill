---
title: "File Storage / Synchronization"
description: "Keep file versions atomic while uploads, offline edits, and garbage collection race."
order: 8
tags: ["Correctness", "Versioning", "Object storage"]
---

## 1. Absolutely Important Invariants

### Primary invariants

| Must remain true | Why it matters | What violates it | Enforcement |
| --- | --- | --- | --- |
| A visible file version references complete durable content. | Readers must never download a half-uploaded version. | Publish metadata before all chunks are verified and stored. | Stage immutable blobs; atomically publish a verified manifest/version. |
| Concurrent edits are not silently discarded. | An offline device can overwrite a newer document. | Last write wins without comparing the base version. | Conditional metadata update; conflict copy or explicit merge policy. |

### Supporting invariants

| Must remain true | Why it matters | What violates it | Enforcement |
| --- | --- | --- | --- |
| Authorization applies to every metadata and content access. | Knowing a blob hash must not grant access to someone else’s file. | Deduplicated blobs are served directly by predictable key. | Authorize manifests and issue bounded scoped download access. |
| Referenced content is not garbage-collected. | A cleanup process must not delete an upload that became live. | Reference discovery races publication or an active upload. | Upload leases, reachability generations and delayed deletion with a coordinated publish/GC protocol. |

## 2. Why the Naive Design Fails

Start with `Client → API → local disk`, overwriting a file when a new upload arrives.

```text
Reader downloads report.pdf while writer overwrites its bytes.
Writer’s connection drops after 60% of the new file.
Metadata still says report.pdf is the latest complete file.
Reader gets a mixture or a truncated file.
```

Separate immutable content from the small mutable pointer. Upload completely, verify the content, then atomically move the pointer to a new manifest.

Offline conflict: laptop and phone both edit base v7. Laptop publishes v8. Phone later uploads its v7-based edit. An unconditional metadata update destroys v8; a base-version predicate detects the conflict and preserves both versions or requests a merge.

## 3. Core Deep Dives

### Resumable upload and atomic publication

**Problem:** Transfer large files despite unreliable networks.

**Naive approach and why it fails:** Restart full uploads after every interruption and publish progress as final content.

**Common solution:** Multipart/chunk upload sessions with checksums; immutable manifest publication only after completeness checks.

**Trade-off:** Chunk tracking and abandoned-upload cleanup add metadata work.

**Failure to probe:** The finalize response is lost after version publication.

**Interviewer follow-up:** How does a retry discover the already committed version?

### Multi-device synchronization

**Problem:** Propagate changes and detect offline divergence.

**Naive approach and why it fails:** Poll the entire directory and accept last writer wins.

**Common solution:** Versioned metadata, per-account change cursor, tombstones and base-version conditional writes.

**Trade-off:** Long-offline clients may require a full rescan; conflicts need product semantics.

**Failure to probe:** A deleted file is recreated by an old offline client.

**Interviewer follow-up:** How long must deletion tombstones live?

### Deduplication and garbage collection

**Problem:** Save bytes without losing live content or leaking access.

**Naive approach and why it fails:** Delete any blob with a momentary reference count of zero.

**Common solution:** Content hashing plus authorized references; staged upload roots and delayed mark/sweep or transactional reference tracking.

**Trade-off:** Dedup can leak cross-tenant existence; safe GC retains extra data temporarily.

**Failure to probe:** GC and manifest commit race on the same blob.

**Interviewer follow-up:** What closes the publication-versus-deletion race?

## 4. Canonical Solution Patterns

| Pattern | When to use it / problem it solves |
| --- | --- |
| Immutable blob + mutable manifest | Publish complete versions atomically. |
| Multipart upload | Resume only missing pieces after interruptions. |
| Optimistic metadata version | Detect edits based on stale content. |
| Change log + cursor | Synchronize incrementally rather than scan every file. |
| Tombstone | Propagate deletion to offline clients. |
| Delayed reachability GC | Reclaim abandoned/unreferenced content with a publication safety protocol. |

See the [cross-system pattern index](../../patterns/index.md) for the same mechanisms in other families.

## 5. Study Topics

### Upload then publish

#### What problem does it solve?

Separate partial transfer from a visible file version.

#### How does it work?

Create an upload session, upload numbered parts, verify checksums and complete the object. Commit metadata pointing to that immutable object only when completion is confirmed. Finalization has a stable request ID.

#### Example

A 1 GiB file uses 16 MiB parts: 64 parts. A failure after part 60 requires resending missing/invalid parts, not necessarily the full GiB. The manifest becomes v12 only after all parts pass validation.

#### Failure scenario

Object completion succeeds but metadata commit fails. The object is an orphan, not a visible broken file. Retry finalize by session ID or collect it after a safe grace period.

#### Trade-offs

Smaller parts improve retry granularity but increase requests and manifests; large parts reduce overhead but waste more work on failure.

#### When would I use it?

Large files over intermittent networks.

#### Interview questions around this topic

Why is “all parts uploaded” different from “file version published”?

### Base-version compare-and-swap

#### What problem does it solve?

Detect lost updates from offline devices.

#### How does it work?

A client submits its edited content and the metadata version it read. The server atomically changes the pointer only if that version still matches; otherwise preserve a conflict version or ask the client to merge.

#### Example

```sql
UPDATE files SET manifest_id = :new_manifest, version = version + 1
WHERE id = :file AND version = :base_version
RETURNING version;
```
If both devices start at v7, only one advances the row to v8. The other gets a conflict rather than silently erasing it.

#### Failure scenario

A deletion tombstone expires before a very old device reconnects. The client may try to recreate the file; require full resync when its cursor predates retained history and use explicit create identities.

#### Trade-offs

Conflict copies preserve data but burden users. Application-specific merging can help text but is not safe for arbitrary binaries.

#### When would I use it?

Files modified by multiple devices or collaborators without live merge semantics.

#### Interview questions around this topic

How does rename differ from editing content when both happen offline?

### Safe garbage collection

#### What problem does it solve?

Reclaim storage without deleting a version being published.

#### How does it work?

Treat live manifests and active upload sessions as roots. Use generation-based marking plus a grace period and revalidation, or serialize publication/reference acquisition against final deletion. Merely waiting is not a proof unless maximum operation lifetimes are bounded.

#### Example

GC marks blob B unreferenced at generation 10. An active upload session still owns B, so B is retained. Publishing adds a live manifest reference before releasing the session root.

#### Failure scenario

If GC deletes B between a publisher’s existence check and commit, a broken version appears. The final delete must coordinate with reference acquisition, not just perform another unprotected check.

#### Trade-offs

Retention and tombstones cost space; aggressive cleanup saves storage but narrows recovery margins.

#### When would I use it?

Content-addressed stores, deduplication and resumable upload systems.

#### Interview questions around this topic

Can a cross-tenant content hash reveal that another customer uploaded a confidential file?

## 6. Quiz

Write or say your reasoning before opening the answers. Name the invariant, the failure window, and the recovery mechanism.

### Conceptual questions

1. Why store immutable blobs?

2. What is a manifest?

3. Why checksum upload parts?

4. What does resumability require?

5. Why compare base versions?

6. What does a deletion tombstone solve?

7. Why is a content hash not authorization?

8. What is an orphaned blob?

9. Why can naive reference counting race?

10. What happens when a sync cursor is too old?

### Scenario questions

11. An upload stops at 60 of 64 parts. Recover.

12. Finalize commits but response is lost. Recover.

13. Two devices edit v7. What should the second publisher see?

14. GC marks an active upload’s chunks as unused. What protects them?

15. A public file becomes private while a signed URL remains live. What is the contract?

### Trade-off questions

16. Fixed chunks or content-defined chunks?

17. Deduplicate globally or within a tenant?

18. Last write wins or conflict copies?

19. Long history retention or aggressive GC?

20. Proxy downloads or direct scoped URLs?

<details>
<summary>Reveal all 20 answers and reasoning</summary>

**1.** Concurrent readers see one complete object; changing only a manifest pointer provides an atomic version boundary.

**2.** Metadata describing a version’s object/chunk identities, order, size and integrity information.

**3.** A successful transport does not prove the intended bytes were stored; checksums detect corruption or mismatched parts.

**4.** A durable upload identity and knowledge of verified parts so retries can skip completed work.

**5.** An offline client’s edit may be based on stale content; the comparison catches a potential lost update.

**6.** It distinguishes deleted content from never-seen content and lets offline clients learn removals.

**7.** Hashes identify bytes, not who may read them; predictable or known hashes must not bypass access checks.

**8.** Uploaded content that no visible manifest references, often left by failed finalization.

**9.** Publishing and decrement/deletion can overlap unless updates and deletion are coordinated.

**10.** The server must require a full rescan/snapshot rather than pretending retained changes cover the missing interval.

**11.** Query the upload session, verify stored parts and transfer missing ones; keep the version invisible until completion.

**12.** Retry the same finalize/session identity and return the existing version, rather than publishing duplicates.

**13.** A version conflict; preserve its bytes and offer conflict copy/merge semantics instead of overwriting v8.

**14.** Active upload roots/leases and coordinated final deletion prevent removal before publication or safe expiry.

**15.** The URL may remain usable until expiry unless the serving path supports immediate revocation. Define short-lived access or an authorization proxy when immediate revocation is required.

**16.** Fixed chunks simplify indexing but insertions shift subsequent boundaries. Content-defined chunking can improve dedup for shifted data at more CPU/complexity.

**17.** Global dedup saves more bytes but raises existence and isolation concerns; tenant-scoped dedup is simpler to secure.

**18.** Last write wins is simple but loses concurrent work. Conflict copies preserve edits at a user-resolution cost.

**19.** Long retention enables restore and offline sync; aggressive GC saves space but requires resync and narrower recovery promises.

**20.** Direct URLs offload bandwidth but revocation is bounded by their lifetime; a proxy can enforce current access at latency/cost overhead.

</details>

## End-to-End Request Walkthrough

Client creates upload session → uploads verified immutable parts → completes object → submits base metadata version → transaction publishes manifest and change event if the base matches → other devices read changes after their cursor → authorize and download content → advance cursor. Active upload roots protect staging; the metadata predicate protects concurrent edits.

## What If This Fails?

| Injected failure | Correctness and availability | Recovery |
| --- | --- | --- |
| Object storage unavailable | New publications wait; do not point to incomplete content. | Resume transfer/finalize after service recovery. |
| Metadata primary fails | A completed object may be orphaned; visible versions must remain durable. | Recover committed manifests and retry finalization by identity. |
| Sync worker replays an event | Repeated metadata updates could regress state. | Apply monotonically versioned changes and deduplicate. |
| Client offline beyond history retention | Incremental recovery cannot be complete. | Require a fresh snapshot and explicitly reconcile local unsynced edits. |

## What Should Trigger In My Head?

**File sync →** immutable bytes · atomic manifest · resumable upload · base version · tombstones · GC/publication race.
