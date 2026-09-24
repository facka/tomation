# Implementation Plan: Network Usage Tracking

## Overview

This plan builds the feature outward from the pure, testable core toward full integration. It starts
with the pure capture helpers and the attribution resolver (property-tested in isolation), then adds
the CDP-backed `Network_Capture_Service`, background integration, the DSL `AssertRequest` surface, the
compiler pass-through, the pure `Request_Matcher` family and assertion evaluation, the panel store and
Vue display components, persistence of run results, and finally an end-to-end wiring pass that connects
DSL → compiler → background capture/assert → panel display + persistence with no orphaned code.

The implementation language is JavaScript (background/DSL/compiler/storage in the existing ES5-ish
`module.exports` test-hook style; panel in TypeScript + Vue 3), matching the design and codebase. Tests
use Node's built-in test runner plus an established JS property-based testing library; per the workspace
rule, the author writes and runs tests manually — task steps say "write and run tests" but do not
instruct running any specific CI command.

## Tasks

- [x] 1. Pure capture helpers (`packages/extension/src/networkCapture.js` [new], exported via `module.exports`)
  - [ ] 1.1 Implement `shouldCapture(resourceType)` and body/URL caps
    - Create `packages/extension/src/networkCapture.js` and export pure helpers via `module.exports` (background test-hook convention).
    - `shouldCapture(resourceType)`: returns `true` only for `'XHR'`/`'Fetch'`, `false` for `Image`/`Script`/`Stylesheet`/`Font`/`Media`/any other value.
    - `capBody(body)`: return `{ value, truncated }` where `value` is the first 1,048,576 bytes and `truncated` is `true` iff the byte length exceeds 1 MB.
    - URL cap: cap URL to the leading 8,192 characters when building the record.
    - _Requirements: 1.2, 1.3, 1.4_
  - [ ] 1.2 Implement `buildCapturedRequest(cdpParams, attribution, seq)`
    - Assemble a `CapturedRequest` from CDP `requestWillBeSent` params + locked attribution + `initiatedAt = seq`.
    - Parse query params from the URL (repeat keys → array), capture method verbatim, apply URL cap and `capBody` to the request body, set `requestBodyTruncated`.
    - Initialize `status = null`, empty `responseBody`, `responseBodyTruncated = false`, `bodyUnavailable = false` (filled at completion).
    - _Requirements: 1.3, 1.4, 4.1, 4.2, 5.7_
  - [ ]* 1.3 Write property test for capture scope
    - **Property 1: Capture scope excludes static assets**
    - **Validates: Requirements 1.2**
    - Write and run the property test against `shouldCapture` (min 100 iterations); tag it `Feature: network-usage-tracking, Property 1`.
  - [ ]* 1.4 Write property test for URL length bound
    - **Property 2: URL length bound**
    - **Validates: Requirements 1.3**
    - Assert `CapturedRequest.url` length ≤ 8192 and equals the leading prefix of the original URL.
  - [ ]* 1.5 Write property test for body cap and truncation flag
    - **Property 3: Body cap and truncation flag**
    - **Validates: Requirements 1.4**
    - Assert `capBody(b)` byte length ≤ 1,048,576, equals the first 1 MB of `b`, and `truncated` iff `b` exceeds 1 MB.

- [x] 2. Attribution resolver (pure) + background run-state tracking
  - [ ] 2.1 Implement `resolveAttribution(snapshot)` (pure)
    - Add `resolveAttribution(snapshot)` to `packages/extension/src/networkCapture.js` (or `background.js` test hooks per design), reading `{ stepIndex, stepsLength, executing, steps, lastExecutedIndex }`.
    - Executing step → its index + `_taskPath` (`null` when `_taskPath` is empty); else most-recently-executed index; else `{ stepIndex: null, taskPath: null }`.
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_
  - [ ] 2.2 Add `runState.executing` / `runState.lastExecutedIndex` tracking in `background.js`
    - Set `runState.executing = true` right before dispatching a step (`sendStepToRuntime`/background step handlers) and `false` when it resolves.
    - Update `runState.lastExecutedIndex` on each step completion; initialize both in `resetRunState`.
    - _Requirements: 4.1, 4.3_
  - [ ]* 2.3 Write property test for attribution resolver
    - **Property 5: Attribution resolver correctness**
    - **Validates: Requirements 4.2, 4.3, 4.4, 4.5**
  - [ ]* 2.4 Write property test for attribution locking across response timing
    - **Property 4: Attribution is locked at initiation regardless of response timing**
    - **Validates: Requirements 4.1**
    - Drive interleavings of step transitions and init/complete events; assert completed records keep the initiation-time attribution.

- [x] 3. `Network_Capture_Service` lifecycle + CDP event handling (`packages/extension/src/networkCapture.js` / `background.js`)
  - [ ] 3.1 Implement `networkState` + attach lifecycle
    - Add the per-run `networkState` (attached, tabId, inFlight, captured, attributionCounter, listeners) and `resetNetworkState()`.
    - `attachNetworkCapture(tabId)`: `chrome.debugger.attach({tabId}, '1.3')` then `Network.enable`, register `onEvent`/`onDetach` listeners; 5s attach timeout and `lastError` handling both emit an `attach-error` capture log and resolve `false` (run continues without capture).
    - `getCapturedRequests()` returns a copy of `networkState.captured`.
    - _Requirements: 2.1, 2.2, 2.5_
  - [ ] 3.2 Implement CDP `onEvent` dispatch + correlation map
    - Single `onEvent` listener dispatching `requestWillBeSent` (filter via `shouldCapture`, build in-flight record with locked attribution + `initiatedAt`), `responseReceived` (record status), `loadingFinished` (fetch body via `Network.getResponseBody`, apply `capBody`/unavailable, finalize + emit), `loadingFailed` (status `null`, body unavailable, emit).
    - Correlate by `requestId` through `networkState.inFlight`; move finalized records into `networkState.captured`.
    - _Requirements: 1.1, 1.3, 1.4, 1.5, 4.1, 5.8_
  - [ ] 3.3 Implement `detachNetworkCapture()` + `onDetach` handling
    - `detachNetworkCapture()`: unregister listeners, `chrome.debugger.detach`, ignore `lastError`, mark detached (banner removed by Chrome, Req 3.2).
    - `onDebuggerDetach(source, reason)`: ignore non-matching tabs; `target_closed` → `capture-ended` log (no error); other reasons → `detached` log with reason; retain prior captures and continue.
    - _Requirements: 2.3, 2.4, 2.6, 2.7, 3.2_
  - [ ]* 3.4 Write unit tests for capture lifecycle and events (mocked `chrome.debugger`)
    - Attach success + `Network.enable`; attach timeout / already-attached → `attach-error` + continue (2.1, 2.5).
    - Event branches: XHR/Fetch kept vs static dropped; response status; body-unavailable finalization; `loadingFailed` → `status null` (1.1, 1.2, 1.3, 1.5, 5.8).
    - Detach on complete; `onDetach` `target_closed` vs external reason (2.3, 2.6, 2.7).
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 2.1, 2.3, 2.5, 2.6, 2.7, 5.8_

- [x] 4. Background integration: wire capture into the run lifecycle (`packages/extension/src/background.js`)
  - [x] 4.1 Attach on run start; reset network state
    - Call `attachNetworkCapture(lockedTabId)` in `startRun`/`startAutomationRun` right after `lockTab` resolves; call `resetNetworkState()` in `resetRunState`.
    - _Requirements: 2.1, 2.2_
  - [x] 4.2 Detach on completion and every early-exit path
    - Call `detachNetworkCapture()` in `finishRun` and every halt/early-exit path (stopped/failed/interrupted/navigation-timeout) alongside `teardownTabTracker()`/`unlockTab()`.
    - _Requirements: 2.3, 2.4_
  - [x] 4.3 Emit `NETWORK_REQUEST` messages and capture-service log entries
    - Add `emitNetworkRequest(rec)` → `safeSendMessage({ type: 'NETWORK_REQUEST', request: rec })`; call it when each record finalizes.
    - Add `emitCaptureLog(kind, info)` for `attached`/`attach-error`/`capture-ended`/`detached` info rows (Run_Log entries, not step rows).
    - _Requirements: 2.5, 2.6, 2.7, 5.1_
  - [ ]* 4.4 Write unit tests for background capture integration (mocked `api`)
    - Attach-after-lock, detach-on-finish and on an early-exit path, reset clears state, `NETWORK_REQUEST` emitted on finalize, capture logs emitted for each lifecycle kind.
    - _Requirements: 2.1, 2.3, 2.4, 2.5, 5.1_

- [ ] 5. Checkpoint — capture core
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. DSL `AssertRequest` builder (`packages/dsl/index.js` + `packages/dsl/index.d.ts`)
  - [ ] 6.1 Implement the `AssertRequest` builder in `index.js`
    - Fluent builder returning `{ __step: true, action: 'assertRequest', matcher, expectation }`; URL arg → `exact`/`regex`/`glob` criterion; default `expectation.kind = 'exists'`.
    - Chainable methods: `method`, `query`, `jsonBody`, `formBody`, `rawBody`, `status` (int / `Nxx` / `{min,max}`), `notMade`, `times(n)`.
    - Export `AssertRequest` from the DSL entry point alongside existing builders.
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.6, 6.7, 6.9, 6.10, 7.3, 8.1_
  - [ ] 6.2 Add `index.d.ts` type declarations
    - Add `UrlCriterion`, `StatusCriterion`, `BodyCriterion`, `RequestMatcher`, `RequestExpectation`, `AssertRequestBuilder`, the `assertRequest` step-union member, and `export declare function AssertRequest(...)`.
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.6, 6.7, 6.9, 6.10, 7.3, 8.1_
  - [ ]* 6.3 Write unit tests for the builder descriptor shape
    - Assert descriptor shape and each criterion mapping; presence of `notMade()` and `times()`.
    - _Requirements: 6.1, 7.3, 8.1_

- [ ] 7. Compiler pass-through verification (`packages/compiler`) — DESIGN VERIFICATION ITEM
  - [ ] 7.1 Verify/extend compiler to carry `assertRequest` + nested `matcher`/`expectation`
    - Read `packages/compiler` parser/emitter; confirm `{ __step: true, action: 'assertRequest', matcher, expectation }` passes through to spec `steps[]` without dropping/flattening the nested objects. If the emitter whitelists fields per action, extend it to preserve `matcher`/`expectation`.
    - Confirm `flattenSteps`/`expandStep` stamp `_taskPath` on the descriptor like any non-task step.
    - _Requirements: 6.1, 6.11_
  - [ ]* 7.2 Write compiler round-trip test
    - DSL module → compiled spec → `steps[]` contains the intact `assertRequest` descriptor with `matcher`/`expectation` preserved.
    - _Requirements: 6.1, 6.11_

- [ ] 8. `Request_Matcher` pure functions + assertion evaluation (`packages/extension/src/networkCapture.js` / `background.js` test hooks)
  - [ ] 8.1 Implement the matcher family and `requestMatches`
    - `urlMatches` (exact `===` / regex / glob→regex), `methodMatches` (uppercased compare), `querySubsetMatches` (subset, case-sensitive values), `bodyMatches` (json/form subset + raw exact; parse failure → no match), `statusMatches` (exact / inclusive range; `null` never matches).
    - `requestMatches(matcher, req)`: logical AND over present criteria.
    - _Requirements: 6.2, 6.3, 6.4, 6.6, 6.7, 6.8, 6.9, 6.10, 6.11_
  - [ ] 8.2 Implement `validateMatcher` and `evaluateAssertRequest`
    - `validateMatcher`: reject empty/invalid `method` criterion (returns a reason, no match performed).
    - `evaluateAssertRequest(step, captured)`: apply validation, filter matches, evaluate `exists`/`notMade`/`count`, return `{ ok, matchCount, message? }`; `failMsg` states criteria + observed count.
    - _Requirements: 6.5, 6.12, 7.1, 7.2, 7.4, 7.5, 8.2, 8.3, 9.3_
  - [ ]* 8.3 Write property test for URL criterion matching
    - **Property 6: URL criterion matching** — **Validates: Requirements 6.2, 6.3**
  - [ ]* 8.4 Write property test for case-insensitive method matching
    - **Property 7: Method matching is case-insensitive** — **Validates: Requirements 6.4**
  - [ ]* 8.5 Write property test for query subset matching
    - **Property 8: Query parameter subset matching** — **Validates: Requirements 6.6**
  - [ ]* 8.6 Write property test for body subset / exact matching
    - **Property 9: Request body subset / exact matching** — **Validates: Requirements 6.7, 6.8**
  - [ ]* 8.7 Write property test for status matching
    - **Property 10: Status matching (exact and range)** — **Validates: Requirements 6.9, 6.10**
  - [ ]* 8.8 Write property test for AND-composition
    - **Property 11: AND-composition of matcher criteria** — **Validates: Requirements 6.11**
  - [ ]* 8.9 Write property test for existence assertion
    - **Property 12: Existence assertion correctness** — **Validates: Requirements 7.1, 7.2**
  - [ ]* 8.10 Write property test for not-made assertion
    - **Property 13: Not-made assertion correctness** — **Validates: Requirements 7.4, 7.5**
  - [ ]* 8.11 Write property test for count assertion
    - **Property 14: Count assertion correctness** — **Validates: Requirements 8.2, 8.3**
  - [ ]* 8.12 Write property test for failure message content
    - **Property 15: Failure message reports criteria and observed count** — **Validates: Requirements 9.3**
  - [ ]* 8.13 Write unit test for invalid-method-criterion failure
    - Assert `evaluateAssertRequest` fails the step with no request matched when `method` is empty/invalid.
    - _Requirements: 6.5_

- [ ] 9. `assertRequest` runtime evaluation in `runStepLoop` (`packages/extension/src/background.js`)
  - [ ] 9.1 Handle `assertRequest` step in the loop
    - In `runStepLoop`, background-handle `assertRequest` (like `saveExpression`): emit `STEP_STARTING`, call `evaluateAssertRequest(step, getCapturedRequests())`, `emitLog` pass (advance) or fail (halt via `detachNetworkCapture`/`teardownTabTracker`/`unlockTab` + summary).
    - _Requirements: 6.5, 6.12, 7.1, 7.2, 7.4, 7.5, 8.2, 8.3, 9.1, 9.2, 9.3_
  - [ ] 9.2 Implement `emitAssertOutcomeOrHalt` for log-display-failure halt
    - Add `emitLogStrict`/`emitAssertOutcomeOrHalt`: if sending the outcome throws synchronously, halt the run (detach, teardown, unlock, `running = false`).
    - _Requirements: 9.4_
  - [ ]* 9.3 Write unit tests for assert evaluation flow (mocked `api`)
    - Pass emits passed LOG + advances; fail emits failed LOG + halts; synchronous send failure triggers `emitAssertOutcomeOrHalt` halt.
    - _Requirements: 9.1, 9.2, 9.4_

- [ ] 10. Checkpoint — DSL, compiler, assert evaluation
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 11. Panel store: `networkRequests` slice + `NETWORK_REQUEST` handling (`packages/extension/panel-vue/src/store`)
  - [ ] 11.1 Add store state and `NETWORK_REQUEST` handler
    - Add `networkRequests: Record<string, CapturedRequest[]>` and `networkCapturePending: boolean`; add `CapturedRequest` to panel `types`.
    - Handler: group by `String(stepIndex)` or `'unattributed'`, insert keeping each group sorted by `initiatedAt`; reset both on run start; set `networkCapturePending` true on start (if attach succeeded) and false on `RUN_COMPLETE`/`RUN_STOPPED`.
    - Derive per-step count from `networkRequests[String(i)]?.length`.
    - _Requirements: 4.4, 5.5, 5.7, 5.8, 5.9, 5.11_
  - [ ]* 11.2 Write property test for per-step count derivation
    - **Property 17: Per-step count derivation** — **Validates: Requirements 5.5, 5.9**
  - [ ]* 11.3 Write property test for ordering by initiation time
    - **Property 18: Ordering by initiation time** — **Validates: Requirements 5.7**
  - [ ]* 11.4 Write unit test for store grouping/reset/pending flag
    - Attributed vs unattributed grouping, reset on run start, pending flag transitions.
    - _Requirements: 4.4, 5.11_

- [ ] 12. `NetworkLogEntry.vue` component (`packages/extension/panel-vue/src/components/NetworkLogEntry.vue`) + `statusDisplay`
  - [ ] 12.1 Implement `statusDisplay(status)` helper
    - Add `statusDisplay` (in panel `logic/`): numeric 100..599 → string form; `null` → non-numeric pending/failed indicator.
    - _Requirements: 5.8_
  - [ ] 12.2 Implement the component
    - Collapsed by default; disclosure toggle expands; distinct network styling (never mistaken for a step); shows method, URL, `statusDisplay`; CSS-ellipsis URL with `title`; pending/failed indicator when status `null`.
    - Expanded view shows query params, request body, response body with capture-time truncation labels and `bodyUnavailable` indicator; full unmasked values, no display masking/truncation.
    - _Requirements: 5.2, 5.3, 5.4, 5.6, 5.8, 5.10, 11.3_
  - [ ]* 12.3 Write property test for status display indicator
    - **Property 16: Status display indicator** — **Validates: Requirements 5.8**
  - [ ]* 12.4 Write property test for unmasked display of full values
    - **Property 20: Unmasked display of full values** — **Validates: Requirements 5.10, 11.3**
  - [ ]* 12.5 Write component tests for `NetworkLogEntry.vue`
    - Collapsed-by-default, distinct markup vs a step, expand reveals query/request/response, pending/failed indicator, full URL when expanded.
    - _Requirements: 5.2, 5.4, 5.6, 5.8, 5.10_

- [ ] 13. `LogContainer.vue` `renderItems` interleaving (`packages/extension/panel-vue/src/components/LogContainer.vue`)
  - [ ] 13.1 Interleave network entries after their step
    - Extend the `RenderItem` union with `network-entry`; after each `log-entry`, append its attributed network entries in `initiatedAt` order; key as `net-<stepIndex>-<requestId>` (autoscroll `data-key` pattern preserved).
    - Per-step count badge bound to the group length; loading placeholder while `networkCapturePending` and count not yet determined; render `NetworkLogEntry.vue` for each.
    - _Requirements: 5.1, 5.5, 5.7, 5.9, 5.11_
  - [ ]* 13.2 Write component tests for interleaving and placeholder
    - Network entries positioned after their step, ordered by `initiatedAt`; count badge; loading placeholder.
    - _Requirements: 5.1, 5.5, 5.7, 5.11_

- [ ] 14. Checkpoint — panel display
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 15. Persistence: new `run-results` store (`packages/extension/src/storage.js`) — DESIGN VERIFICATION ITEM
  - [ ] 15.1 Add `saveRunResults`/`getRunResults` and resolve `runResults` key inclusion
    - Add `saveRunResults(record)` (rejection propagates, NOT swallowed) and `getRunResults(runId)` under a top-level `runResults` key (`runId → RunResultsRecord`).
    - Confirm `runResults` does not collide with existing keys; decide and explicitly encode whether `getAllProjects()`/`exportAll()` (which read `storage.local.get(null)`) include or exclude the `runResults` key.
    - _Requirements: 10.1, 10.2_
  - [ ] 15.2 Build and persist the record in `finishRun` (`background.js`)
    - Add `buildRunResultsRecord()` from `getCapturedRequests()` (byte-for-byte, unmasked); `finishRun` awaits `saveRunResults`; on rejection mark the whole run failed and emit `RUN_PERSIST_FAILED`.
    - _Requirements: 10.1, 10.2, 10.4, 11.4_
  - [ ] 15.3 Implement reopen / rehydrate path
    - Load via `getRunResults(runId)` and dispatch each `CapturedRequest` into `state.networkRequests` using the same grouping as live capture so `LogContainer` re-renders grouped by step.
    - _Requirements: 10.3, 11.4_
  - [ ]* 15.4 Write property test for persistence round-trip
    - **Property 21: Persistence round-trip** — **Validates: Requirements 10.3, 11.4**
  - [ ]* 15.5 Write unit tests for persistence invocation and failure→run-fail
    - `saveRunResults` invoked on finish; rejection fails the run + emits `RUN_PERSIST_FAILED`; reopen regroups records.
    - _Requirements: 10.1, 10.4, 10.3_

- [ ] 16. Unmasked-fidelity verification across capture/message/store/display/persist
  - [ ]* 16.1 Write property test for unmasked storage
    - **Property 19: Unmasked storage** — **Validates: Requirements 11.1, 11.2**
    - Include token/key/password/cookie-like substrings; assert byte-for-byte storage (except the 1 MB body cap) with no `password|secret|token|key|auth` masking reused.
  - [ ]* 16.2 Write cross-layer unmasked verification tests
    - Verify no reuse of the existing `LogEntry`/param-banner masking for network entries across capture → `NETWORK_REQUEST` → store → display → persist/reload.
    - _Requirements: 11.1, 11.2, 11.3, 11.4_

- [ ] 17. Final wiring / end-to-end integration
  - [ ] 17.1 Connect the full path and remove orphaned code
    - Confirm DSL `AssertRequest` → compiler `steps[]` → background capture + `assertRequest` evaluation → `NETWORK_REQUEST` → panel store → `LogContainer`/`NetworkLogEntry` display → `finishRun` persistence → reopen rehydrate are all wired with no orphaned pieces; ensure all new `module.exports` test hooks are exported.
    - _Requirements: 5.1, 6.1, 7.1, 9.1, 10.1, 10.3_
  - [ ]* 17.2 Write integration/smoke tests
    - Capture-within-500ms and capture-across-navigation against a mocked tab; end-to-end assert pass/fail through the wired path.
    - _Requirements: 1.1, 2.2, 7.1, 7.2, 9.1, 9.2_

- [ ] 18. Final checkpoint — ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional (tests/verification) and can be skipped for a faster MVP; core implementation tasks are never marked optional.
- Each task references the specific requirement sub-clauses it implements and the design component it builds.
- Property tests target the pure functions called out in the design's Testing Strategy; unit/component tests cover the non-pure CDP/lifecycle/Vue parts. The author writes and runs all tests manually.
- Tasks 7 and 15 are the two explicit design verification items (compiler pass-through; brand-new run-results store).
- The debugger banner (Req 3.1/3.2) requires no code beyond attach/detach and is handled implicitly by tasks 3.1/3.3; it is manually observed, so it has no standalone coding task.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "6.1", "6.2", "7.1", "15.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "2.1", "6.3", "7.2", "8.1", "12.1"] },
    { "id": 2, "tasks": ["1.4", "1.5", "2.2", "2.3", "3.1", "8.2", "8.3", "8.4", "8.5", "8.6", "8.7", "8.8", "11.1", "12.2"] },
    { "id": 3, "tasks": ["2.4", "3.2", "8.9", "8.10", "8.11", "8.12", "8.13", "11.2", "11.3", "11.4", "12.3", "12.4", "12.5", "13.1"] },
    { "id": 4, "tasks": ["3.3", "4.1", "9.1", "13.2", "15.3"] },
    { "id": 5, "tasks": ["3.4", "4.2", "9.2", "15.2"] },
    { "id": 6, "tasks": ["4.3", "9.3", "15.4", "15.5", "16.1"] },
    { "id": 7, "tasks": ["4.4", "16.2", "17.1"] },
    { "id": 8, "tasks": ["17.2"] }
  ]
}
```
