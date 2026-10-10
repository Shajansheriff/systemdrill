---
title: "Database Concurrency"
description: "A transaction boundary is only useful when its isolation and predicates protect the invariant."
order: 2
tags: ["Mechanics", "Cross-system"]
---

## The check must survive another writer

Read Committed permits two ordinary SELECTs to observe the same available seat. A later unconditional UPDATE does not remember what the application read. Use `UPDATE ... WHERE version = :expected AND state = 'AVAILABLE'`, inspect RETURNING, and make related writes in the same transaction.

For several known rows, `SELECT ... FOR UPDATE` in a consistent order can simplify the decision. Recheck the business predicate while holding the locks. A lock on existing rows does not automatically protect arbitrary range predicates from concurrent insertions; consider constraints, a parent/sentinel lock or Serializable isolation with retry.

## Snapshot is not serialization

MVCC lets readers see a consistent snapshot while writers proceed. Two transactions can still perform write skew: each sees the other on-call doctor, and each takes itself off duty, leaving none. A cross-row invariant requires appropriate coordination; a version on each individual row is not necessarily enough.

Serializable transactions can reject executions that would violate serial equivalence, but the application must retry the whole transaction. Do not retry only the final statement using stale decisions. Deadlocks likewise require transaction retry and investigation of lock order/duration.

## Operational boundary

Keep transactions short. A five-second provider call under a row lock holds both database capacity and ownership while the network decides its fate. Persist a temporary state, release the DB transaction, and complete a guarded transition after the external result.

Study [Booking](../../systems/04-booking/index.md) and [Payments](../../systems/05-payments/index.md). Compare [optimistic and pessimistic locking](../../comparisons/optimistic-vs-pessimistic-locking.md).

