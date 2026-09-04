# Implementation Plan: Element Find Trace

## Overview

This plan implements the find-trace feature bottom-up, building each layer on the one below it so nothing is orphaned. It starts by extracting the shared matcher evaluator in the ES5 runtime (`packages/extension/src/runtime.js`), then the failure-time breakdown, the instrumented strategy tracers (closestLabel, navigate, xpath), the `findElement` timeout branch that assembles the strategy-specific trace, the `findElementWithParent` cross-cutting assembly, the message listener forwarding, the background `emitLog` plumbing, the TypeScript panel types and store passthrough, and finally the `LogEntry.vue` "Why did this fail?" disclosure. Property-based and unit tests are interleaved as optional sub-tasks placed close to the code they validate.

Two source styles are in play and must be respected:
- `packages/extension/src/runtime.js` is plain ES5-style JS (`var`, function declarations, no TS).
- `packages/extension/panel-vue/src/**` is TypeScript/Vue.

No packaging/deployment tasks are included — the change integrates into the existing extension build (`packages/extension/build.js` already bundles `runtime.js` and the panel).

## Test Execution Rules (READ BEFORE RUNNING ANYTHING)

- The developer runs all tests **manually**. The tooling/assistant MUST NOT run `node --test` or any test command.
- The tooling/assistant MUST NOT run `node -c` (syntax check) on any file.
- Property-based tests use **fast-check** with **`node:test`**, run under **jsdom**, and MUST be configured with **≥100 iterations** (`{ numRuns: 100 }` or more).
- Every property test MUST be tagged with a comment in the form:
  `// Feature: element-find-trace, Property <n>: <property text>`
- Property tests live in `packages/extension/src/runtime.property.test.js` (extend the existing file); panel property/unit tests live alongside the panel source under `packages/extension/panel-vue/src/**`.

## Tasks

- [x] 1. Extract shared `evaluateWhereKey` and refactor `matchesWhere` (no semantic change)
  - [x] 1.1 Add `UNAVAILABLE` sentinel and `evaluateWhereKey(el, key, value, parentNode)` to `runtime.js`
    - Implement one branch per supported key (`id`, `textIs`, `textContains`, `classIncludes`, `placeholder`, `name`, `type`, `value`, `ariaLabel`, `role`, `title`, `hrefContains`, `isDisabled`, `dataAttr`, `nthChild`, `closestLabel`) reproducing today's pass test exactly and returning `{ passed, actual }`
    - Report `actual` per the design table: raw untrimmed `textContent` for `textIs`/`textContains` (whitespace preserved), attribute value for attribute keys, `UNAVAILABLE` when the observed value is `null`/`undefined`
    - For `closestLabel`, `passed` delegates to existing `matchClosestLabel`; `actual` carries the closestLabel sub-record placeholder (filled by task 3)
    - _Requirements: 2.3, 2.4, 2.5, 2.7_
  - [x] 1.2 Refactor `matchesWhere` to iterate keys and call `evaluateWhereKey().passed` with AND/early-exit semantics unchanged
    - Preserve the exact observable boolean result and short-circuit behavior
    - _Requirements: 2.6_
  - [ ]* 1.3 Write unit/example tests for `evaluateWhereKey`
    - One example per supported key confirming `{ passed, actual }` agrees with `matchesWhere`'s decision and reports the right observed value, including `UNAVAILABLE` for absent attributes
    - _Requirements: 2.3, 2.4, 2.5, 2.7_

- [x] 2. Implement failure-time `buildWhereBreakdown` and truncation helper
  - [x] 2.1 Add `truncate256(v)` and `buildWhereBreakdown(candidates, where, parentNode)` to `runtime.js`
    - `candidateCount = candidates.length`; when zero, return `{ nearMiss: null, candidateCount: 0 }` (empty breakdown, no Near_Miss)
    - Iterate the single `querySelectorAll` snapshot synchronously (no await/yield), counting per-candidate passes via `evaluateWhereKey`; pick the candidate with the greatest pass count as Near_Miss, ties keep the first encountered; designate at most one
    - Build `whereBreakdown` as `{ key, expected, actual, passed }` entries (expected from descriptor, actual from `evaluateWhereKey`), each string truncated to 256 chars; expose `passed` (passed keys) and `firstFailed` on the nearMiss
    - Set `nearMiss.fullMatch = true` when every entry `passed:true` (used by the caller to classify `appeared-after-timeout`); consumers must not assume a failing entry exists when `fullMatch` is true
    - Record `actual: null, actualUnavailable: true` when the observed value is the `UNAVAILABLE` sentinel, keeping the matcher entry
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 8.2, 8.3, 8.5_
  - [ ]* 2.2 Write property test for Near_Miss uniqueness, maximality, and breakdown consistency
    - **Property 3: Near_Miss_Candidate is unique and maximal, and its breakdown is consistent with matchesWhere**
    - **Validates: Requirements 2.3, 2.6, 3.3, 8.5**
  - [ ]* 2.3 Write property test for faithful tag/candidate-count recording
    - **Property 4: Candidate count and tag are recorded faithfully**
    - **Validates: Requirements 2.1, 2.2**
  - [ ]* 2.4 Write property test for 256-char truncation
    - **Property 5: Recorded values are truncated to 256 characters**
    - **Validates: Requirements 2.4, 5.2**
  - [ ]* 2.5 Write property test for whitespace-preserving text actuals
    - **Property 6: Text matcher actual preserves whitespace**
    - **Validates: Requirements 2.5**
  - [ ]* 2.6 Write unit/example tests for `buildWhereBreakdown`
    - Zero-candidate empty result and no Near_Miss; single candidate; ties resolved to first
    - _Requirements: 2.2, 8.3, 8.5_

- [x] 3. Implement instrumented `traceClosestLabel` (failure-time only)
  - [x] 3.1 Add `traceClosestLabel(el, spec, parentNode)` to `runtime.js`
    - Record `labelTag`, `labelText` (truncated 256; set `labelTextAbsent` when the expected label text is absent), and `bounded`
    - Parent-scoped (`parentNode` present): record `bounded:true` and a single `boundedSubtree` strategy outcome (Strategy A only)
    - Unbounded: record `forAttr` (B1), `ancestorWalk` (B2), `ariaLabelledby` (B3) outcomes, each `matched`/`not-matched`, reusing existing B1/B2/B3 logic with no semantic change
    - Wire this record into `evaluateWhereKey`/`buildWhereBreakdown` so a failing `closestLabel` matcher populates `nearMiss.closestLabel`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_
  - [ ]* 3.2 Write property test for closestLabel strategy outcomes
    - **Property 10: closestLabel strategy outcomes are recorded when it is the failing matcher**
    - **Validates: Requirements 5.1**
  - [ ]* 3.3 Write unit/example tests for `traceClosestLabel`
    - Bounded (Strategy A, Req 5.4) vs unbounded (B1/B2/B3, Req 5.5); absent expected label text (Req 5.3)
    - _Requirements: 5.2, 5.3, 5.4, 5.5_

- [x] 4. Add navigate zero-based instrumentation to `applyNavigateSteps` and anchor resolution
  - [x] 4.1 Extend `applyNavigateSteps` failure return with machine fields while preserving the human string
    - On hop failure return `{ ok:false, error, failedHopIndex: i /* zero-based */, failedHopType: s.step }`; keep the existing 1-based human message unchanged
    - Ensure the anchor-resolution path exposes whether the anchor resolved to exactly one element before hops ran (`anchorResolved`), attempting no hops when it did not
    - _Requirements: 6.1, 6.2, 6.3, 6.4_
  - [ ]* 4.2 Write property test for navigate first-failing-hop recording
    - **Property 11: Navigate records the first failing hop by type and zero-based index**
    - **Validates: Requirements 6.1, 6.2, 6.3**
  - [ ]* 4.3 Write unit/example test for navigate anchor failure
    - Anchor fails to resolve → `navigate.anchorResolved:false`, no `failedHopIndex`, hop records otherwise unchanged
    - _Requirements: 6.4_

- [x] 5. Build the trace in the `findElement` timeout branch
  - [x] 5.1 Add `maxSeenCandidates` poll-frame counter (O(1), no breakdown)
    - Update `maxSeenCandidates = Math.max(maxSeenCandidates, candidates.length)` inside `poll()`; do not build any breakdown during polling
    - _Requirements: 8.1_
  - [x] 5.2 Implement the tag+where timeout branch trace assembly
    - Perform exactly one final synchronous pass: `candidates = root.querySelectorAll(tag)`, then `buildWhereBreakdown(...)`
    - Classify `absence`: `appeared-after-timeout` when `nearMiss.fullMatch`; else `present-unmatched` when `maxSeenCandidates > 0 || candidateCount > 0`; else `absent-full-window`
    - Assemble the tag+where trace (`strategy:'tag-where'`, `tag`, `candidateCount`, `whereBreakdown`, `passedMatchers`, `failedMatcher`, `closestLabel`, `absence`, `finalFrameCandidateCount`, `elapsedMs` clamped 0..5000) and reject with an `Error` carrying `err.findTrace`; still reject (no retroactive success)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 8.2, 8.4_
  - [x] 5.3 Implement the xpath timeout branch trace assembly
    - Wrap `document.evaluate` in try/catch; record `xpathOutcome` `none`/`one`/`many` from `snapshotLength`, `matchedNodeCount`, `expression`, `elapsedMs`, `configuredWaitMs = TIMEOUT_5sec`; on throw record `invalid:true`, `outcome:'invalid'` with the exact expression
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_
  - [ ]* 5.4 Write property test that success produces no trace
    - **Property 1: Success never produces a trace**
    - **Validates: Requirements 1.5, 8.1, 8.4, 11.4**
  - [ ]* 5.5 Write property test for absence classification
    - **Property 7: Absence classification is exactly one valid value**
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.6**
  - [ ]* 5.6 Write property test for bounded elapsed time
    - **Property 8: Elapsed time is a bounded integer**
    - **Validates: Requirements 3.5**
  - [ ]* 5.7 Write property test that the breakdown pass runs at most once per failed resolution
    - **Property 13: The breakdown pass runs at most once per failed resolution**
    - **Validates: Requirements 8.1, 8.2**
  - [ ]* 5.8 Write property test for XPath expression + no-node outcome
    - **Property 12: XPath records the exact expression and correct no-node outcome**
    - **Validates: Requirements 7.1, 7.4**
  - [ ]* 5.9 Write unit/example tests for xpath outcomes
    - one / many / invalid outcomes recorded correctly
    - _Requirements: 7.2, 7.3, 7.5_

- [ ] 6. Checkpoint - Ensure all runtime finder tests pass
  - Ensure all tests pass, ask the user if questions arise. (Developer runs tests manually.)

- [x] 7. Assemble cross-cutting trace in `findElementWithParent`
  - [x] 7.1 Add scope / action / navigate merge for the no-parent path
    - On child rejection, read `err.findTrace` (or synthesize an empty-steps trace when none exists), set `scope:'whole-document'`, `action`, and the preserved error string `'Element not found: ' + target`
    - Merge the navigate trace (`anchorResolved`, zero-based `failedHopIndex`, `failedHopType`, `hopCount`) reconciling the loop index to zero-based; return `{ ok:false, error, findTrace }`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.6, 1.7, 6.1, 6.2, 6.3, 6.4, 11.3_
  - [x] 7.2 Add parent (childOf) resolution outcome assembly
    - Parent not resolved: `scope:'whole-document'`, `parent.resolved:false`, `parent.descriptorId` from the parent descriptor, preserved `'Parent element not found: <id>'` string, no child pass
    - Parent resolved + child missing: `scope:'parent-scoped'`, `parent.resolved:true`, `parent.identifier = getElementXPath(parentEl)`, `parent.scopedToParent:true`, and a `matchCount` via a failure-only `document.querySelectorAll(parentDescriptor.tag)` filtered by `matchesWhere`; preserve the existing parent-scoped error string
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_
  - [ ]* 7.3 Write property test that a failed find always produces a trace
    - **Property 2: A failed find always produces a trace**
    - **Validates: Requirements 1.1, 1.2, 1.4, 1.6, 1.7, 11.1, 11.3**
  - [ ]* 7.4 Write property test for scope reflecting parent presence and resolution
    - **Property 9: Scope reflects parent presence and resolution**
    - **Validates: Requirements 1.3, 4.1, 4.4**
  - [ ]* 7.5 Write unit/example tests for parent branches
    - not-resolved (Req 4.2), resolved-child-missing (Req 4.3), multiple parent matches (Req 4.5)
    - _Requirements: 4.2, 4.3, 4.5_

- [x] 8. Forward the trace through the runtime message listener
  - [x] 8.1 Attach `findResult.findTrace` on failure `STEP_RESULT` for every element-dependent branch
    - Update the `ACTIONS_NEEDING_ELEMENT` block and the `pressKey`-with-target branch to include `findTrace: findResult.findTrace` on the `STEP_RESULT` response
    - Leave `assertNotExists` failure (element found) without a trace, and produce no trace for steps that do not require locating an element
    - _Requirements: 9.1, 11.1, 11.2, 11.4_
  - [ ]* 8.2 Write unit/example test that STEP_RESULT carries the trace for a representative element action
    - Assert failure `STEP_RESULT` includes the same `findTrace`; non-element steps omit it
    - _Requirements: 9.1, 11.1, 11.4_

- [x] 9. Propagate the trace through background `emitLog`
  - [ ] 9.1 Add optional `findTrace` parameter to `emitLog` and the call site
    - Add 5th param `findTrace`; set `logMsg.findTrace = findTrace` only when present (omit otherwise)
    - Update the call site: `emitLog(currentIndex, step, !!ok, error || undefined, result && result.findTrace)`
    - _Requirements: 9.2, 9.3, 9.4_

- [x] 10. Add panel TypeScript types
  - [ ] 10.1 Define the `FindTrace` interface and sub-interfaces
    - Add `WhereBreakdownEntry`, `ClosestLabelStrategyOutcome`, `ClosestLabelTrace`, `NavigateTrace`, `ParentTrace`, `XPathTrace`, `FindTraceStep`, and `FindTrace` in `messages.ts` (or a new `findTrace.ts`)
    - Add optional `findTrace?: FindTrace` to the `LOG` `BackgroundMessage` variant
    - _Requirements: 9.4_
  - [ ] 10.2 Add optional `findTrace?: FindTrace` to the store `LogEntry` type
    - _Requirements: 9.7_

- [x] 11. Wire the trace through the panel store
  - [x] 11.1 Pass `findTrace` through the LOG → `setStepStatus` router in `meta`
    - Whichever code maps `LOG` → `setStepStatus` (RunView.vue/message router) forwards `findTrace` in the `meta` object
    - _Requirements: 9.5_
  - [x] 11.2 Copy `meta.findTrace` onto the matching `LogEntry` in `setStepStatus`
    - `if (meta.findTrace !== undefined) entry.findTrace = meta.findTrace;`; when no matching entry exists, discard the trace, leave entries unchanged, raise no error
    - _Requirements: 9.5, 9.6_
  - [ ]* 11.3 Write property test that the trace propagates unchanged across content → background → panel
    - **Property 14: The trace propagates unchanged across content → background → panel**
    - **Validates: Requirements 9.1, 9.2, 9.3, 9.5**

- [ ] 12. Render the "Why did this fail?" disclosure in `LogEntry.vue`
  - [ ] 12.1 Add the collapsible disclosure block and register any new icon
    - Render the disclosure only when `status === 'fail' && entry.findTrace`; initially collapsed, with a toggle; while collapsed keep the existing error line as the only visible failure text
    - Expanded: show scope and candidate count; passed Where_Matchers (first 50 + remaining count) and the failing matcher with expected vs actual, rendering whitespace visibly for text actuals
    - Expanded: show parent resolution / scoped-to-parent, absence classification, and closestLabel / navigate / xpath details, each read defensively with optional chaining
    - A failed entry without a trace renders the error line unchanged
    - Register any new icon used by the disclosure in `packages/extension/panel-vue/src/icons.ts`
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.6, 10.7, 10.8, 10.9, 10.10_
  - [ ] 12.2 Implement the passed-matcher display cap helper
    - Return at most 50 passed matchers plus a remaining count of `max(0, length - 50)`
    - _Requirements: 10.5_
  - [ ]* 12.3 Write property test for the passed-matcher display cap
    - **Property 15: Passed-matcher display cap**
    - **Validates: Requirements 10.5**
  - [ ]* 12.4 Write unit/example tests for `LogEntry.vue`
    - fail+trace mounts with disclosure present and initially collapsed (Req 10.1, 10.2); expand shows scope/candidateCount/passed+failing matchers with whitespace visible (Req 10.3, 10.4); >50 passed matchers capped (Req 10.5); collapse returns to error line (Req 10.6); parent/absence/closestLabel/navigate/xpath details (Req 10.7–10.9); fail-without-trace unchanged (Req 10.10)
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9, 10.10_

- [ ] 13. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise. (Developer runs tests manually; do not run `node --test` or `node -c`.)

## Notes

- Tasks marked with `*` are optional test tasks and can be skipped for a faster MVP; core implementation tasks are never optional.
- Each task references specific requirement sub-clauses for traceability; each property test task references a numbered design Property.
- Property tests use fast-check (≥100 iterations) under jsdom with `node:test`, tagged `// Feature: element-find-trace, Property <n>: ...`, and live in `runtime.property.test.js` (runtime) or beside the panel source (panel).
- The developer runs tests manually. Tooling must NOT run `node --test` or `node -c`.
- No packaging/deployment tasks: the feature integrates into the existing `packages/extension/build.js` bundling of `runtime.js` and the panel.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3"] },
    { "id": 2, "tasks": ["2.1", "3.1", "4.1"] },
    { "id": 3, "tasks": ["2.2", "2.3", "2.4", "2.5", "2.6", "3.2", "3.3", "4.2", "4.3"] },
    { "id": 4, "tasks": ["5.1", "5.2", "5.3"] },
    { "id": 5, "tasks": ["5.4", "5.5", "5.6", "5.7", "5.8", "5.9"] },
    { "id": 6, "tasks": ["7.1", "7.2"] },
    { "id": 7, "tasks": ["7.3", "7.4", "7.5", "8.1"] },
    { "id": 8, "tasks": ["8.2", "9.1"] },
    { "id": 9, "tasks": ["10.1"] },
    { "id": 10, "tasks": ["10.2", "11.1"] },
    { "id": 11, "tasks": ["11.2", "12.1"] },
    { "id": 12, "tasks": ["11.3", "12.2"] },
    { "id": 13, "tasks": ["12.3", "12.4"] }
  ]
}
```
