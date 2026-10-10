---
title: "Connection & Overload Budgets"
description: "Protect capacity before retries and slow consumers turn a partial failure into a total outage."
order: 7
tags: ["Mechanics", "Cross-system"]
---

## Rate is not concurrency

A service accepting 100 requests/second with 10 ms average work needs very different in-flight capacity from one with 5-second dependency calls. Bound connections, active requests and queued work separately. As latency rises, in-flight work rises even when arrival rate stays constant.

## Budget persistent connections

A million sockets require memory, file descriptors, heartbeat traffic and deploy/drain planning. Bound each output buffer. A client that cannot keep up should resume from durable history after disconnect rather than accumulating unlimited gateway memory. Reconnect with jitter and pace authentication plus catch-up reads.

## Shed work honestly

Rate limiting controls a defined burst/refill budget; concurrency limits cap simultaneous resource use; backpressure slows upstream production; load shedding rejects excess work. They solve related but different problems. A bounded queue must have an age/overflow policy.

If a dependency fails, retries consume additional capacity. Use deadlines and retry budgets, isolate tenants/destinations and avoid stacking independent retry loops at every hop. Prefer failing a nonessential projection over exhausting the authority that protects money or ownership.

Study [Messaging](../../systems/03-messaging/index.md), [Booking](../../systems/04-booking/index.md) and [Notifications](../../systems/12-notifications/index.md).

