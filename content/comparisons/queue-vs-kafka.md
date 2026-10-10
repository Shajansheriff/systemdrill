---
title: "Queue vs. Kafka"
description: "Choose work completion, retained history, and consumer independence deliberately."
order: 1
tags: ["Trade-offs", "Decision guide"]
---

## What problem are we solving?

One group needs to finish jobs, or several independent consumers need the same historical events?

## How the options work

| Option | Mechanics | Best fit |
| --- | --- | --- |
| Conventional work queue | Workers claim jobs, acknowledge completion and redeliver unacknowledged work. | Email delivery, image conversion and retry scheduling. |
| Kafka-style retained log | Producers append to partitions; consumer groups track independent positions; records remain until retention removes them. | Indexing plus analytics plus audit consumers, independent replay and ordered per-key event history. |

## When is each option better?

Choose a work queue when the unit is a job to finish and per-job retries/delays are central. Choose a retained log when the unit is an event that several independent readers interpret, or when rebuilding projections requires history. Modern products overlap; verify the actual acknowledgement, replay and retention semantics rather than deciding by brand.

## Concrete example

An order needs one shipment and three projections. A shipping queue can manage the action; an outbox-fed event log can feed projections. At small scale, a durable DB job table and separate consumer cursors may already meet requirements.

## Failure modes

A queue worker can crash after the effect and before ACK: delivery repeats. A log consumer can commit its sink and crash before its offset: replay repeats. Kafka transactions do not atomically include an arbitrary external database/HTTP endpoint. Both need a protected side-effect boundary.

## Scale implications

Queues scale through concurrent jobs, constrained by destination capacity. A partitioned log scales through partitions and consumer groups; one hot key remains a bottleneck and retention consumes disk. Adding consumers beyond available partition parallelism does not split a single partition’s order.

## Interview rule of thumb

> “Who needs this event, and who needs to replay it?” One completion obligation suggests a queue. Independent histories suggest a log. Neither choice removes idempotency.

## Apply it

[E-commerce](../systems/06-ecommerce/index.md), [Search](../systems/11-search/index.md), [Notifications](../systems/12-notifications/index.md), [Analytics](../systems/13-analytics/index.md).

Before choosing, name the required guarantee, one failure window and the metric that would force you to revisit this decision.

