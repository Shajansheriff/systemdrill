---
title: "Atomic Blob Publication"
description: "Make large bytes immutable and coordinate only their small visible pointer."
order: 6
tags: ["Mechanics", "Cross-system"]
---

## Stage, verify, publish

An upload session owns uncommitted parts. Verify all required parts and complete the immutable object before committing a visible manifest. Store a finalization identity so a lost response returns the already published version. A failed metadata commit leaves an orphan, which is safer than a visible missing object.

## Guard concurrent versions

Publish with the expected base metadata version. If another editor already advanced it, preserve the uploaded content as a conflict version or merge under explicit rules. Do not erase another user’s edit simply because your upload finished later.

## Garbage collection is part of correctness

A momentary absence of live references is insufficient if a concurrent publisher can still acquire one. Include active uploads as roots, coordinate final deletion with reference acquisition, and use generations/grace periods with bounded operation lifetimes. A final unprotected existence check still has a race.

Authorization applies to content access even when blobs are deduplicated. A hash identifies bytes; it does not identify who is permitted to read them. Signed URLs have a lifetime and therefore an explicit revocation window unless the delivery path checks revocation separately.

Study [File storage](../../systems/08-file-storage/index.md) and [Media streaming](../../systems/10-streaming/index.md).

