# Implementation Plan: Context Visibility

## Overview

Make the extension's runtime context store visible in the panel UI. Enrich LOG messages from background.js with context metadata (contextKey/savedValue for save steps, resolvedContext for assert steps), render these in the run log with badges and labels, and provide a Context button/popup for full store inspection. All code is ES5, global scope, no module system.

## Tasks

- [x] 1. Add context extraction utility in background.js
  - [x] 1.1 Implement `extractResolvedContext` function in background.js
    - Add function that takes a template string and contextStore object
    - Use regex `/\{\{ctx\.([^}]+)\}\}/g` to find all `{{ctx.X}}` tokens
    - Deduplicate keys (use a `seen` object) and return array of `{key, value}` objects
    - Value is `contextStore[key]` if it exists, otherwise `null`
    - Place before `emitLog` function
    - _Requirements: 3.1, 3.2_

  - [x] 1.2 Enhance `emitLog` function to include context data on save steps
    - After existing field assignments, add conditional block for save actions
    - When `ok === true` and action is `saveText`, `saveValue`, `saveAttribute`, or `saveExpression`: set `logMsg.contextKey` from `step.contextKey || step.key` and `logMsg.savedValue` from `runState.contextStore[ctxKey]`
    - When `ok === false`: do not add these fields
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [x] 1.3 Enhance `emitLog` function to include resolved context for assert steps
    - After the save-step block, check if `step.value` contains `{{ctx.`
    - If yes, call `extractResolvedContext(step.value, runState.contextStore)` and assign result to `logMsg.resolvedContext`
    - _Requirements: 3.1, 3.2_

  - [x] 1.4 Add `GET_CONTEXT` message handler in background.js
    - In the existing `handleMessage` switch, add a `case 'GET_CONTEXT':` that calls `safeSendMessage({ type: 'CONTEXT_STATE', store: runState.contextStore || {} })`
    - _Requirements: 7.1, 7.2, 7.4_

- [x] 2. Checkpoint - Verify background changes
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Add panel utility functions in panel.js
  - [x] 3.1 Implement `isSensitiveKey` function in panel.js
    - Returns `true` if the key matches `/password|secret|token|key|auth/i`
    - Place near the top of panel.js utility section
    - _Requirements: 6.1_

  - [x] 3.2 Implement `formatContextValue` function in panel.js
    - Takes `(key, value)` parameters
    - If value is null/undefined/empty string: return `<span class="ctx-value"></span>`
    - If `isSensitiveKey(key)`: return `<span class="ctx-value ctx-masked">****</span>` (no title attribute)
    - If `strVal.length > 30`: return span with first 30 chars + `"..."` and full value in `title` attribute
    - Otherwise: return span with full value, no title attribute
    - Use existing `escapeHtml` function for all output
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 5.3, 5.4, 5.5, 6.1, 6.2_

- [ ] 4. Add context rendering in log entries in panel.js
  - [ ] 4.1 Add save step cases to `buildLogEntryHtml` switch
    - Add cases for `saveText`, `saveValue`, `saveAttribute`, `saveExpression`
    - Render target element badge (reuse existing `resolveTargetLabel`/`buildElementTooltip` pattern)
    - If `logData.contextKey` exists: render `<span class="ctx-badge">ctx.{key}</span>` followed by `formatContextValue(logData.contextKey, logData.savedValue)`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

  - [ ] 4.2 Add resolved context label to default case in `buildLogEntryHtml`
    - After existing value rendering in the default case, check `logData.resolvedContext`
    - If non-empty array: build label string `"(from ctx.X, ctx.Y, ...)"` and render in `<span class="ctx-source">`
    - _Requirements: 3.3, 3.4, 3.5_

- [ ] 5. Add context popup state and logic in panel.js
  - [ ] 5.1 Add `contextStoreCache` variable and cache update logic
    - Declare `var contextStoreCache = {};` at module level
    - In the LOG message handler: if `message.contextKey !== undefined`, update `contextStoreCache[message.contextKey] = message.savedValue`
    - Add `CONTEXT_STATE` case to message handler: set `contextStoreCache = message.store || {}` and call `renderContextPopup(contextStoreCache)`
    - _Requirements: 7.3_

  - [ ] 5.2 Implement `renderContextPopup` function
    - Takes a store object
    - Gets `#context-popup-body` element
    - If no keys: render `<p class="ctx-empty">No context values stored yet.</p>`
    - Otherwise: render `<table class="ctx-table">` with one row per key, using `formatContextValue` for values
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [ ] 5.3 Implement `toggleContextPopup` function
    - Get `#context-popup` element
    - If currently visible (`display === 'block'`): hide it
    - Otherwise: send `{ type: 'GET_CONTEXT' }` via `api.runtime.sendMessage`, call `renderContextPopup(contextStoreCache)`, set `display = 'block'`
    - _Requirements: 4.5, 4.6, 7.1_

  - [ ] 5.4 Implement `updateContextPopupIfOpen` helper function
    - Check if popup is visible; if so, call `renderContextPopup(contextStoreCache)`
    - _Requirements: 5.6_

  - [ ] 5.5 Wire up Context button and popup close events
    - Attach click listener to `#context-btn` calling `toggleContextPopup`
    - Attach click listener to `#context-popup-close` to hide popup
    - Attach Escape key listener (on document) to close popup if open
    - Attach click-outside listener to close popup when clicking outside it
    - _Requirements: 4.5, 4.6, 4.7, 5.7_

- [ ] 6. Add HTML markup and CSS in panel.html
  - [ ] 6.1 Add Context button to controller bar in panel.html
    - Add `<button id="context-btn" class="btn btn-sm" aria-label="Context">🔑 Context</button>` after the Stop button in `.controller-bar`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.7_

  - [ ] 6.2 Add context popup overlay markup in panel.html
    - Add `<div id="context-popup" class="context-popup" style="display:none;">` after the controller bar
    - Include header with "Context Store" title and close button `#context-popup-close`
    - Include `<div id="context-popup-body"></div>` for dynamic content
    - _Requirements: 5.1, 5.2_

  - [ ] 6.3 Add CSS styles for context badges, values, popup, and table
    - `.ctx-badge` — green background, bold, small rounded pill
    - `.ctx-value` — muted color, italic
    - `.ctx-masked` — muted color, letter-spacing
    - `.ctx-source` — muted, small, italic
    - `.context-popup` — absolute positioned overlay with border, shadow, z-index 100, max-height 300px, overflow-y auto
    - `.context-popup-header` — flex row, space-between, border-bottom
    - `.ctx-table` — full width, collapsed borders, mono font, 12px
    - `.ctx-table td` — padding, subtle border-bottom
    - `.ctx-popup-key` — bold, nowrap
    - `.ctx-empty` — centered, padded, muted
    - _Requirements: 2.1, 5.1_

- [ ] 7. Checkpoint - Verify full integration
  - Ensure all tests pass, ask the user if questions arise.

- [ ]* 7.1 Write property test for save step LOG enrichment (Property 1)
    - **Property 1: Save step LOG messages include context data if and only if successful**
    - Generate random save step configs (action, contextKey, savedValue) and ok/fail flag
    - Verify LOG message contains contextKey+savedValue when ok=true, omits them when ok=false
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 7.3**

- [ ]* 7.2 Write property test for value truncation (Property 2)
    - **Property 2: Value display truncation**
    - Generate random strings (0–200 chars) and non-sensitive keys
    - Verify `formatContextValue` output: >30 chars → first 30 + "..." with title, ≤30 → full value no title, empty → empty element
    - **Validates: Requirements 2.2, 2.3, 2.4, 5.5**

- [ ]* 7.3 Write property test for sensitive key masking (Property 3)
    - **Property 3: Sensitive key masking**
    - Generate keys containing sensitive substrings + random values of any length
    - Verify `formatContextValue` returns `****` with no title attribute
    - **Validates: Requirements 2.5, 2.6, 5.3, 5.4, 6.1, 6.2**

- [ ]* 7.4 Write property test for sensitive key detection (Property 4)
    - **Property 4: Sensitive key detection**
    - Generate random strings (mix of sensitive/non-sensitive keys)
    - Verify `isSensitiveKey` returns true iff key contains password|secret|token|key|auth (case-insensitive)
    - **Validates: Requirements 6.1**

- [ ]* 7.5 Write property test for extractResolvedContext (Property 5)
    - **Property 5: Assert step LOG messages include all resolved context references**
    - Generate template strings with 0–5 `{{ctx.X}}` tokens and a random store
    - Verify `extractResolvedContext` returns exactly N unique entries with correct values
    - **Validates: Requirements 3.1, 3.2**

- [ ]* 7.6 Write property test for context source label rendering (Property 6)
    - **Property 6: Assert step log rendering shows context source labels**
    - Generate logData with 1–5 resolvedContext entries
    - Verify `buildLogEntryHtml` output contains "(from ctx.X, ctx.Y, ...)" with all key names
    - **Validates: Requirements 3.3, 3.4**

- [ ]* 7.7 Write property test for context popup row count (Property 7)
    - **Property 7: Context popup renders all store entries**
    - Generate random stores (1–20 entries)
    - Verify `renderContextPopup` produces table with exactly N rows
    - **Validates: Requirements 5.1**

- [ ]* 7.8 Write property test for GET_CONTEXT response (Property 8)
    - **Property 8: GET_CONTEXT response contains complete store**
    - Generate random stores (including empty)
    - Verify handler response contains all key-value pairs from store
    - **Validates: Requirements 7.2, 7.4**

- [ ] 8. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties using fast-check
- All code must be ES5 (var, function declarations, no arrow functions)
- No module system — all functions are global in background.js and panel.js
- Test files go in `packages/extension/src/` alongside source files
- Tests use `node:test` + `node:assert/strict` + `fast-check`
- Do NOT run tests in tasks — user runs `node --test` manually

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.4", "3.1", "6.1", "6.2", "6.3"] },
    { "id": 1, "tasks": ["1.2", "1.3", "3.2"] },
    { "id": 2, "tasks": ["4.1", "4.2", "5.1"] },
    { "id": 3, "tasks": ["5.2", "5.3", "5.4"] },
    { "id": 4, "tasks": ["5.5"] },
    { "id": 5, "tasks": ["7.1", "7.2", "7.3", "7.4", "7.5", "7.6", "7.7", "7.8"] }
  ]
}
```
