---
title: "Media Streaming / Delivery"
description: "Separate reliable publication from adaptive playback, expensive processing, and live latency."
order: 10
tags: ["Scale", "CDN", "Adaptive bitrate"]
---

## 1. Absolutely Important Invariants

### Primary invariants

| Must remain true | Why it matters | What violates it | Enforcement |
| --- | --- | --- | --- |
| A published rendition references complete playable segments. | A manifest pointing at missing content creates deterministic playback failures. | Manifest is published before segment jobs finish. | Immutable segments, verified completion and atomic manifest publication. |
| Playback access respects entitlement. | CDN delivery must not become an authorization bypass. | Publicly cached private content or overly broad signed URLs. | Authorize playback; scope tokens/URLs and define revocation/cache policy. |

### Supporting invariants

| Must remain true | Why it matters | What violates it | Enforcement |
| --- | --- | --- | --- |
| Processing retries do not publish inconsistent duplicate versions. | Transcoding is expensive and often interrupted. | Two workers overwrite the same mutable output keys. | Content/version job identity, immutable output namespace and guarded publication. |
| Playback has a bounded buffering/latency target. | Average bandwidth alone does not predict stalls. | Bitrate stays above effective throughput or live buffers grow without bound. | Adaptive bitrate, aligned segments and explicit live latency/buffer policy. |

## 2. Why the Naive Design Fails

Start with `Client → API server → one original video file`. Every viewer streams bytes through the application server.

```text
10,000 viewers each request 5 Mbit/s.
Origin egress reaches 50 Gbit/s before HTTP overhead.
A mobile viewer’s link falls to 1 Mbit/s; the 5 Mbit/s file keeps arriving too slowly.
Playback stalls while application servers spend resources forwarding identical bytes.
```

A CDN earns its place by absorbing repeated geographically distributed reads. Multiple renditions earn their place because network capacity and device capability vary. Neither requires media metadata to be split into dozens of microservices. Upload/processing can begin with a durable job table and a worker.

## 3. Core Deep Dives

### Processing and publication

**Problem:** Convert large uploads into playable versions.

**Naive approach and why it fails:** Transcode inline in the upload request and expose output as it appears.

**Common solution:** Durable jobs produce immutable segments/renditions; verify completeness, then publish a manifest/version pointer.

**Trade-off:** Compute/storage grow with the bitrate ladder.

**Failure to probe:** Worker crashes halfway through encoding a rendition.

**Interviewer follow-up:** How do retries avoid mixing segments from different encodes?

### Adaptive bitrate and CDN delivery

**Problem:** Sustain playback across network changes.

**Naive approach and why it fails:** Serve one high-quality file to every device from the origin.

**Common solution:** Segmented renditions with aligned boundaries; player adapts from throughput/buffer signals; CDN caches immutable media.

**Trade-off:** Short segments improve adaptation/latency but increase overhead.

**Failure to probe:** CDN miss storm overloads the origin during a popular premiere.

**Interviewer follow-up:** How do you distinguish poor encoding from poor cache hit rate?

### Live latency and entitlement

**Problem:** Bound delay without leaking protected media.

**Naive approach and why it fails:** Buffer indefinitely and assume cached URLs stay authorized forever.

**Common solution:** Sliding manifests, bounded player buffers, scoped authorization and an explicit URL/token expiry contract.

**Trade-off:** Lower live latency leaves less jitter tolerance; stricter revocation adds checks.

**Failure to probe:** A viewer retains a valid URL after subscription removal.

**Interviewer follow-up:** What is the acceptable revocation window?

## 4. Canonical Solution Patterns

| Pattern | When to use it / problem it solves |
| --- | --- |
| Durable job + idempotent output | Resume expensive processing safely. |
| Immutable segments + manifest | Cache bytes aggressively while publishing versions atomically. |
| Adaptive bitrate ladder | Match quality to effective throughput and device limits. |
| CDN / origin shielding | Reduce repeated origin reads and absorb geographic demand. |
| Scoped playback tokens | Grant bounded access without exposing unrestricted storage paths. |

See the [cross-system pattern index](../../patterns/index.md) for the same mechanisms in other families.

## 5. Study Topics

### Publish a complete rendition

#### What problem does it solve?

Ensure a playback index never promises absent bytes.

#### How does it work?

Write outputs under upload/version/rendition identity, validate segment checksums and durations, then commit a metadata pointer to a ready manifest. A worker retry can replace its staging attempt without mutating a published version.

#### Example

Upload V9 produces 360p, 720p and 1080p. Publish only verified variants; if 1080p fails, either publish the complete lower-quality set under an explicit policy or keep the version processing.

#### Failure scenario

A stale worker finishes after a newer encode is published. A generation/version predicate prevents the stale job from moving the active pointer backward.

#### Trade-offs

Waiting for every rendition increases time to first availability. Partial ladder publication requires versioned manifests and client-compatible updates.

#### When would I use it?

Video/audio ingestion with asynchronous transforms.

#### Interview questions around this topic

What exactly makes a media version READY?

### Bitrate is a budget, not a quality label

#### What problem does it solve?

Avoid rebuffering when delivery cannot sustain the selected rendition.

#### How does it work?

Player measures download time and buffer occupancy, then chooses a lower/higher aligned rendition with safety margin. Segment boundaries/keyframes must support switching without corrupting playback.

#### Example

A 4-second segment at 4 Mbit/s is about 2 MB. On a 2 Mbit/s connection it takes about 8 seconds to fetch: buffer drains. Switching to a 1 Mbit/s rendition makes that segment roughly 0.5 MB and about 2 seconds to fetch.

#### Failure scenario

A brief throughput spike triggers an aggressive upshift and the next segment stalls. Use smoothing, buffer thresholds and asymmetric up/down decisions.

#### Trade-offs

Conservative adaptation reduces stalls at lower visual quality. Tiny segments react faster but increase request/encoding overhead.

#### When would I use it?

Playback across mobile networks and heterogeneous devices.

#### Interview questions around this topic

Why does average session throughput hide user-visible stalls?

### Cache design for media access

#### What problem does it solve?

Offload repeated bytes while controlling who can retrieve them.

#### How does it work?

Cache immutable segment identities; keep authorization separate from identity where supported. Signed query parameters must not fragment the cache unnecessarily, and authorization must still be checked according to CDN configuration.

#### Example

One million viewers watch the same segment. Shared cache identity allows reuse; including a unique viewer token in the cache key may turn it into a million misses. Excluding the token is safe only if access is still independently enforced.

#### Failure scenario

A manifest is short-lived but referenced media is publicly accessible forever. Entitlement checks at manifest fetch alone may not protect copied segment URLs.

#### Trade-offs

Strict per-request auth costs latency; short-lived scoped URLs allow a bounded revocation delay.

#### When would I use it?

Subscription content, private recordings and large public streams.

#### Interview questions around this topic

Can you revoke access immediately after issuing a one-hour signed URL?

## 6. Quiz

Write or say your reasoning before opening the answers. Name the invariant, the failure window, and the recovery mechanism.

### Conceptual questions

1. Why segment media?

2. Why multiple renditions?

3. What is the publication invariant?

4. Why immutable media keys?

5. What does a manifest contain?

6. Why align rendition boundaries?

7. What does a CDN solve?

8. Why keep processing asynchronous?

9. What is live-edge distance?

10. Why distinguish URL expiry from revocation?

### Scenario questions

11. A transcoder crashes at segment 80. Recover.

12. A 4-second, 4-Mbit/s segment takes 8 seconds to fetch. What happens?

13. A viral premiere creates CDN misses everywhere. Protect origin.

14. Old job publishes after a new encode. Prevent regression.

15. User loses entitlement but holds a signed URL. Can it still work?

### Trade-off questions

16. Long or short segments?

17. Encode every format or a small ladder?

18. Push live latency lower or add buffer?

19. Origin-only or CDN?

20. Publish lower qualities early or wait for all?

<details>
<summary>Reveal all 20 answers and reasoning</summary>

**1.** Segments enable bounded retries, caching, seeking and bitrate changes without downloading an entire file.

**2.** Devices and network capacity differ; one bitrate cannot balance quality and uninterrupted playback for all viewers.

**3.** Every advertised playable rendition references complete valid content under its version.

**4.** Caches can retain bytes safely and retries cannot accidentally change already published segments.

**5.** The available renditions and segment/timing information needed to locate and play the media.

**6.** A player must switch at compatible decoding boundaries without skipping or corrupting content.

**7.** Repeated byte delivery near viewers, reducing origin bandwidth and latency; it does not perform correct transcoding or entitlement by itself.

**8.** Encoding is long and resource-heavy; a durable job survives request timeouts and worker restarts.

**9.** The delay between content production and the viewer’s current playback position, influenced by encoding, transport and buffering.

**10.** A previously issued capability may remain usable until expiry unless a serving authority checks revocation.

**11.** Resume/retry within a versioned staging namespace, validate complete outputs, and publish only after the readiness condition is met.

**12.** The player drains roughly 4 seconds of buffer per such segment; switch down or playback will stall.

**13.** Use origin shielding/coalescing, controlled prewarming where justified and bandwidth admission/fallback policies; track miss traffic rather than just total views.

**14.** Require matching processing generation in the publish transition and keep immutable outputs separated by version.

**15.** Yes until its capability expires unless revocation is checked. State that bound or use a revocable serving path.

**16.** Long segments reduce request overhead and improve compression opportunities; short segments improve adaptation and live latency at overhead cost.

**17.** More formats improve device/quality coverage but consume storage and compute. Choose from audience capabilities and measured quality benefit.

**18.** Lower latency improves interaction but reduces tolerance to jitter and encoding delays; buffers trade delay for smoother playback.

**19.** Origin-only can suit small private traffic; CDN becomes valuable when repeated egress and geographic latency dominate.

**20.** Early publication shortens availability time but needs explicit quality/version behavior; waiting simplifies readiness at slower startup.

</details>

## End-to-End Request Walkthrough

Upload session completes → durable processing job → worker creates versioned aligned segments → validation marks ready renditions → atomic manifest publication → viewer entitlement check → player fetches manifest and CDN segments → adaptive bitrate follows buffer/throughput. Publication protects completeness; scoped access protects entitlement; CDN protects origin capacity.

## What If This Fails?

| Injected failure | Correctness and availability | Recovery |
| --- | --- | --- |
| Transcoder crashes | Upload remains durable; availability is delayed. | Retry by job/generation and validate before publication. |
| CDN node loses cache | Correctness holds; origin load and latency rise. | Shield/coalesce misses and bound origin pressure. |
| Manifest points to a missing segment | Publication invariant is broken; playback fails reproducibly. | Rollback to a complete manifest version and repair/re-encode affected outputs. |
| Live ingest pauses | Player eventually exhausts buffer; latency may grow if it keeps waiting. | Signal discontinuity/reconnect and rejoin the live edge under policy. |

## What Should Trigger In My Head?

**Streaming →** complete manifest · immutable segments · bitrate budget · CDN hit/miss path · live buffer · entitlement lifetime.
