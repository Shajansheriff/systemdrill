---
title: "Consistency Levels"
description: "State exactly which observations may disagree and which decisions must serialize."
order: 8
tags: ["Trade-offs", "Decision guide"]
---

## What problem are we solving?

Define what a client may observe after writes, concurrently and during failures.

## How the options work

| Option | Mechanics | Best fit |
| --- | --- | --- |
| Linearizable operations | Each operation appears to occur at one instant between invocation and response, respecting real-time order within the defined object/service. | Ownership decisions and current-value conditional operations. |
| Causal / session guarantees | Preserve dependencies or a client’s own observed/write order under the specific contract. | Read-your-writes, monotonic reads and conversational dependencies. |
| Eventual consistency | Replicas converge if updates stop and propagation/conflict resolution succeeds; no freshness bound follows by itself. | Derived feeds, search projections and analytics where defined lag is acceptable. |

## When is each option better?

Choose coordination where an invariant needs a single decision, such as seat ownership. Use weaker reads for explicitly stale-tolerant projections. Serializable transactions concern equivalence to a serial execution; they are not automatically the same as linearizability or strict serializability.

## Concrete example

A feed post may appear five seconds late while its private visibility is checked immediately. A booking page may display stale availability while final confirmation uses a coordinated conditional write. Different paths deserve different contracts.

## Failure modes

Read-your-writes can fail on a lagging replica. Two independent regional owners can both confirm during a partition. Eventual convergence may pick one later, but that cannot undo a broken promise to the other customer. A bounded-staleness requirement needs an actual lag/freshness enforcement mechanism.

## Scale implications

Coordination across regions adds latency and may reject/block operations during partitions to preserve the invariant. Local stale reads improve availability for projections; they cannot establish current scarce-resource ownership. State RPO/RTO separately from consistency—freshness and durability are different dimensions.

## Interview rule of thumb

> “Which exact read or write needs which guarantee?” Avoid labeling an entire application simply strong or eventual.

## Apply it

[Read-heavy](../systems/01-read-heavy/index.md), [Feed](../systems/02-feed/index.md), [Booking](../systems/04-booking/index.md), [Payments](../systems/05-payments/index.md), [Analytics](../systems/13-analytics/index.md).

Before choosing, name the required guarantee, one failure window and the metric that would force you to revisit this decision.

