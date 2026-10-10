---
title: "Geospatial / Dispatch Systems"
description: "Use approximate location to find candidates, then make assignment authoritative."
order: 7
tags: ["Real time", "Spatial indexing", "Matching"]
---

## 1. Absolutely Important Invariants

### Primary invariants

| Must remain true | Why it matters | What violates it | Enforcement |
| --- | --- | --- | --- |
| A driver has at most one active incompatible assignment. | Two riders must not both believe the same driver is coming. | Parallel matchers choose the same nearest driver. | Atomic driver assignment version plus trip identity; coordinate the relevant driver/rider rows. |
| Accepted assignments survive location-cache loss. | A dispatch decision is durable business state, not a location sample. | Store trip ownership only in an ephemeral geo index. | Persist trip state and assignment in a durable transactional authority. |

### Supporting invariants

| Must remain true | Why it matters | What violates it | Enforcement |
| --- | --- | --- | --- |
| Location freshness is explicit. | A near driver who went offline is not a useful candidate. | Delayed GPS updates overwrite newer observations. | Per-device session/sequence, server receipt time, freshness filter and availability lease. |
| Stale offers cannot claim a reassigned driver or rider. | Timed-out offers may arrive after the next match. | An old accept callback overwrites a newer offer. | Offer IDs, expiry and fencing/version checks at acceptance. |

## 2. Why the Naive Design Fails

Start with `Client → API → PostgreSQL`: store latitude/longitude, scan all available drivers, choose nearest.

```text
Matcher A and matcher B read driver D as available.
A offers D to rider R1; B offers D to rider R2.
D accepts both notifications before either matcher updates availability.
Both trips become active.
```

The spatial query found candidates; it never reserved one. A guarded assignment transaction protects exclusivity. Full scans also become expensive as drivers report every few seconds. A spatial index reduces candidate search, but no index can enforce trip ownership without an authoritative state transition.

## 3. Core Deep Dives

### Spatial candidate retrieval

**Problem:** Find nearby candidates without scanning every driver.

**Naive approach and why it fails:** Compute precise distance to all coordinates for every rider.

**Common solution:** Use spatial cells or a database spatial index to fetch a coarse neighborhood, then filter by true distance/freshness.

**Trade-off:** Small cells reduce candidates but require more neighbor lookups and move updates.

**Failure to probe:** The nearest driver is across a cell boundary.

**Interviewer follow-up:** Why is a single geohash prefix insufficient?

### Assignment under concurrency

**Problem:** Turn a candidate into one accepted trip.

**Naive approach and why it fails:** Mark available=false after asynchronous acceptance with no ownership predicate.

**Common solution:** Persist offer identity and expiry; atomically claim eligible driver/rider versions and create assignment.

**Trade-off:** Central contention and offer latency trade off against global matching quality.

**Failure to probe:** A delayed acceptance arrives after reassignment.

**Interviewer follow-up:** How do you guarantee one rider is not matched to two drivers?

### Location streams and matching quality

**Problem:** Use noisy observations without pretending they are exact truth.

**Naive approach and why it fails:** Last arrival wins even when an old GPS packet is delayed.

**Common solution:** Track session sequence and freshness; estimate ETA for a bounded candidate set; optimize under a latency budget.

**Trade-off:** Batch matching can improve total fleet efficiency but delays individual offers.

**Failure to probe:** A reconnect resets sequence numbers and old-session packets still arrive.

**Interviewer follow-up:** How do you combine device timestamps with server time?

## 4. Canonical Solution Patterns

| Pattern | When to use it / problem it solves |
| --- | --- |
| Spatial indexing | Reduce the candidate set before expensive distance/ETA computation. |
| Versioned assignment | Arbitrate competing matchers at the durable authority. |
| Offer lease | Bound waiting time and reject late accepts. |
| Session-scoped sequence | Reject stale location packets after reordering or reconnect. |
| Backpressure / coalescing | Drop superseded location samples while retaining durable trip transitions. |

See the [cross-system pattern index](../../patterns/index.md) for the same mechanisms in other families.

## 5. Study Topics

### Coarse search, exact filter

#### What problem does it solve?

Make nearest-neighbor queries practical without losing boundary candidates.

#### How does it work?

Map coordinates into cells, search intersecting cells around a radius, then calculate exact distance. Expand radius if too few eligible drivers exist. A geohash is an index key, not a distance guarantee.

#### Example

A rider lies 10 meters west of a cell border. A driver 20 meters east is closer than one 400 meters west; querying only the rider’s prefix misses the better driver. Query neighboring/intersecting cells.

#### Failure scenario

A dense city cell contains thousands of drivers while a rural cell has none. Fixed cell size does not yield uniform workload; adaptive subdivision or bounded candidate sampling may help.

#### Trade-offs

Fine cells increase write churn as drivers move; coarse cells increase read filtering. Road ETA may differ greatly from straight-line distance.

#### When would I use it?

Nearby search where exact geometry over the entire fleet is too expensive.

#### Interview questions around this topic

How do you handle the date line, cell borders and varying density?

### A dispatch offer is a lease

#### What problem does it solve?

Prevent late user actions from overriding current assignment state.

#### How does it work?

Offer O7 names driver D, rider R, versions and deadline. Acceptance must match the current offer and unexpired eligibility, and claim both resources in one transaction or a carefully recovered coordinator.

#### Example

O7 expires at 10:01. O8 is issued at 10:02. D’s delayed acceptance of O7 at 10:03 fails the offer/version check even if the app still displays the old notification.

#### Failure scenario

An assignment transaction commits but its response is lost. Retrying O8 returns the existing trip ID; creating a fresh trip would violate uniqueness.

#### Trade-offs

Strict expiry can reject a willing driver with a slow network. Grace extensions require authoritative ownership checks, not UI time.

#### When would I use it?

Ride dispatch, courier jobs, field service or any exclusive assignment.

#### Interview questions around this topic

What is the linearization point of acceptance?

### Location freshness and stream coalescing

#### What problem does it solve?

Avoid acting on stale coordinates and overwhelming storage with superseded samples.

#### How does it work?

Accept increasing sequence numbers within an authenticated device session; retain server receipt age and reasonable device-time checks. A latest-location projection can coalesce updates while trip events remain durable.

#### Example

D sends session S2 sequence 51, then delayed sequence 49 arrives. Keep 51. If no fresh update arrives for 30 seconds under the chosen policy, exclude D from immediate matching even if availability says true.

#### Failure scenario

A phone changes session after reconnect. Without a session generation, a high old sequence can incorrectly override the new session. Establish the active generation at the server.

#### Trade-offs

Dropping intermediate GPS samples saves load but prevents exact route reconstruction unless a separate history stream is required.

#### When would I use it?

High-rate mobile location reporting with noisy clocks and networks.

#### Interview questions around this topic

Which data is safe to lose: GPS samples, offers, or accepted trips?

## 6. Quiz

Write or say your reasoning before opening the answers. Name the invariant, the failure window, and the recovery mechanism.

### Conceptual questions

1. Does nearest mean best driver?

2. What does a spatial index guarantee?

3. Why query neighboring cells?

4. Why include location age?

5. Why distinguish trip state from GPS state?

6. What is an offer ID for?

7. Why order locations by session sequence?

8. Why coordinate the rider as well as the driver?

9. Why can location updates be coalesced?

10. What is the assignment authority?

### Scenario questions

11. Two matchers select the same driver. Resolve.

12. A GPS packet arrives five minutes late. Use it?

13. An offer expires while acceptance is in flight. Decide.

14. The location cache disappears mid-trip. What breaks?

15. A city cell becomes extremely dense. Scale it.

### Trade-off questions

16. Geohash or spatial database index?

17. Greedy assignment or batched matching?

18. Frequent GPS samples or battery savings?

19. Strict expiry or grace period?

20. Central assignment or regional partitioning?

<details>
<summary>Reveal all 20 answers and reasoning</summary>

**1.** No. Road travel time, availability, capacity and dispatch policy can outweigh straight-line distance.

**2.** Efficient candidate retrieval under its query semantics; it does not guarantee exclusive assignment.

**3.** Geometric proximity does not respect arbitrary cell boundaries.

**4.** A precise coordinate from ten minutes ago is a poor representation of current position.

**5.** GPS is replaceable observational data; accepted assignment is durable business state.

**6.** It identifies the exact time-bounded proposal so stale accepts cannot claim a newer offer.

**7.** Network arrival order can differ from observation order; session scope handles reconnect resets.

**8.** Preventing two trips per driver still allows one rider to be assigned to two different drivers.

**9.** For current-nearby queries, the latest valid sample supersedes earlier ones; route history is a separate requirement.

**10.** The storage/coordinator that atomically transitions eligible driver/rider state into one trip.

**11.** Both may propose, but only a guarded authoritative claim succeeds. The loser refreshes candidates rather than overriding ownership.

**12.** Reject it for current dispatch based on sequence/session and freshness rules; optionally retain it separately for historical analysis.

**13.** Evaluate expiry at the authoritative acceptance point. Return expired if it no longer qualifies and never let client time override ownership.

**14.** Live map/ETA availability degrades; the accepted trip remains in durable storage. Rebuild locations from fresh device reports.

**15.** Subdivide/adapt index granularity, cap candidate retrieval and compute ETA only for a shortlist. Preserve boundary coverage.

**16.** Geohash supports simple distributed key routing; a mature spatial database offers geometric queries and correctness around shapes. Choose from query needs and operational scale.

**17.** Greedy minimizes offer latency; batching can improve fleet-wide cost and fairness but delays decisions and adds optimization complexity.

**18.** Higher frequency improves freshness but costs battery/bandwidth and write load; adapt cadence to motion and active trip state.

**19.** Strict expiry is simpler; grace can improve acceptance but must reserve the resource through the grace period at the same authority.

**20.** Regional ownership reduces latency, but boundary handoff must transfer assignment authority safely. Independent overlapping writers can double-assign.

</details>

## End-to-End Request Walkthrough

Rider requests pickup → query spatial neighbors → remove stale/ineligible candidates → estimate ETA for shortlist → persist an offer → driver accepts offer ID → transaction checks offer expiry and claims driver/rider versions → persist trip → publish notifications from outbox. Search is approximate; assignment is authoritative.

## What If This Fails?

| Injected failure | Correctness and availability | Recovery |
| --- | --- | --- |
| Geo index stale | Candidates can be poor; correctness survives a final eligibility check. | Refresh/filter at assignment and expire old observations. |
| Matcher crashes after offer | Offer waits until expiry; resources must not be locked forever. | Recover durable offer or expire via guarded transitions. |
| Assignment response lost | Trip may already exist. | Retry the same offer ID and return the existing trip. |
| Duplicate acceptance | Without guards two transitions could occur. | Unique offer/trip identity and version checks make repeats safe. |

## What Should Trigger In My Head?

**Dispatch →** spatial candidates · freshness · ETA shortlist · exclusive assignment · offer expiry · stale-accept rejection.
