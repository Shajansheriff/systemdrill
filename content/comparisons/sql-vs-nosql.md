---
title: "SQL vs. NoSQL"
description: "Choose data access and consistency capabilities, not a slogan about scale."
order: 3
tags: ["Trade-offs", "Decision guide"]
---

## What problem are we solving?

Persist data with specific transactions, queries, latency and operational requirements.

## How the options work

| Option | Mechanics | Best fit |
| --- | --- | --- |
| Relational database | Rows, constraints, indexes, joins and local multi-row transactions model related state. | Orders, ledgers, ownership constraints and evolving relational queries. |
| Non-relational store | A broad family: key-value, document, wide-column and graph engines with different APIs and guarantees. | Well-known access paths, specialized data models or demonstrated distribution needs supported by a specific engine. |

## When is each option better?

Use a relational database when integrity across related rows and flexible query patterns dominate. A non-relational store can fit when its exact partition model and API align with the workload. Ask which conditional writes, transactions, consistency levels and secondary indexes the specific product actually provides.

## Concrete example

Keep a payment ledger in a store that supports the required atomic posting boundary. A high-volume immutable message history can suit a conversation-partitioned wide-column design if its durability/order/query contract fits. These are capability decisions, not universal prescriptions.

## Failure modes

Relational systems still suffer slow queries, connection exhaustion and hot rows. A key-value store still suffers hot partitions and stale replicas, and may have limited cross-key transactions. Denormalized documents duplicate facts: identify how updates propagate and which copy is authoritative.

## Scale implications

Relational databases can replicate and shard; many non-relational systems also coordinate leaders and pay for strong consistency. The real question is the partition key, transaction boundary, query fan-out and operational workload, not whether SQL syntax exists.

## Interview rule of thumb

> “What must be atomic, and how will we query it?” Name the constraint and access path first, then evaluate a concrete engine.

## Apply it

[Read-heavy](../systems/01-read-heavy/index.md), [Messaging](../systems/03-messaging/index.md), [Payments](../systems/05-payments/index.md), [Search](../systems/11-search/index.md).

Before choosing, name the required guarantee, one failure window and the metric that would force you to revisit this decision.

