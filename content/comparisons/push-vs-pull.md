---
title: "Push vs. Pull"
description: "Decide who initiates work and where unused computation accumulates."
order: 4
tags: ["Trade-offs", "Decision guide"]
---

## What problem are we solving?

Propagate changes to consumers promptly without producing work no one needs.

## How the options work

| Option | Mechanics | Best fit |
| --- | --- | --- |
| Push | Producer proactively delivers or materializes updates for recipients. | Known active consumers, low-latency alerts and repeatedly read derived state. |
| Pull | Consumer requests current state or changes using a cursor. | Infrequent/unknown readers, offline catch-up and resource-constrained clients. |

## When is each option better?

Push is better when recipients are active and low-latency updates matter. Pull is better when reads are sparse or consumers naturally choose their own pace. Most robust real-time systems push hints and pull authoritative missed state after reconnect.

## Concrete example

A chat gateway pushes a new-message hint to an online phone. When the phone reconnects, it pulls messages after its last durable cursor. Push reduces latency; pull closes gaps.

## Failure modes

Push can lose connectivity, duplicate attempts or overrun a slow consumer. Pull can miss changes with a bad cursor or create synchronized polling storms. Durable history, stable IDs, cursor retention and bounded buffering matter more than the transport label.

## Scale implications

Push cost follows updates × recipients, including recipients who may ignore them. Pull cost follows refreshes × retrieval work, including empty polls. Adaptive polling, batching and active-user targeting alter the crossover.

## Interview rule of thumb

> “Will anyone use the work we precompute?” Push timely hints; retain a pull/replay path whenever missing an update matters.

## Apply it

[Feed](../systems/02-feed/index.md), [Messaging](../systems/03-messaging/index.md), [File storage](../systems/08-file-storage/index.md), [Notifications](../systems/12-notifications/index.md).

Before choosing, name the required guarantee, one failure window and the metric that would force you to revisit this decision.

