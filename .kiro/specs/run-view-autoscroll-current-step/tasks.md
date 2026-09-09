# Implementation Plan

## Overview

Bugfix for the auto-scroll watcher in `packages/extension/panel-vue/src/components/LogContainer.vue`
(the `watch(() => logEntries.value.map((e) => e.status), ...)` block, ~lines 151-176). The fix changes
target selection (prefer the last `in-progress` entry, fall back to the most recently updated
non-`queued` entry, NONE when all `queued`) and scroll behavior (bring the target row fully into the
visible area via explicit container `scrollTop` math with smooth scrolling, no-op when already fully
visible).

> **Testing note (workspace constraint):** Tests are authored as part of these tasks, but the developer
> runs them manually. Task steps do NOT instruct running `node --test`, dev servers, or watchers as a
> blocking automated step. Where a task says "run on unfixed code" / "run after fix", that observation
> is performed by the developer; the tasks describe the expected outcome for traceability.

---

## Tasks

- [x] 1. Write bug condition exploration test (BEFORE implementing the fix)
  - **Property 1: Bug Condition** - Current Step Is Selected And Fully Visible
  - **CRITICAL**: This test MUST FAIL on the unfixed code - the failure confirms the bug exists.
  - **DO NOT attempt to fix the test or the code when it fails** at this stage.
  - **NOTE**: This test encodes the expected behavior; it will validate the fix when it passes after implementation (see 3.2).
  - **GOAL**: Surface counterexamples that demonstrate the bug in `LogContainer.vue`'s auto-scroll watcher.
  - **Scoped PBT approach**: The scroll defect depends on geometry, so scope the property to concrete,
    reproducible failing cases while asserting the universal shape of `currentStep`. Mount `LogContainer`
    with a jsdom-backed `log-container` having controlled `clientHeight`/`scrollTop`, and stub
    `scrollIntoView`/`scrollTo` to capture the resolved target `stepIndex` and scroll intent.
  - Test the bug condition from design `isBugCondition(X)`:
    - `current ← currentStep(entries)` = last `in-progress` entry, else last non-`queued`, else NONE.
    - Bug holds when `current ≠ NONE AND ((hasInProgress AND lastNonQueued ≠ current) OR NOT fullyVisible(current.row, container))`.
  - Assertions should match Expected Behavior (Property 1): target is `current` (the `in-progress`
    step, not merely last non-`queued`) and `current.row` is brought fully into the visible area.
  - Concrete cases to encode (from design "Exploratory Bug Condition Checking"):
    1. **In-progress vs completed divergence**: step 5 `in-progress`, later step 6 `pass`; assert target is step 5. (Unfixed: targets last non-`queued` → step 6.)
    2. **Partially clipped active step**: `in-progress` row half-visible at the bottom edge; assert it is brought fully into view. (Unfixed: `block: 'nearest'` no-op.)
    3. **Long log advancing**: 40-step run; as each step goes `in-progress`, assert the active step becomes fully visible. (Unfixed: lags / stays clipped.)
  - **EXPECTED OUTCOME**: Test FAILS on unfixed code (this is correct - it proves the bug exists).
  - Document counterexamples found (e.g. "target resolved to stepIndex 6 (pass) while stepIndex 5 was in-progress"; "active row remained partially clipped after watcher ran").
  - Mark this task complete when the test is written, the developer has run it, and the failure is documented.
  - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3_

- [x] 2. Write preservation property tests (BEFORE implementing the fix)
  - **Property 2: Preservation** - Non-Bug States Unchanged
  - **IMPORTANT**: Follow the observation-first methodology - record actual behavior on the UNFIXED code, then encode it as tests.
  - **GOAL**: Capture the observable behavior that must remain identical for states where `NOT isBugCondition(X)`.
  - Property-based testing recommended: generate random `logEntries` status sequences and container
    geometries restricted to non-bug states, and assert `F'(X) = F(X)` (same target / no extra scroll,
    identical rendering).
  - Observe on UNFIXED code, then assert it is preserved (from design "Preservation Checking"):
    1. **All-queued no-scroll**: every entry `queued` → `currentStep = NONE` → no scroll occurs. (Requirement 3.1)
    2. **Already-fully-visible correct target**: current step already fully visible → no additional scroll. (Requirements 3.2, 3.5)
    3. **Rendering/keying unchanged**: task headers, parameter banner, status indicators, and `data-key="entry-<stepIndex>"` values render identically. (Requirement 3.3)
    4. **Spliced/on-demand entries displayed**: runtime-created entries render and their positions are accounted for in tracking. (Requirement 3.4)
  - **EXPECTED OUTCOME**: Tests PASS on unfixed code (this establishes the baseline behavior to preserve).
  - Mark this task complete when the tests are written, the developer has run them, and they pass on unfixed code.
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 3. Fix the auto-scroll watcher to track the current step and bring it fully into view

  - [x] 3.1 Implement the fix in `LogContainer.vue`
    - File: `packages/extension/panel-vue/src/components/LogContainer.vue`, the `watch(() => logEntries.value.map((e) => e.status), ...)` callback (~lines 151-176).
    - Introduce a `currentStep` target selection helper: scan from the end for the last `in-progress` entry; if none, scan from the end for the last non-`queued` entry; return NONE (`-1`) when all entries are `queued`. Replaces the current "last non-`queued`" scan.
    - Guard the no-target case: when `currentStep` yields NONE, return early and perform no scroll.
    - Resolve the target row via existing keying (unchanged): `containerRef.value.querySelector('[data-key="entry-' + entry.stepIndex + '"]')`.
    - Replace `scrollIntoView({ block: 'nearest', behavior: 'smooth' })` with explicit container `scrollTop` math: using `el.offsetTop`, `el.offsetHeight`, `containerRef.value.scrollTop`, and `containerRef.value.clientHeight`, only adjust when the row is above the top edge or below the bottom edge, then `containerRef.value.scrollTo({ top, behavior: 'smooth' })`. No-op when the row is already fully visible.
    - Keep the logic operating on `logEntries` only (run-type agnostic) and preserve smooth scrolling. Do not alter rendering, keying, task headers, or the param banner.
    - _Bug_Condition: isBugCondition(X) from design — current ≠ NONE AND ((hasInProgress AND lastNonQueued ≠ current) OR NOT fullyVisible(current.row, container))_
    - _Expected_Behavior: Property 1 — select currentStep as target and bring its row fully into the visible area with smooth scrolling_
    - _Preservation: Preservation Requirements from design — no-scroll-when-all-queued, no-extra-scroll-when-already-visible, unchanged rendering/keying, spliced entries still shown, smooth scrolling_
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 3.2 Verify the bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Current Step Is Selected And Fully Visible
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test. It encodes the expected behavior.
    - **EXPECTED OUTCOME**: Test PASSES (confirms the bug is fixed - target is the current step and its row is fully visible).
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 3.3 Verify the preservation tests still pass
    - **Property 2: Preservation** - Non-Bug States Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests.
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions - `F'(X) = F(X)` for non-bug states, rendering/keying unchanged).
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 4. Checkpoint - Ensure all tests pass
  - Confirm the bug condition exploration test (task 1) now passes and all preservation tests (task 2) still pass.
  - Confirm the fix is confined to the `LogContainer.vue` auto-scroll watcher and no other code (store, message handling, rendering) changed.
  - Ask the user if any questions arise.

---

## Task Dependency Graph

```
1. Bug Condition Exploration Test (fails on unfixed code)
        │
        │  (understand the bug via counterexamples)
        ▼
2. Preservation Property Tests (pass on unfixed code)
        │
        │  (baseline behavior captured)
        ▼
3. Fix the auto-scroll watcher
   ├─ 3.1 Implement the fix (currentStep selection + explicit scrollTop math)
   ├─ 3.2 Verify exploration test now PASSES  (depends on 3.1, re-runs task 1)  ── Property 1
   └─ 3.3 Verify preservation tests still PASS (depends on 3.1, re-runs task 2) ── Property 2
        │
        ▼
4. Checkpoint - all tests pass
```

Execution waves (parallel task batches):

```json
{
  "waves": [
    {
      "wave": 1,
      "tasks": ["1", "2"],
      "description": "Author tests on UNFIXED code: exploration test (must fail) and preservation tests (must pass). Independent authoring; task 1 informs understanding for task 2."
    },
    {
      "wave": 2,
      "tasks": ["3.1"],
      "description": "Implement the fix in LogContainer.vue (currentStep selection + explicit scrollTop math). Depends on waves 1."
    },
    {
      "wave": 3,
      "tasks": ["3.2", "3.3"],
      "description": "Re-run the pre-written tests against the fixed code: verify exploration test now passes and preservation tests still pass. Depends on 3.1."
    },
    {
      "wave": 4,
      "tasks": ["4"],
      "description": "Checkpoint - ensure all tests pass. Depends on 3.2 and 3.3."
    }
  ]
}
```

Ordering rationale:
- Tasks **1** and **2** must precede **3**: the exploration test must fail (proving the bug) and the
  preservation tests must pass (capturing baseline) on the UNFIXED code before any change is made.
- Task **1** informs **2** (understanding the bug clarifies which states are non-bug states).
- **3.1** must precede **3.2** and **3.3** (verification re-runs the pre-written tests against the fixed code).
- **4** depends on **3.2** and **3.3** both succeeding.

## Traceability Summary

| Task | Property | Requirements |
|------|----------|--------------|
| 1. Exploration test | Property 1 (Bug Condition) | 1.1, 1.2, 1.3, 2.1, 2.2, 2.3 |
| 2. Preservation tests | Property 2 (Preservation) | 3.1, 3.2, 3.3, 3.4, 3.5 |
| 3.1 Implement fix | Property 1 (Expected Behavior) | 2.1, 2.2, 2.3, 2.4, 2.5 |
| 3.2 Verify fix | Property 1 (Expected Behavior) | 2.1, 2.2, 2.3, 2.4, 2.5 |
| 3.3 Verify preservation | Property 2 (Preservation) | 3.1, 3.2, 3.3, 3.4, 3.5 |
| 4. Checkpoint | Properties 1 & 2 | All |

## Notes

- **Workspace testing constraint:** Tests are authored as part of these tasks but run manually by the
  developer. Tasks do not invoke `node --test`, dev servers, or watchers as blocking steps; the
  "run on unfixed code" / "run after fix" observations are performed by the developer.
- **Exploratory bugfix ordering:** The exploration test (task 1) is written to FAIL on unfixed code to
  prove the bug exists, and the preservation tests (task 2) are written to PASS on unfixed code to
  capture the baseline. Both must exist before the fix (task 3) is applied.
- **Property status hover:** Tasks use the `**Property N: Type**` format so property/test status is
  surfaced on hover. Property 1 covers the Bug Condition / Expected Behavior; Property 2 covers
  Preservation.
- **Scope:** The change is confined to the auto-scroll watcher in `LogContainer.vue`. Rendering, keying
  (`data-key="entry-<stepIndex>"`), task headers, the parameter banner, store, and message handling must
  remain unchanged.
