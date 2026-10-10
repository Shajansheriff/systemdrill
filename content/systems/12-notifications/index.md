---
title: "Notifications / Webhooks / API Infrastructure"
description: "Deliver recoverable work without retry storms, duplicate effects, or noisy-neighbor collapse."
order: 12
tags: ["Scale", "Retries", "Backpressure"]
---

## 1. Absolutely Important Invariants

### Primary invariants

| Must remain true | Why it matters | What violates it | Enforcement |
| --- | --- | --- | --- |
| Accepted delivery work is durable until resolved by policy. | An API success must not mean a notification vanished on restart. | ACK before durable enqueue or drop after exhausted retries without visibility. | Durable job/outbox, explicit terminal states and replayable dead-letter handling. |
| Retries preserve the logical event identity. | Receivers must distinguish a retry from a new business event. | Generate a new event ID on every HTTP attempt. | Stable event ID, attempt IDs, idempotent receiver and bounded dedup retention. |

### Supporting invariants

| Must remain true | Why it matters | What violates it | Enforcement |
| --- | --- | --- | --- |
| One tenant or destination cannot monopolize delivery capacity. | A failing endpoint can delay every other customer. | Unbounded retries share one worker pool. | Per-tenant quotas, destination concurrency limits, backoff with jitter and fair scheduling. |
| Authorization and request authenticity remain verifiable. | Callbacks may be spoofed or replayed; user destinations can target internal services. | Unsigned payloads, arbitrary outbound fetches or stale signature acceptance. | Signed timestamped payloads, replay window, secret rotation and validated/isolated egress. |

## 2. Why the Naive Design Fails

Start with `Client → API → external email/push/webhook endpoint` in the request path.

```text
Business transaction commits.
API calls customer endpoint; it accepts the event but the response is lost.
API retries with a new event ID.
Receiver applies the business effect twice.
Another endpoint hangs, tying up all delivery workers.
```

The sender cannot infer non-delivery from a timeout. Durable at-least-once attempts plus stable event identity support receiver deduplication; a webhook cannot promise exactly one remote effect without receiver cooperation. Per-destination limits and retry scheduling isolate slow or failing endpoints.

## 3. Core Deep Dives

### Durable delivery lifecycle

**Problem:** Track work through attempts and terminal outcomes.

**Naive approach and why it fails:** Fire an HTTP request after commit and forget it on crash.

**Common solution:** Outbox/durable queue, lease/visibility timeout, persist attempt result, ACK after durable outcome.

**Trade-off:** Queue redelivery is normal; terminal failure policy becomes part of the API.

**Failure to probe:** Worker sends successfully then crashes before ACK.

**Interviewer follow-up:** What does “delivered” mean: HTTP accepted or business action completed?

### Retries, backpressure and quotas

**Problem:** Keep failure traffic from consuming all capacity.

**Naive approach and why it fails:** Retry immediately forever or let one endpoint fill the pool.

**Common solution:** Exponential backoff with jitter, Retry-After support, bounded attempts/age, fair per-tenant queues and token buckets.

**Trade-off:** Retries improve recovery but increase cost/latency; strict quotas may delay legitimate bursts.

**Failure to probe:** A provider outage releases millions of retries simultaneously.

**Interviewer follow-up:** How will you drain backlog without recreating the outage?

### Authenticity, ordering and preferences

**Problem:** Deliver only allowed events with an interpretable contract.

**Naive approach and why it fails:** Sign only the parsed fields, assume global order, ignore changed preferences.

**Common solution:** Sign raw payload plus timestamp; stable event version/ID; document ordering scope; recheck relevant consent/suppression rules.

**Trade-off:** Strict per-destination order causes head-of-line blocking.

**Failure to probe:** A failed old event blocks a newer urgent notification.

**Interviewer follow-up:** Should the receiver fetch current state instead of applying incremental events?

## 4. Canonical Solution Patterns

| Pattern | When to use it / problem it solves |
| --- | --- |
| Transactional outbox | Prevent losing delivery work after a business commit. |
| Visibility timeout / lease | Recover a worker’s unfinished work while allowing duplicate attempts. |
| Exponential backoff + jitter | Space retries and avoid synchronized bursts. |
| DLQ + replay | Make exhausted work inspectable and safely recoverable. |
| Token bucket | Bound sustained rate while allowing a defined burst. |
| Stable event ID + signatures | Support deduplication and verify authenticity separately. |

See the [cross-system pattern index](../../patterns/index.md) for the same mechanisms in other families.

## 5. Study Topics

### A webhook’s uncertain window

#### What problem does it solve?

Explain why duplicate delivery is unavoidable under ordinary retries.

#### How does it work?

Send a stable event ID in every attempt. Receiver atomically inserts its inbox ID and applies the business effect, then responds. Sender retries on uncertainty and records the attempt separately from the event.

#### Example

Receiver commits event E42 and returns 200; response is lost. Sender attempts E42 again. Receiver’s unique inbox key finds E42 already processed and returns success without repeating the effect.

#### Failure scenario

Receiver inserts inbox ID, then crashes before applying the effect in a separate transaction. The retry now appears processed but the effect never happened. Couple inbox and local effect atomically, or use a durable receiver state machine.

#### Trade-offs

A sender cannot force a third party to deduplicate. State the delivery semantics and provide a stable replay contract.

#### When would I use it?

Webhook delivery and asynchronous integrations.

#### Interview questions around this topic

Why does deduplicating only the sender’s queue not remove this uncertainty?

### A retry schedule with a finite budget

#### What problem does it solve?

Recover transient failures without amplifying outages.

#### How does it work?

Use bounded exponential backoff with randomized delay, respect destination limits, and classify errors. After a maximum age/attempt budget, retain an explicit failed/DLQ record for inspection and controlled replay.

#### Example

With base 1 second and cap 5 minutes, choose a randomized delay up to min(cap, base × 2^attempt). A million failed events must also pass global/tenant admission; jitter alone does not create enough provider capacity.

#### Failure scenario

A poison event fails every time and is endlessly redelivered. Move it out of the hot path with error context, alerting and a replay option preserving event identity.

#### Trade-offs

Short budgets may abandon a recoverable endpoint; long budgets increase storage and stale business events. User-facing urgent notifications may expire instead of retrying indefinitely.

#### When would I use it?

Any external dependency with rate limits or intermittent failures.

#### Interview questions around this topic

When should 400, 401, 429 and 503 be treated differently?

### Atomic token bucket

#### What problem does it solve?

Limit rate with an explicit burst allowance.

#### How does it work?

Maintain tokens and last-refill time. Atomically refill by elapsed time up to capacity, consume one if available, and return a retry delay otherwise. Coordinate at the scope the quota promises.

#### Example

Capacity 100, refill 10/second: a full bucket permits 100 immediate requests, then about 10/second. Separate per-process buckets across 20 replicas could allow 20 times the intended tenant limit.

#### Failure scenario

A shared rate-limit store fails. Choose a documented fail-open/closed or conservative local fallback by endpoint risk; do not accidentally promise a strict global limit with independent local state.

#### Trade-offs

Central coordination improves strictness but adds latency and a dependency. Regional quotas reduce contention at the cost of utilization/flexibility.

#### When would I use it?

API quotas, notification budgets and destination pacing.

#### Interview questions around this topic

What is the difference between limiting rate and limiting concurrent in-flight requests?

## 6. Quiz

Write or say your reasoning before opening the answers. Name the invariant, the failure window, and the recovery mechanism.

### Conceptual questions

1. What does accepted delivery work mean?

2. Why distinguish event ID from attempt ID?

3. Why can a 200 response still be lost?

4. What does visibility timeout do?

5. Why is visibility timeout not a lock on external effects?

6. What is the DLQ for?

7. Why add jitter?

8. What does a signature prove?

9. Why isolate tenants/destinations?

10. What does a token bucket allow?

### Scenario questions

11. Worker crashes after endpoint commits. Recover.

12. An endpoint returns 429 for an hour. What happens?

13. A provider recovers with one million queued events. Drain how?

14. A replayed old webhook arrives after a newer update. What should the receiver do?

15. A user supplies an internal metadata-service URL as webhook destination. Respond.

### Trade-off questions

16. Queue or direct synchronous delivery?

17. Strict ordering or parallel delivery?

18. Fail-open or fail-closed rate limiter?

19. One retry policy for all channels?

20. Dedup forever or for a window?

<details>
<summary>Reveal all 20 answers and reasoning</summary>

**1.** The system durably owns the job and will attempt or explicitly resolve it according to policy, not merely hold it in memory.

**2.** One event can have many transport attempts; receivers deduplicate the event while operators inspect each attempt.

**3.** The receiver may commit before the network breaks. Sender uncertainty does not undo the receiver’s action.

**4.** It temporarily hides claimed work; if the worker fails to finish/extend, it becomes eligible for redelivery.

**5.** A paused worker may continue after its lease expires; downstream identity/fencing must handle overlap.

**6.** Retaining failed/poison work with evidence for repair and replay, not silently discarding it.

**7.** Deterministic backoff synchronizes many failing clients; jitter spreads their retries in time.

**8.** With correct verification and secret handling, payload authenticity/integrity. It does not by itself prevent replay or duplicates.

**9.** One failing or high-volume tenant must not consume all workers, retry capacity or provider quota.

**10.** A bounded burst and a sustained refill rate; it is distinct from a concurrent-request cap.

**11.** Redeliver the same event ID. Receiver deduplicates the committed effect and returns success again.

**12.** Respect Retry-After where valid, pace retries per destination, retain durable jobs and let the configured age budget determine terminal handling.

**13.** Use controlled global and per-tenant rates with fairness and jitter; blasting the backlog can immediately trigger another outage.

**14.** Use entity versions or fetch current authoritative state; if strict ordering is promised, serialize by the relevant key and handle poison events explicitly.

**15.** Reject/restrict private or sensitive destinations and enforce egress policy across DNS resolution/redirects; user-provided URLs are not unrestricted network authority.

**16.** Queue when delivery can lag and must survive failures. Synchronous delivery is simpler only when latency/failure coupling is acceptable.

**17.** Strict per-key order simplifies incremental state but blocks behind failures; versioned parallel delivery improves throughput if receivers handle reordering.

**18.** Availability-sensitive low-risk reads may degrade with conservative local limits; costly or abuse-sensitive actions may fail closed. Specify the guarantee.

**19.** Different channels have different urgency, expiration and provider behavior; a password code should not arrive days later like a durable billing event.

**20.** Forever costs unbounded state; a bounded window requires a documented maximum replay age or durable business identity that still rejects old effects.

</details>

## End-to-End Request Walkthrough

Business transaction writes state and outbox E42 → relay enqueues E42 → fair scheduler checks tenant/destination budgets → worker signs raw payload and sends attempt A1 → receiver atomically deduplicates and applies → sender persists outcome and ACKs. Timeout reschedules E42 with a new attempt ID; exhausted work remains inspectable.

## What If This Fails?

| Injected failure | Correctness and availability | Recovery |
| --- | --- | --- |
| Queue unavailable | Business writes can retain outbox work; delivery latency rises. | Relay resumes and drains with rate limits. |
| Worker lease expires mid-request | Two attempts can overlap; receiver correctness needs deduplication. | Same event ID for both attempts; reconcile status. |
| Redis rate limiter unavailable | Quota precision/availability depends on policy. | Use conservative fallback or reject selected operations explicitly. |
| Poison event repeats | Worker capacity is wasted and ordering may stall. | Quarantine with error details; repair and replay preserving identity. |

## What Should Trigger In My Head?

**Webhook / notifications →** durable job · stable event ID · uncertain ACK · jittered retries · tenant fairness · DLQ · signed payload.
