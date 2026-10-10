---
title: "Collaborative Editing"
description: "Preserve concurrent intent while replicas diverge, reconnect, and converge."
order: 9
tags: ["Real time", "Convergence", "CRDT / OT"]
---

## 1. Absolutely Important Invariants

### Primary invariants

| Must remain true | Why it matters | What violates it | Enforcement |
| --- | --- | --- | --- |
| Replicas converge after receiving the same accepted operations. | Collaborators must eventually see the same document. | Operations applied in different orders without transform/merge rules. | A proven OT or CRDT algorithm with explicit operation semantics. |
| Acknowledged edits are durable within the promised model. | A green “saved” indicator must not hide lost work. | Broadcast edits before durable log persistence and acknowledge too early. | Persist operation identity/log before saved ACK; retain local pending edits. |

### Supporting invariants

| Must remain true | Why it matters | What violates it | Enforcement |
| --- | --- | --- | --- |
| Concurrent edits are not silently replaced by whole-document writes. | Last writer wins can erase another person’s contribution. | Each client uploads an entire snapshot based on an old version. | Operation-based edits with causal/base revision metadata. |
| Permission revocation applies to new operations. | An offline collaborator may return after access was removed. | Server trusts stale local membership forever. | Authorize accepted operations against current policy; reject/reconcile offline drafts explicitly. |

## 2. Why the Naive Design Fails

Start with `Client → API → PostgreSQL`, saving the entire text field after each edit.

```text
Both editors start with “cat”.
Alice inserts “s” at the end → “cats”.
Bob inserts “a ” at the start → “a cat”.
Alice saves, then Bob saves.
Final document is “a cat”: Alice’s accepted work disappears.
```

A version conflict prevents silent loss but does not merge live work. Sending raw position edits also fails: an insertion at position zero shifts everyone else’s positions. Introduce transformation against a revision history or stable element identities with a convergent merge algorithm. The algorithm, not the WebSocket, determines correctness.

## 3. Core Deep Dives

### Operational transformation versus CRDT

**Problem:** Merge concurrent edits using well-defined semantics.

**Naive approach and why it fails:** Broadcast raw offsets and apply them in arrival order.

**Common solution:** OT transforms operations against concurrent history; a sequence CRDT identifies elements and defines deterministic insertion/deletion ordering.

**Trade-off:** OT central coordination and transformation proofs versus CRDT metadata and compaction complexity.

**Failure to probe:** Two concurrent inserts choose the same position.

**Interviewer follow-up:** How are tie-breaks and delete-vs-insert cases defined?

### Durable log and reconnect

**Problem:** Recover accepted and pending edits across crashes.

**Naive approach and why it fails:** Keep document state only in gateway memory.

**Common solution:** Persist operation IDs, revisions/causal metadata and snapshots; reconnect from a known revision and resend pending operations idempotently.

**Trade-off:** Log retention and snapshot consistency cost storage and CPU.

**Failure to probe:** Client misses the acceptance ACK and resends an already applied edit.

**Interviewer follow-up:** How does snapshot state align with the operation-log cutoff?

### Compaction, presence and access

**Problem:** Bound metadata without breaking old replicas.

**Naive approach and why it fails:** Delete tombstones immediately; treat cursors like durable document edits.

**Common solution:** Compact only with a safe causal/epoch policy; force old clients to resync; keep presence ephemeral and authorize each accepted edit.

**Trade-off:** Long offline support delays GC; resync complicates local pending edits.

**Failure to probe:** An offline client references an element removed by compaction.

**Interviewer follow-up:** What is your maximum supported offline horizon?

## 4. Canonical Solution Patterns

| Pattern | When to use it / problem it solves |
| --- | --- |
| OT / sequence CRDT | Resolve concurrent edits under a proven convergence protocol. |
| Stable operation ID | Deduplicate retries independently of transport sessions. |
| Snapshot + operation log | Bound startup replay while preserving durable history. |
| Causal metadata / revisions | Interpret edits relative to what the sender observed. |
| Ephemeral presence | Keep cursors/typing status cheap and separate from saved document state. |

See the [cross-system pattern index](../../patterns/index.md) for the same mechanisms in other families.

## 5. Study Topics

### Transform intent, not just offsets

#### What problem does it solve?

Keep an edit targeted at its intended location after concurrent changes.

#### How does it work?

In a centralized OT model, the server orders operations. An operation based on revision r is transformed against intervening operations before application. Clients transform their pending operations against remote accepted edits using the protocol’s rules.

#### Example

Start “cat”. Alice inserts “s” at position 3 at revision 0. Bob inserts “a ” at position 0 at revision 0. If Bob commits first, Alice’s insert position shifts by 2 to 5, yielding “a cats”. This example illustrates a transform; a full implementation needs delete/insert and tie-break rules.

#### Failure scenario

Naively shifting all offsets right for every insertion fails for overlapping deletes and equal-position inserts. Use a tested algorithm rather than inventing pairwise rules during implementation.

#### Trade-offs

Central ordering simplifies a connected session but requires retained transform history and careful client pending-operation handling.

#### When would I use it?

Collaborative text with a coordinated server and well-defined edit operations.

#### Interview questions around this topic

What should happen when one user deletes a range while another inserts inside it?

### Stable identities in a sequence CRDT

#### What problem does it solve?

Let replicas merge concurrent edits without relying solely on numeric positions.

#### How does it work?

Give elements globally unique IDs and express insertion relative to existing identities. A deterministic ordering rule resolves concurrent placements. Deletion marks identity visibility; causal metadata governs safe cleanup.

#### Example

Alice inserts element (A,9) after X. Bob concurrently inserts (B,4) after X. Every replica applies the same deterministic order for these siblings, regardless of arrival order. The precise order is algorithm-specific.

#### Failure scenario

Deleting X’s metadata while an offline client still references it can make a later insertion uninterpretable. Retain needed structure or reject old epochs and rebase via a defined resync path.

#### Trade-offs

Convergence does not imply ideal human intent. Rich text, undo and structural edits require more than a basic character sequence.

#### When would I use it?

Offline-first collaboration or replicas that must merge without a single continuous connection.

#### Interview questions around this topic

What metadata grows with edits, and when can it safely be discarded?

### Snapshots and the saved boundary

#### What problem does it solve?

Avoid losing acknowledged edits while limiting replay time.

#### How does it work?

A snapshot represents state through an exact accepted revision or causal frontier. Persist it durably before truncating the covered log; retain operation dedup information for the retry horizon.

#### Example

Snapshot S covers revision 50,000. A reconnect at 49,000 can load S and replay 50,001 onward. Client pending operations must be rebased/merged through the protocol, not blindly appended as old offsets.

#### Failure scenario

A snapshot is uploaded but its metadata points to the wrong cutoff. Replaying too few edits loses content; replaying twice without dedup duplicates content.

#### Trade-offs

Frequent snapshots shorten startup but cost compute and writes. Very long retry/offline horizons grow retained metadata.

#### When would I use it?

Documents with long editing histories and many reconnecting clients.

#### Interview questions around this topic

When may the UI honestly say “saved” versus “changes on this device”?

## 6. Quiz

Write or say your reasoning before opening the answers. Name the invariant, the failure window, and the recovery mechanism.

### Conceptual questions

1. What does convergence mean?

2. Does convergence guarantee human intent?

3. Why is whole-document last write wins dangerous?

4. What does an OT base revision encode?

5. Why do CRDT elements need stable IDs?

6. Why deduplicate operation IDs?

7. Is a WebSocket an editing algorithm?

8. Why distinguish presence from content?

9. What is a safe snapshot cutoff?

10. Why is tombstone collection difficult?

### Scenario questions

11. Two users insert at position zero. What determines the result?

12. The edit commits but its ACK is lost. Recover.

13. A client reconnects after compaction. What happens?

14. A removed collaborator uploads offline edits. Accept?

15. Server broadcasts an edit then crashes before persistence. What broke?

### Trade-off questions

16. OT or CRDT?

17. Long offline support or aggressive compaction?

18. Per-keystroke persistence or batched edits?

19. Global document order or independent subdocuments?

20. Synchronous save feedback or optimistic UI?

<details>
<summary>Reveal all 20 answers and reasoning</summary>

**1.** Replicas that have the same accepted operation set/history under the protocol compute the same state; it is not a promise of identical state during disconnection.

**2.** No. Deterministic merges can still surprise users, especially with undo, rich text and structural edits.

**3.** It silently replaces concurrent contributions from another editor.

**4.** The document history the client used to interpret positional edits.

**5.** Numeric offsets move as others edit; stable identities let operations refer to persistent logical positions/elements.

**6.** A lost ACK causes retries; one logical insert must not be applied twice.

**7.** No. It transports operations but supplies neither convergence nor durability semantics.

**8.** Cursors and typing indicators can expire or drop; accepted document edits generally cannot.

**9.** An exact revision/causal frontier whose state is durably represented by the snapshot.

**10.** Offline replicas may still refer to deleted identities; cleanup must account for causal knowledge or force an epoch resync.

**11.** A protocol-defined transformation/tie-break or CRDT identity order, not arbitrary local arrival order.

**12.** Client resends the same operation ID; server returns the accepted result without applying the edit again.

**13.** If its base epoch/history is unavailable, load a new snapshot and use an explicit merge/rebase path for pending edits; do not guess missing transforms.

**14.** Check current authorization. Preserve their local draft if possible but do not merge unauthorized operations into the shared document.

**15.** If it acknowledged saved status, durability was violated. Persist before saved ACK; optimistic remote display must be reconciled against authoritative history.

**16.** Choose based on offline requirements, operation model, metadata budget and available proven implementations. Neither name alone guarantees correct rich-text semantics.

**17.** Long offline support retains causal/history metadata. Aggressive compaction requires a resync/rebase contract for old clients.

**18.** Batching lowers overhead but increases the unsaved window; ACK only what is durably covered, and retain pending local work.

**19.** Independent subdocuments scale well when edits commute across boundaries; cross-structure operations may still need coordination.

**20.** Optimistic local display gives responsiveness. Clearly separate local pending state from durable acceptance so users understand network failures.

</details>

## End-to-End Request Walkthrough

Client edits locally and assigns operation ID/base metadata → sends to collaboration authority → current permission check → transform/merge under chosen protocol → durable operation commit → saved ACK and broadcast → peers deduplicate and merge → snapshot periodically at a precise frontier. Reconnect resends pending IDs and retrieves missing accepted history.

## What If This Fails?

| Injected failure | Correctness and availability | Recovery |
| --- | --- | --- |
| Socket disconnects | Local pending edits remain; live collaboration pauses. | Reconnect with operation IDs and base/causal metadata. |
| Duplicate operation delivery | Repeated inserts would break intent without dedup. | Ignore already accepted IDs and return the existing revision. |
| Snapshot worker crashes | Durable log remains the authority; replay may be slower. | Retry snapshot and truncate only after verified durable publication. |
| Replica returns from an old epoch | Its references may no longer be resolvable. | Require protocol-aware resync and explicit handling of unsynced edits. |

## What Should Trigger In My Head?

**Collaborative editor →** convergence rules · edit identity · causal/base revision · durable saved boundary · offline replay · safe compaction.
