---
title: "Fan-out on Write vs. Read"
description: "Place feed assembly cost where audience skew and activity make it affordable."
order: 5
tags: ["Trade-offs", "Decision guide"]
---

## What problem are we solving?

Construct timelines from followed authors under a predictable read-latency budget.

## How the options work

| Option | Mechanics | Best fit |
| --- | --- | --- |
| Fan-out on write | Publishing a post inserts its reference into many follower timeline indexes. | Ordinary authors with active followers and frequent feed reads. |
| Fan-out on read | Opening a timeline retrieves recent posts from followed authors and merges/ranks them. | Huge audiences, many inactive followers or low read frequency. |

## When is each option better?

Write fan-out improves common read latency when precomputation is reused. Read fan-out avoids enormous or unused write amplification. A hybrid pushes ordinary authors and pulls exceptional high-fan-out authors; its threshold should reflect active audience, post/read rates and measured cost.

## Concrete example

Push a normal author to 200 active followers. Pull a celebrity’s last few posts into the reader’s candidate merge. Rank the merged set and paginate with a defined session/cursor policy.

## Failure modes

Push workers may crash mid-batch or duplicate references; checkpoint ranges and enforce unique viewer/post IDs. Pull requests can fan out to too many authors and exceed deadlines; bound candidate retrieval. Neither mode removes read-time authorization or deletion filtering.

## Scale implications

At 1,000 posts/second × 500 active followers, push adds 500,000 references/second. One 100-million-follower author can dominate a burst. Read cost grows with followed authors and refresh rate. Store bounded recent timelines and rebuild inactive users on return where the product allows.

## Interview rule of thumb

> “What is the follower distribution, not just the average?” Explain the celebrity tail before choosing a universal strategy.

## Apply it

[Feed](../systems/02-feed/index.md).

Before choosing, name the required guarantee, one failure window and the metric that would force you to revisit this decision.

