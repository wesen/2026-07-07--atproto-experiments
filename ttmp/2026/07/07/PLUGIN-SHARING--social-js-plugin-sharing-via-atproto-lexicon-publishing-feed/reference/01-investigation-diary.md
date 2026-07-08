---
Title: Investigation Diary
Ticket: PLUGIN-SHARING
Status: active
Topics:
    - atproto
    - lexicon
    - plugins
    - backend
    - firehose
    - oauth
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: /home/manuel/code/wesen/2026-07-07--atproto-experiments/pkg/firehose/consumer.go
      Note: Firehose decode extension (Step 1 study)
    - Path: /home/manuel/code/wesen/2026-07-07--atproto-experiments/pkg/oauth/factory.go
      Note: OAuth scope to add (Step 1 study)
    - Path: /home/manuel/code/wesen/2026-07-07--atproto-experiments/pkg/repobrowser/browser.go
      Note: Raw-JSON list/get reuse (Step 1 study)
    - Path: repo://pkg/bsky/client.go
      Note: Raw LexDo publish pattern reference
ExternalSources: []
Summary: |
    Chronological investigation diary for PLUGIN-SHARING: studying the existing atproto-experiments codebase and the browser-js-inject-vm project to design the publishing and feed side of social JS plugin sharing.
LastUpdated: 2026-07-07T00:00:00Z
WhatFor: Record the design investigation for PLUGIN-SHARING.
WhenToUse: Read before resuming work on PLUGIN-SHARING.
---





# Investigation Diary

## Goal

Capture the study and design of the publishing/feed side of social JS plugin
sharing: a custom Lexicon, an OAuth publish path, a firehose-driven plugin
feed, and local server endpoints.

## Step 1: Study existing systems and design the Lexicon + publish/feed paths

Studied the atproto-experiments codebase and the browser-js-inject-vm project
to ground the design in real file references, then wrote the design guide.

### Prompt Context

**User prompt (verbatim):** "look at ../2026-07-07--browser-js-inject-vm and [the Obsidian report]. I want to do two things: support social JS plugin sharing [and] run these JS plugins in our JS app ... Make a new docmgr ticket for each of the two parts of the task, and for each: Create a detailed analysis / design / implementation guide ... Store in the ticket and then upload to remarkable."

**Assistant interpretation:** Create two docmgr tickets (PLUGIN-SHARING for publish/feed, PLUGIN-RUNTIME for browser execution), write intern-ready design guides grounded in the existing code, and upload to reMarkable.

**Inferred user intent:** A design blueprint connecting the ATProto publishing work with the browser plugin VM, so an intern can implement social plugin sharing end-to-end.

### What I did
- Read the Obsidian deep-dive report on browser-js-inject-vm (the plugin VM, feed middleware, security model).
- Read browser-js-inject-vm source: `manifest.ts` (PluginManifestEntry + ?raw imports), `feed-keyword-lens.vm.js` (bundle shape), `contracts.ts` (RuntimeBundleMeta, hook contracts), `runtimeService.ts` (`loadRuntimeBundle` load seam), the README (the explicit "no network loading" limitation).
- Read atproto-experiments source: `firehose/consumer.go`, `repobrowser/browser.go` (raw-JSON decode fix), `oauth/factory.go` (DPoP + persistent store), `server/server.go` (ServeMux + ring buffer).
- Read ATProto specs: `lexicon.md`, `nsid.md`, `repository.md` to ground the Lexicon/NSID design.
- Designed the `dev.atproto-demo.plugin` Lexicon (record schema with inline source + optional blob).
- Designed the publish path (raw `LexDo` createRecord, reusing the REPO-BROWSER raw approach), the feed path (firehose decode + ring buffer), and the server endpoints.
- Wrote the 13-section design guide.

### Why
The design must be grounded in the real code so an intern can implement without rediscovering the raw-JSON decode lesson, the OAuth scope mechanism, or the load seam.

### What worked
- The browser VM's `loadRuntimeBundle(code: string)` seam made the split clean: PLUGIN-SHARING supplies bytes, PLUGIN-RUNTIME consumes them.
- The REPO-BROWSER raw-JSON pattern directly applies to both decoding plugin records from the firehose and publishing them via createRecord.

### What didn't work
- N/A (design-only step; no code run).

### What I learned
- indigo's typed wrappers reject custom `$type`s in BOTH directions (list/get AND createRecord). The raw `LexDo` + map[string]any approach is the universal pattern for custom Lexicons.
- NSID `dev.atproto-demo.plugin` is syntactically valid (hyphens allowed in domain authority segments).
- Feed summaries should exclude `source` (size); fetch on demand (mirrors repo browser's list/get split).

### What was tricky to build
- Choosing the storage model: inline `source` string vs blob. Decided on both fields in the Lexicon, inline path in v1, to keep `getRecord` one-shot while remaining forward-compatible.

### What warrants a second pair of eyes
- The publish body's `repo` field: the handler must substitute the OAuth `AccountDID` (the pseudocode uses a placeholder). Confirm the SDK client exposes its own DID.
- PDS behavior for unknown `$type`s: bsky.social accepts generically-typed records, but document the caveat that a PDS may validate/reject.

### What should be done in the future
- Implement the blob path (`sourceBlob`) for large plugins.
- Add `?action=delete` scope for plugin removal.
- A backfill via listRecords to cover firehose gaps.

### Code review instructions
- Read `design-doc/01-...md` §6 (backend) and §4 (Lexicon).
- Validate the NSID against `sources/specs/nsid.md`.
- Confirm `pkg/repobrowser/browser.go` `ListRecords`/`GetRecord` are reusable unchanged for the list/record endpoints.

### Technical details
- No code commit (design-only). Design guide: `design-doc/01-social-js-plugin-sharing-design-implementation-guide.md`.
