---
title: "Optimistic vs. Pessimistic Locking"
description: "Choose whether competing writers fail and retry or wait and serialize."
order: 2
tags: ["Trade-offs", "Decision guide"]
---

## What problem are we solving?

Two requests want to change a resource without violating a shared predicate.

## How the options work

| Option | Mechanics | Best fit |
| --- | --- | --- |
| Optimistic concurrency | Read version v, then update WHERE version=v and business predicate holds. Zero rows or serialization failure means retry/conflict. | Low contention, disconnected edits and short single-row changes. |
| Pessimistic locking | Lock the relevant rows in a transaction, recheck business state, write, commit and release locks. | Frequent conflicts or small multi-row decisions with stable lock order. |

## When is each option better?

Optimism is better when most work succeeds uncontested and retry is cheap. Pessimism can be better when speculative work is often wasted. A single conditional UPDATE itself takes database locks internally: “optimistic” describes the application’s conflict protocol, not the absence of storage locks.

## Concrete example

For A7 version 12, Alice’s UPDATE advances to 13. Bob’s version-12 UPDATE loses. For three adjacent seats, lock all three in a fixed order, verify all are free and commit all-or-nothing.

## Failure modes

Optimistic retries can livelock under a hot-key storm unless bounded/backed off. Pessimistic transactions can deadlock or hold resources while waiting for external calls. Retry the entire aborted transaction, lock rows in deterministic order, and never keep a lock open while a human or payment provider responds.

## Scale implications

Neither method creates more units of a scarce resource. Keep invariant scope narrow; bound transaction duration and admission. Cross-row predicates may need explicit parent/sentinel locks, constraints or Serializable isolation with retries; locking one existing row does not automatically prevent new matching rows.

## Interview rule of thumb

> “Where is the atomic check?” Start with a conditional write for one row. Use short ordered row locks when coordination across a small known set makes it clearer.

## Apply it

[Booking](../systems/04-booking/index.md), [Payments](../systems/05-payments/index.md), [E-commerce](../systems/06-ecommerce/index.md), [File storage](../systems/08-file-storage/index.md).

Before choosing, name the required guarantee, one failure window and the metric that would force you to revisit this decision.

