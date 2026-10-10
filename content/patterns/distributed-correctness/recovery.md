---
title: "Outbox, Leases & Reconciliation"
description: "Three distinct mechanisms for three distinct failure windows."
order: 5
tags: ["Mechanics", "Cross-system"]
---

## Outbox: local state to publication

Commit the business row and outgoing event in one database transaction. A relay reads unsent events, publishes and records progress. Crash after publish but before marking sent causes duplication, so the consumer still deduplicates. Outbox removes the lost-publication window; it does not provide one remote effect.

## Fencing: old ownership to new ownership

Lease holder A has generation 7, pauses, and loses its lease. B acquires generation 8. When A resumes, its writes must carry 7 and the protected resource must reject them after seeing 8. Comparing a random lock token only during lock release is not equivalent to fencing every protected write.

For a seat row, the current hold identity and version can act as an ownership predicate in the same authoritative transition. For writes to a different storage system, that system must participate in the fencing protocol. A lease service alone cannot enforce behavior at an uncooperative resource.

## Reconciliation: local beliefs to external facts

Persist attempts before external calls. A timeout leaves UNKNOWN, so query provider state or compare settlement records using durable identities. Apply guarded transitions, and create explicit compensation obligations when the remote effect cannot legally complete the local workflow. A refund can fail too; keep its identity and unfinished state.

Each mechanism earns its place at a named boundary. Combining all three is justified only when the workflow has all three failure windows.

Study [Booking](../../systems/04-booking/index.md), [Payments](../../systems/05-payments/index.md) and [Dispatch](../../systems/07-geospatial/index.md).

