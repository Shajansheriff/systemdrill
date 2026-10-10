---
title: "E-commerce / Inventory / Orders"
description: "Coordinate stock, payment, and fulfillment without pretending they share one transaction."
order: 6
tags: ["Correctness", "Sagas", "Inventory"]
---

## 1. Absolutely Important Invariants

### Primary invariants

| Must remain true | Why it matters | What violates it | Enforcement |
| --- | --- | --- | --- |
| Committed allocation never exceeds sellable stock under a no-oversell policy. | A paid order must have inventory or an explicit exception workflow. | Concurrent carts read the same stock or independent regions allocate the same units. | Atomic stock predicate or reservations at a per-SKU authority. |
| One logical order is fulfilled at most once. | Duplicate queue delivery must not produce two shipments. | Worker creates a shipment, crashes before ACK, then repeats the call. | Unique fulfillment identity and carrier/warehouse idempotency or reconciliation. |

### Supporting invariants

| Must remain true | Why it matters | What violates it | Enforcement |
| --- | --- | --- | --- |
| Order state advances only through legal transitions. | A late payment event must not revive a canceled order blindly. | Out-of-order callbacks overwrite terminal state. | Versioned state machine with guarded transitions and compensation. |
| Every accepted order can reach a resolved business outcome. | Partial workflows cannot be silently abandoned. | Inventory is reserved but payment failure is never processed. | Durable workflow state, deadlines, retryable compensation and reconciliation. |

## 2. Why the Naive Design Fails

Start with `Client → API → PostgreSQL`: insert order, decrement stock, call payment, then enqueue shipping.

```text
stock(SKU-9) = 1
A reads 1; B reads 1.
A accepts an order; B accepts an order.
Both write stock = 0. Two buyers own the last unit.
```

A guarded decrement makes only one allocation succeed. If stock and order live in one database, update both in one transaction before inventing a distributed workflow.

Now introduce a real external boundary: payment succeeds, but inventory reservation has expired. No local transaction can roll the payment provider back. A durable order state machine must either reacquire stock under policy or compensate the payment. A queue alone does not encode which outcome is legal.

## 3. Core Deep Dives

### Stock allocation under contention

**Problem:** Bound total committed inventory.

**Naive approach and why it fails:** Treat cached product availability as authoritative.

**Common solution:** Reserve via conditional stock decrement and a durable reservation row; use a unique order/reservation identity.

**Trade-off:** Reservations reduce sellable stock while customers wait.

**Failure to probe:** A release operation runs twice and increments stock twice.

**Interviewer follow-up:** How does quantity reservation differ from named-seat ownership?

### Order saga and compensation

**Problem:** Coordinate independent inventory, payment and fulfillment authorities.

**Naive approach and why it fails:** Execute sequential RPCs and forget the workflow on process crash.

**Common solution:** Persist each transition and its next durable task; compensate completed steps when later steps fail.

**Trade-off:** Intermediate states are visible; compensation can itself fail.

**Failure to probe:** Payment succeeds after cancellation.

**Interviewer follow-up:** Which transitions are irreversible once shipping starts?

### Flash-sale load and fulfillment

**Problem:** Protect hot SKUs and exactly one business shipment.

**Naive approach and why it fails:** Scale API servers while every request contends on one stock row; assume queue delivery happens once.

**Common solution:** Admission control, bounded per-SKU work, durable fulfillment identity and downstream deduplication.

**Trade-off:** Serialization limits a hot SKU; splitting inventory requires safe quotas.

**Failure to probe:** Carrier creates a label but response is lost.

**Interviewer follow-up:** Can regional inventory quotas improve throughput without overselling?

## 4. Canonical Solution Patterns

| Pattern | When to use it / problem it solves |
| --- | --- |
| Atomic stock reservation | Enforce quantity bounds at allocation time. |
| Saga | Track a long-lived order across independent authorities. |
| Idempotent release | Avoid returning the same reserved stock twice. |
| Outbox / inbox | Couple local state and outgoing tasks; deduplicate incoming effects. |
| Regional quotas | Allocate disjoint stock budgets when global contention dominates. |

See the [cross-system pattern index](../../patterns/index.md) for the same mechanisms in other families.

## 5. Study Topics

### Reserve and release stock safely

#### What problem does it solve?

Prevent both overselling and double compensation.

#### How does it work?

In one transaction, create a unique reservation and decrement available units only if enough exist. To release, transition ACTIVE to RELEASED once and increment only when that transition succeeds.

#### Example

```sql
UPDATE inventory SET available = available - :quantity
WHERE sku = :sku AND available >= :quantity
RETURNING sku;
```
For quantity 2 and availability 3, the first transaction leaves 1; another request for 2 returns no row. Create the reservation in the same transaction, rolling back on any failure.

#### Failure scenario

Two timeout handlers release R7. Only the handler that changes R7 from ACTIVE to RELEASED adds units back; unconditional increments manufacture stock.

#### Trade-offs

Multi-SKU carts need ordered locks or an explicit all-or-partial reservation policy. Long holds reduce conversion for other shoppers.

#### When would I use it?

Scarce goods with a no-oversell promise.

#### Interview questions around this topic

How do you keep returned, damaged and in-transit units out of sellable stock?

### A durable order state machine

#### What problem does it solve?

Recover cross-service workflows after any process exit.

#### How does it work?

Persist states such as CREATED, RESERVED, PAYMENT_PENDING, PAID, FULFILLING, SHIPPED and CANCELING. Record transitions and outgoing tasks atomically; version guards reject stale callbacks.

#### Example

Payment success arrives for a CANCELING order. A transition rule creates a refund obligation instead of changing the order back to PAID. Refund completion lets cancellation become terminal.

#### Failure scenario

A payment success and cancellation race. Serialize the local transition, then reconcile external reality; one request winning the row lock does not undo an already successful charge.

#### Trade-offs

More states increase implementation complexity, but hiding uncertainty in a boolean “paid” loses recovery information.

#### When would I use it?

Orders spanning warehouse, provider and delivery systems.

#### Interview questions around this topic

What evidence lets an operator safely resolve an order stuck in PAYMENT_PENDING?

### Fulfillment identity across retries

#### What problem does it solve?

Avoid repeated physical actions after lost acknowledgements.

#### How does it work?

Create a unique fulfillment operation before calling the warehouse. Pass it downstream as an idempotency key; persist external shipment reference; query by that reference after timeouts.

#### Example

Worker submits shipment F42; warehouse creates label L9; worker crashes. Replayed F42 returns L9 or queries it. A new F43 would risk a second parcel.

#### Failure scenario

The carrier does not support idempotent creation or lookup. A local “sent” flag cannot resolve whether the external action occurred; require reconciliation or manual intervention for ambiguous outcomes.

#### Trade-offs

Conservative recovery can delay shipments. Blind automatic retry can create irreversible duplicates.

#### When would I use it?

Shipping, vouchers, digital entitlements or any costly fulfillment effect.

#### Interview questions around this topic

Why is queue deduplication not enough to guarantee one shipment?

## 6. Quiz

Write or say your reasoning before opening the answers. Name the invariant, the failure window, and the recovery mechanism.

### Conceptual questions

1. What must a no-oversell system protect?

2. Is cart presence a reservation?

3. Why use a stock predicate?

4. What is compensation?

5. Why is RELEASED a state?

6. What does an outbox fix?

7. Why version order transitions?

8. Why separate stock from catalog cache?

9. What does one fulfillment identity buy?

10. Why measure oldest unfinished order age?

### Scenario questions

11. Two buyers each buy two units; stock is three. Outcome?

12. Payment succeeds after stock expires. Recover.

13. A release message is processed twice. Recover.

14. Warehouse creates shipment but response is lost. Recover.

15. One SKU receives 100,000 requests/second. What changes?

### Trade-off questions

16. One database transaction or saga?

17. Reserve before charge or charge before reserve?

18. Central stock or regional quotas?

19. Long reservation TTL or short TTL?

20. Automatically cancel stuck workflows?

<details>
<summary>Reveal all 20 answers and reasoning</summary>

**1.** The total allocated quantity against authoritative sellable stock, including reservations and releases.

**2.** Only if the product explicitly grants a hold and the inventory authority records it; a UI cart alone cannot reserve stock.

**3.** It combines the check with the decrement so concurrent callers cannot both spend the same last unit.

**4.** A new business action that counteracts a completed step, such as refunding or releasing inventory; it is not atomic rollback.

**5.** It records that compensation already occurred, making repeated release attempts safe.

**6.** A crash between local order commit and publishing the next task; the committed task can be relayed later.

**7.** Stale events otherwise overwrite newer business decisions, such as reviving canceled orders.

**8.** Catalog freshness can lag, but the allocation decision must check the current authority.

**9.** Retries can refer to the same physical or digital effect across worker restarts.

**10.** Average processing latency can hide a small set of permanently stuck workflows that violate completion guarantees.

**11.** One guarded decrement succeeds and the other fails; order/reservation writes share that transaction.

**12.** Apply an explicit reacquire-or-refund policy. Reacquisition must pass the same stock predicate; never confirm based on the expired reservation.

**13.** Only ACTIVE to RELEASED changes stock. The second handler finds the terminal reservation and does nothing.

**14.** Retry/query using the original fulfillment identity and external reference. Escalate ambiguity if the downstream cannot deduplicate or report status.

**15.** Admission and bounded per-SKU work protect the hot authority; adding API replicas alone increases contenders. Consider safely partitioned inventory quotas.

**16.** Use a local transaction when state shares one database. Introduce a saga only across independent authorities or long-lived external work.

**17.** Reserve first limits refund exposure but holds stock during payment. Charge first risks paid orders without stock; either order needs recovery.

**18.** Central stock simplifies global availability. Disjoint regional quotas reduce contention but strand stock and require coordinated rebalancing.

**19.** Long TTL supports slow checkout but hoards inventory; short TTL improves utilization but increases late-payment compensation.

**20.** Only with verified state and compensations. Unknown payment/shipment outcomes cannot safely be treated as nonexistent.

</details>

## End-to-End Request Walkthrough

Checkout key → validate basket → transaction reserves stock and creates order/task → payment worker uses stable attempt identity → guarded payment result advances order → fulfillment operation is persisted → warehouse creates one shipment → shipment event finalizes order. Each boundary has a durable state and retry identity; failures create explicit compensation obligations.

## What If This Fails?

| Injected failure | Correctness and availability | Recovery |
| --- | --- | --- |
| Inventory cache stale | Browsing can be inaccurate; correctness holds if checkout rechecks stock. | Return sold-out at allocation and refresh cache. |
| Payment worker crashes | Order remains pending; inventory may stay held until its deadline. | Resume durable attempt and reconcile before compensation. |
| Duplicate cancellation | Unconditional release/refund could corrupt state. | Guard each compensation by its own operation identity. |
| Fulfillment dependency unavailable | Paid orders wait; they must remain discoverable. | Retry with backoff and alert on oldest pending fulfillment. |

## What Should Trigger In My Head?

**Orders →** stock allocation · legal state transitions · durable saga · idempotent compensation · one fulfillment identity.
