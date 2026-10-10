---
title: "Durable Delivery"
description: "Define the acknowledgement, replay and side-effect boundaries separately."
order: 4
tags: ["Mechanics", "Cross-system"]
---

## Acknowledge a specific fact

A producer ACK can mean durable acceptance, while a consumer ACK can mean completed processing. A TCP ACK means neither. State what survives a process crash, primary failure or regional loss before claiming durability.

A visibility timeout lets a failed worker’s job return to circulation. It does not stop a paused worker. After lease expiry, two attempts may overlap; a stable logical job ID and protected effect boundary remain necessary.

## Close the effect gap

If the worker performs an effect then ACKs, a crash between them repeats the effect. If it ACKs first, a crash loses the effect. Use a transactional inbox + local effect, a versioned replacement sink, or downstream idempotency for external effects. Queue-level deduplication cannot atomically couple your queue to an arbitrary HTTP service.

## Recover without a storm

Bound retries by age/attempt policy and use exponential backoff with jitter. Isolate destinations and tenants. A poison message belongs in observable failed state with a repair/replay path; a DLQ is not evidence that the business action succeeded.

Study [Messaging](../../systems/03-messaging/index.md), [Webhooks](../../systems/12-notifications/index.md) and [Analytics](../../systems/13-analytics/index.md).

