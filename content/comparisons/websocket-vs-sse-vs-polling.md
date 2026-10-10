---
title: "WebSocket vs. SSE vs. Polling"
description: "Match connection direction and update frequency to the simplest recoverable transport."
order: 6
tags: ["Trade-offs", "Decision guide"]
---

## What problem are we solving?

Deliver timely updates through unreliable connections and intermediaries.

## How the options work

| Option | Mechanics | Best fit |
| --- | --- | --- |
| WebSocket | One persistent bidirectional connection with application-defined messages and resume semantics. | Chat, interactive editing and frequent client/server exchange. |
| SSE | Server sends a text event stream over HTTP; client writes use separate requests; event IDs can support resumption. | Server-to-client status, notifications and streaming updates. |
| Polling / long polling | Client repeatedly requests changes; long polling holds until data/deadline, then reconnects. | Low update frequency, simple infrastructure or compatibility fallbacks. |

## When is each option better?

WebSocket fits genuinely bidirectional high-frequency work. SSE is simpler when only the server streams events. Polling may be cheapest for rare updates. Browser/HTTP/proxy connection limits vary; verify the deployment path instead of memorizing one universal connection limit.

## Concrete example

A deployment-status page can use SSE with a last-event ID. A collaborative editor uses WebSocket for edits in both directions. A rarely changing report can poll every minute with jitter and conditional requests.

## Failure modes

Every option disconnects. A reconnect feature alone does not create durable history: define event IDs, replay retention, authorization refresh and a gap response. Proxies may buffer or time out streams. Bound send buffers and use heartbeat/deadline policy appropriate to the transport.

## Scale implications

Persistent connections consume memory/file descriptors and need graceful draining. Polling costs idle requests and can synchronize bursts. Long polling reduces idle response traffic but keeps requests open. Model connections, message rate, buffer size and reconnect storms separately.

## Interview rule of thumb

> “Which direction, how often, and how do we resume?” Choose the transport after the durability/cursor contract.

## Apply it

[Messaging](../systems/03-messaging/index.md), [Collaboration](../systems/09-collaboration/index.md), [Notifications](../systems/12-notifications/index.md).

Before choosing, name the required guarantee, one failure window and the metric that would force you to revisit this decision.

