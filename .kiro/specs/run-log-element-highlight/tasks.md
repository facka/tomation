# Implementation Plan: Run Log Element Highlight

## Overview

This plan builds the feature bottom-up so nothing is orphaned. It starts on the Runtime side in the ES5 content script (`packages/extension/src/runtime.js`): first the `tomation-key` tagging helper wired into every element-resolving branch of the `EXECUTE_STEP` listener, then the hover-style injector and the synchronous `HOVER_HIGHLIGHT` / `HOVER_CLEAR` handlers with their pure helpers. Next come the TypeScript content-script message contract types (`messages.ts`), then the panel composable `useElementHighlight.ts` that talks to the content script directly, and finally the `LogEntry.vue` hover handlers and inline Element_Removed_Message. Property-based and example tests are interleaved as optional sub-tasks placed close to the code they validate. A final single-shot `vue-tsc` type-check confirms the panel types compile.

Two source styles are in play and must be respected:
- `packages/extension/src/runtime.js` is plain ES5-style JS (`var`, function declarations, no TS).
- `packages/extension/panel-vue/src/**` is TypeScript/Vue.

No packaging/deployment tasks are included — the change integrates into the existing extension build (`packages/extension/build.js` already bundles `runtime.js` and the panel). Per the design's key architecture decision, **`background.js` is not changed**: the panel messages the content script directly.

## Test Execution Rules (READ BEFORE RUNNING ANYTHING)

- The developer runs all tests **manually**. The tooling/assistant MUST NOT run `node --test` or any test command.
- The tooling/assistant MUST NOT run `node -c` (syntax check) on any file.
- Property-based tests use **fast-check** with **`node:test`**, run under **jsdom**, and MUST be configured with **≥100 iterations** (`{ numRuns: 100 }` or more).
- Every property test MUST be tagged with a comment in the form:
  `// Feature: run-log-element-highlight, Property <n>: <property text>`
- Runtime property/example tests live in `packages/extension/src/runtime.property.test.js` (extend the existing file); panel property/unit tests live alongside the panel source under `packages/extension/panel-vue/src/**`.
- The one allowed non-test command is a single-shot panel type-check: `npx vue-tsc --noEmit` run in `packages/extension/panel-vue` (task 8). It is not a test and not a watcher.

## Tasks

- [x] 1. Runtime: tag resolved elements with the element key
  - [x] 1.1 Add the `tagElementKey(el, key)` helper to `runtime.js`
    - Define `tagElementKey(el, key)` next to `highlightElement`; when `key` is a non-empty string, call `el.setAttribute('tomation-key', key)` with the raw key value; no-op otherwise
    - `setAttribute` is idempotent, so re-resolving leaves exactly one `tomation-key` with the current key; the helper must not touch `data-tomation-active`
    - _Requirements: 1.1, 1.2, 1.4_
  - [x] 1.2 Call `tagElementKey` before `highlightElement` at every element-resolving branch of the `EXECUTE_STEP` listener
    - In the generic `ACTIONS_NEEDING_ELEMENT` branch, call `tagElementKey(element, message.target)` immediately before `highlightElement(element)`
    - In the `pressKey`-with-`target` branch, call `tagElementKey(element, message.target)` before its `highlightElement(element)`
    - In `assertNotExists`, call `tagElementKey` only when `findResult.ok` is true (an element was actually resolved); do not tag on the passing "not found" path
    - Do not tag on a failed find (`findResult.ok` false), and leave existing `tomation-key` values elsewhere on the page unchanged
    - _Requirements: 1.1, 1.3, 1.5, 2.1_
  - [x] 1.3 Confirm `unhighlightElement` persists the tag on step completion
    - Verify/keep `unhighlightElement` removing only `data-tomation-active` and never `tomation-key`, so the tag persists after the step and after the run
    - Verify/keep `highlightElement` / `unhighlightElement` unchanged in their action-highlight behavior
    - _Requirements: 1.6, 2.2, 2.3, 2.5_
  - [ ]* 1.4 Write property tests for tagging behavior
    - **Property 1: Tag equals the raw element key** (Validates Requirements 1.1)
    - **Property 2: Tagging is idempotent — exactly one key attribute** (Validates Requirements 1.4)
    - **Property 3: No tag for empty or missing keys** (Validates Requirements 1.2)
    - Generate random valid keys and empty/whitespace/undefined/missing keys; developer runs the tests manually
    - _Requirements: 1.1, 1.2, 1.4_
  - [ ]* 1.5 Write property test that tagging does not change which element is resolved
    - **Property 4: Tagging does not change which element is resolved**
    - **Validates: Requirements 1.5**
    - Assert `findElementWithParent`/`findElement` resolve the same element with and without `tomation-key` present on candidates, and that `tomation-key` is never evaluated as a `where` matcher key; developer runs the tests manually
    - _Requirements: 1.5_
  - [ ]* 1.6 Write example test that a failed find leaves no tag
    - A descriptor that cannot resolve leaves no `tomation-key` on any element; developer runs the test manually
    - _Requirements: 1.3_

- [x] 2. Runtime: hover style injection and hover message handlers
  - [x] 2.1 Add the self-invoking `injectHoverStyles()` hover-style injector
    - Add a second self-invoking style injector alongside `injectHighlightStyles()`, targeting `[data-tomation-hover="true"]` with a distinct color (dashed amber outline + amber box-shadow) so it differs from the action highlight's indigo in at least one outline/box-shadow color, and both remain individually observable when applied to the same element
    - Append to `document.head || document.documentElement`; do not modify the existing action-highlight style block
    - _Requirements: 2.4, 7.1, 7.2_
  - [x] 2.2 Add the pure hover helpers `hoverSelectorFor`, `isInViewport`, `handleHoverHighlight`, `handleHoverClear`
    - `hoverSelectorFor(key)`: build `[tomation-key="…"]` using `CSS.escape` when available, with a minimal `"`/`\` fallback, so quotes/backslashes cannot break the selector
    - `isInViewport(el)`: read `getBoundingClientRect` and `window.innerHeight/innerWidth` defensively
    - `handleHoverHighlight(key)`: `querySelectorAll(hoverSelectorFor(key))`; on zero matches return `{ type: 'HOVER_RESULT', found: 0 }` and touch nothing; otherwise set `data-tomation-hover="true"` on all matches, `scrollIntoView({ block: 'nearest' })` the first match only when it is off-screen, and return `{ type: 'HOVER_RESULT', found: matches.length }`
    - `handleHoverClear()`: remove `data-tomation-hover` from every `[data-tomation-hover]` element (leaving zero) without touching `data-tomation-active`; return `{ ok: true }`
    - Export the new pure functions for testing wherever `runtime.js` already exports functions for tests
    - _Requirements: 3.2, 3.4, 3.5, 3.6, 3.7, 3.8, 4.2, 4.4, 6.3, 6.4, 7.3, 7.4_
  - [x] 2.3 Wire `HOVER_HIGHLIGHT` and `HOVER_CLEAR` into the `onMessage` listener
    - Handle `message.type === 'HOVER_HIGHLIGHT'` by `sendResponse(handleHoverHighlight(message.key))` and returning synchronously; handle `message.type === 'HOVER_CLEAR'` by `sendResponse(handleHoverClear())` and returning synchronously
    - Place both branches before the `EXECUTE_STEP` early-return guard so they never interfere with the asynchronous execute-step path (which returns `true`)
    - A request delivered to a tab with no runtime is simply never received, so no attribute is applied and the DOM is unchanged
    - _Requirements: 3.10, 6.3, 6.4_
  - [ ]* 2.4 Write property tests for hover apply/clear
    - **Property 6: Hover highlight is applied to every matching element** (Validates Requirements 3.2, 3.5, 6.4)
    - **Property 7: No match applies nothing and reports not-found** (Validates Requirements 3.4, 6.3)
    - **Property 8: Clear removes the hover highlight from every carrier** (Validates Requirements 4.2)
    - jsdom + exported `handleHoverHighlight` / `handleHoverClear`; generators produce random counts of matching/non-matching elements and arbitrary hover-carrier sets; developer runs the tests manually
    - _Requirements: 3.2, 3.4, 3.5, 4.2, 6.3, 6.4_
  - [ ]* 2.5 Write property test for attribute independence
    - **Property 5: The three attributes are mutually independent**
    - **Validates: Requirements 1.6, 2.3, 2.5, 4.4, 7.4**
    - Drive sequences of tag / `highlightElement` / `unhighlightElement` / hover-clear operations and assert each of `tomation-key`, `data-tomation-active`, `data-tomation-hover` changes only via its own operation; developer runs the test manually
    - _Requirements: 1.6, 2.3, 2.5, 4.4, 7.4_
  - [ ]* 2.6 Write property test that hover does not mutate action or author styles
    - **Property 11: Applying the hover highlight does not mutate action or author styles**
    - **Validates: Requirements 7.3**
    - Apply hover to elements with generated author inline styles/classes; assert only `data-tomation-hover` was added and the injected action-highlight style block is unchanged; developer runs the test manually
    - _Requirements: 7.3_
  - [ ]* 2.7 Write example/edge tests for fixed hover behaviors
    - Action highlight: `highlightElement` sets `data-tomation-active="true"`, `unhighlightElement` removes it on both step outcomes (Req 2.1, 2.2)
    - Injected styles: both `<style>` blocks exist, target `[data-tomation-active="true"]` and `[data-tomation-hover="true"]` respectively, differ in at least one outline/box-shadow color, and both attributes can coexist on one element (Req 2.4, 7.1, 7.2)
    - Scroll branches (stub `getBoundingClientRect`, spy `scrollIntoView`): off-screen first match scrolls, on-screen match does not, multiple matches scroll only the first (Req 3.6, 3.7, 3.8)
    - Navigation: replacing the jsdom document drops all prior `tomation-key` tags; assert `base-manifest.js` registers `runtime.js` for `<all_urls>` at `document_idle` (Req 6.1, 6.2)
    - Developer runs the tests manually
    - _Requirements: 2.1, 2.2, 2.4, 3.6, 3.7, 3.8, 6.1, 6.2, 7.1, 7.2_

- [ ] 3. Checkpoint - Ensure all runtime tests pass
  - Ensure all tests pass, ask the user if questions arise. (Developer runs tests manually; do not run `node --test` or `node -c`.)

- [x] 4. Panel types: content-script hover message contract (`messages.ts`)
  - [x] 4.1 Add the hover message contract types to `messages.ts`
    - Add `HoverHighlightMessage` (`{ type: 'HOVER_HIGHLIGHT'; key: string }`), `HoverClearMessage` (`{ type: 'HOVER_CLEAR' }`), the `ContentScriptHoverMessage` union, `HoverResult` (`{ type: 'HOVER_RESULT'; found: number }`), and `HoverClearResult` (`{ ok: true }`)
    - Document them as a distinct content-script contract, separate from and not added to `PanelMessage` / `BackgroundMessage`
    - _Requirements: 3.4_

- [x] 5. Panel composable: `useElementHighlight.ts` (new)
  - [x] 5.1 Create the module-level singleton composable
    - New file `packages/extension/panel-vue/src/composables/useElementHighlight.ts` with module-level `pendingTimer` and `activeKey` state shared across all rows
    - `queryActiveTabId()`: use `api.tabs.query({ active: true, currentWindow: true })` in callback form (matching `getActiveTabUrl`), wrapped in try/catch, resolving to `null` when there is no active tab
    - `sendToRuntime(msg)`: query the active tab, and when a tab id exists send via `api.tabs.sendMessage(tabId, msg)`; swallow every failure (no tab, rejection, throw) to `null`
    - `highlight(key)`: enforce a 100ms debounce; cancel any pending debounce; when a different key was active, clear it before starting the next highlight; resolve to the runtime's `found` count or `null`
    - `clear()`: cancel any pending debounce and send `HOVER_CLEAR`, resetting `activeKey`
    - Import the hover message types from `messages.ts`
    - _Requirements: 3.1, 4.1, 4.3, 5.1, 5.2, 5.3, 3.10_
  - [ ]* 5.2 Write property tests for the coordinator
    - **Property 9: At most one element key is hover-active at a time** (Validates Requirements 4.3) — drive a generated sequence of distinct keys through the coordinator with a stubbed `api.tabs` recording a message log; assert a `HOVER_CLEAR` for the previous key precedes the `HOVER_HIGHLIGHT` for the next
    - **Property 10: Undeliverable hover requests are swallowed** (Validates Requirements 3.10, 5.2, 5.3) — generate failure modes (no active tab, `sendMessage` rejects, call throws) and assert `highlight`/`clear` resolve without throwing and surface no error
    - Developer runs the tests manually
    - _Requirements: 3.10, 4.3, 5.2, 5.3_
  - [ ]* 5.3 Write example tests for debounce timing and single-request behavior
    - With fake timers: dwell < 100ms sends nothing; dwell = 100ms sends exactly one `HOVER_HIGHLIGHT`; pointer-leave sends exactly one `HOVER_CLEAR` and cancels any pending debounce; a reachable active tab receives the message directly (no relay hop)
    - Developer runs the tests manually
    - _Requirements: 3.1, 4.1, 5.1_

- [x] 6. Panel component: `LogEntry.vue` hover handlers and inline message
  - [x] 6.1 Add hover state, predicates, and handlers to `LogEntry.vue`
    - Use `useElementHighlight`, a local `showRemovedMessage` ref, and a `hovering` flag
    - `elementKey` computed: the row's non-empty `target` or `null` (Req 3.3)
    - `ELEMENT_RESOLVING_ACTIONS` set mirroring the runtime element-dependent actions plus `presskey`; `stepResolvedElement(entry)` returns true only when `target` is non-empty, the lowercased action is in the set and is not `assertnotexists`, and `status === 'pass'`
    - `onPointerEnter`: return when there is no Element_Key; set `hovering = true`, reset the message, call `highlight(key)`, and after it resolves ignore late results when `!hovering`, otherwise show the Element_Removed_Message only when `found === 0 && stepResolvedElement(entry)`
    - `onPointerLeave`: set `hovering = false`, hide the message, and call `clear()`
    - `onBeforeUnmount`: when still hovering, clear the outstanding hover before the row is removed
    - _Requirements: 3.3, 3.9, 4.1, 4.5, 6.5, 8.1, 8.2, 8.3, 8.4_
  - [x] 6.2 Wire the template handlers and inline Element_Removed_Message
    - Attach `@pointerenter="onPointerEnter"` and `@pointerleave="onPointerLeave"` to the root `.log-entry` element
    - Render the inline Element_Removed_Message beneath the row (guarded by `showRemovedMessage`), associated with the specific row rather than as a global notification; register any new icon used in `packages/extension/panel-vue/src/icons.ts`
    - _Requirements: 8.4, 8.5_
  - [ ]* 6.3 Write property test for the removed-message predicate
    - **Property 12: Element_Removed_Message iff step resolved an element and no match remains**
    - **Validates: Requirements 8.1, 8.2, 8.3, 6.5**
    - Generate entries varying `action` (element-resolving, non-element, `assertNotExists`), `status`, and `target`, plus a `found` count; assert message visibility equals `stepResolvedElement(entry) && found === 0`; developer runs the test manually
    - _Requirements: 6.5, 8.1, 8.2, 8.3_
  - [ ]* 6.4 Write example tests for `LogEntry.vue` lifecycle and message placement
    - Mount, hover, unmount → a `HOVER_CLEAR` is issued (Req 4.5); pointer-leave hides the message (Req 8.4); the message renders inline inside the log-entry row, not as a global element (Req 8.5)
    - Developer runs the tests manually
    - _Requirements: 4.5, 8.4, 8.5_

- [ ] 7. Checkpoint - Ensure all panel tests pass
  - Ensure all tests pass, ask the user if questions arise. (Developer runs tests manually; do not run `node --test` or `node -c`.)

- [ ] 8. Verify panel types compile
  - Run the single-shot type-check `npx vue-tsc --noEmit` in `packages/extension/panel-vue` to confirm the new `messages.ts` types, `useElementHighlight.ts`, and `LogEntry.vue` changes type-check. This is a single-execution non-test command (not a watcher and not a test runner) and is allowed.
  - _Requirements: 3.4_

## Notes

- Tasks marked with `*` are optional test tasks and can be skipped for a faster MVP; core implementation tasks are never optional.
- Each task references specific requirement sub-clauses for traceability; each property test task references a numbered design Property.
- Property tests use fast-check (≥100 iterations) under jsdom with `node:test`, tagged `// Feature: run-log-element-highlight, Property <n>: ...`, and live in `runtime.property.test.js` (runtime P1–P8, P11) or beside the panel source (panel P9, P10, P12 plus composable/LogEntry examples).
- The developer runs tests manually. Tooling must NOT run `node --test` or `node -c`. The only allowed command is the single-shot `npx vue-tsc --noEmit` in task 8.
- No packaging/deployment tasks and no `background.js` change: the panel messages the content script directly, and the feature integrates into the existing `packages/extension/build.js` bundling of `runtime.js` and the panel.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "4.1"] },
    { "id": 1, "tasks": ["1.2", "2.2"] },
    { "id": 2, "tasks": ["1.3", "2.3", "5.1"] },
    { "id": 3, "tasks": ["1.4", "1.5", "1.6", "2.4", "2.5", "2.6", "2.7", "5.2", "5.3"] },
    { "id": 4, "tasks": ["6.1"] },
    { "id": 5, "tasks": ["6.2", "6.3"] },
    { "id": 6, "tasks": ["6.4"] }
  ]
}
```
