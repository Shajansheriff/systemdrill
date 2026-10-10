# Systemdrill

An invariant-first **system design interview study book** for senior/staff engineers. Built with Next.js App Router, TypeScript and React; all study material is ordinary Markdown in Git.

## Run locally

Requires Node.js 22.13+ (Node 22 LTS recommended) and npm.

```sh
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000). For a production preview:

```sh
npm run build
npm start
```

The build statically exports every route to `out/`. Deploy that directory to any static host supporting directory indexes and a custom `404.html`. The included `npm start` server is a small **local preview** server bound to loopback, not a hardened production server. Set `PORT` to choose another preview port. No database, environment variables or external API keys are required.

## The book

- **13 system families**, each with primary/supporting invariants, concrete naive failure, 3–4 deep dives, canonical patterns, three detailed study topics, 20 progressively harder questions and hidden reasoned answers, a request walkthrough, failure injection and revision cues.
- **260 questions**: 10 conceptual, 5 scenario and 5 trade-off questions in each family.
- **Cross-system pattern index** with backlinks across ten categories and six focused mechanics guides.
- **8 comparisons**, architecture decision trees and a timed interview framework.

Start with [the interview framework](content/mental-models/interview-framework.md) or [the first chapter](content/systems/01-read-heavy/index.md).

## Repository map

```text
content/
  systems/01-read-heavy/index.md ... 13-analytics/index.md
  patterns/index.md
  patterns/{database,caching,messaging,distributed-correctness,storage,networking}/
  comparisons/                    # Eight decision sheets
  mental-models/                  # Decision trees and interview framework
app/
  page.tsx                        # Searchable family overview
  [...slug]/page.tsx              # Static collections and study pages
  globals.css                     # Responsive layout and Markdown styles
components/
  shell.tsx                       # Desktop sidebar and mobile navigation
  library.tsx                     # Search/filter cards
  markdown.tsx                    # Sanitized Markdown, links, code and tables
  mermaid.tsx                     # Lazy-loaded diagrams with source fallback
lib/content.ts                    # Filesystem content model and link resolution
scripts/                          # Content and static-export verification
```

## Edit or add content

Edit the `.md` source directly; no MDX compilation or React knowledge is required. Frontmatter:

```yaml
---
title: "My chapter"
description: "The hard problem in one sentence."
order: 1
tags: ["Correctness", "Concurrency"]
---
```

Use `##` for top-level study sections, `###` for deep dives/topics, and `####` for topic subheadings. Page titles come from frontmatter. The application renders h2 links in the table of contents and keeps the first six study sections prominent. Use the existing chapter structure as the content contract.

Keep links **relative to the Markdown file** (for example, `../../patterns/index.md`), so GitHub can follow them. The renderer rewrites them to application routes. A nested `index.md` uses its directory route; other Markdown files use their basename. The loader enumerates `content/` at build time and `generateStaticParams` pre-renders every page. Rebuild a production export after editing content.

Quiz answers use ordinary HTML `<details>` / `<summary>` with blank lines around their Markdown body. They work on GitHub and are closed by default in the app. Raw HTML is parsed then sanitized; no arbitrary MDX/JavaScript executes from content. Mermaid fences render client-side in strict security mode, with readable source if JavaScript or diagram loading is unavailable. The book itself is rendered as static HTML.

Search matches titles, descriptions and tags in the current collection; it is not a full-text index. Fonts use an optional Google Fonts CSS import with system fallbacks, so reading and navigation do not depend on a successful font request. There is no analytics, account or progress-storage service.

## Verify

```sh
npm run check:content
npm run typecheck
npm run lint
npm run build
npm run check:export
```

`check:content` checks metadata, all 13 chapter structures, deep-dive/topic fields, 260 questions and answers, and local Markdown links. `check:export` uses Python 3's standard library to inspect all generated HTML routes, links, anchors and quiz disclosures; run it after the build. Browser QA should also check search/filter behavior, mobile navigation, answer expansion and Mermaid rendering.

The lockfile pins the installed stable Next.js/React versions and all transitive dependencies. Content examples deliberately state consistency and durability assumptions. SQL snippets illustrate mechanics, not complete production schemas; vendor-specific reference links live in the [pattern index](content/patterns/index.md#primary-references).
