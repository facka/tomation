# Implementation Plan: Unlimited Retry on Failure Bugfix

## Overview

Fix the retry-on-failure feature so that failed retries keep the run alive (in `awaitingAction` state) indefinitely until the user skips or stops, and update the existing log entry in-place with a retry counter instead of appending new log entries.

## Tasks

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Retry Failure Halts Run Instead of Re-Awaiting
  - **IMPORTANT**: Write this property-based test BEFORE implementing the fix
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists
  - **Scoped PBT Approach**: Scope the property to the concrete failing case: `handleRetryStep` called with a failed retry result (`result.ok === false`) while `runState.awaitingAction === true`
  - Test that when `handleRetryStep` is called and `sendStepToRuntime` returns `{ ok: false }`:
    - `runState.awaitingAction` remains `true` (expected behavior)
    - `runState.running` remains `true` (expected behavior)
    - `runState.retryAttempt` is incremented (expected behavior)
    - `safeSendMessage` is called with `type: 'STEP_FAILED_AWAITING_ACTION'` (expected behavior)
    - `safeSendMessage` is NOT called with `type: 'RUN_COMPLETE'` (expected behavior)
    - `unlockTab` is NOT called (expected behavior)
  - Additionally test that on retry success/failure, `safeSendMessage` is called with `type: 'UPDATE_LOG_ENTRY'` (NOT `type: 'LOG'`)
  - Create test file at `packages/extension/src/handleRetryStep.test.js`
  - Mock `sendStepToRuntime`, `safeSendMessage`, `unlockTab`, `runStepLoop`, and set up `runState` with `awaitingAction: true`, `running: true`, `failedStepIndex: N`, `steps[N]` defined
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bug exists: `runState.running` becomes `false`, `RUN_COMPLETE` is emitted, `unlockTab` is called, and `LOG` is emitted instead of `UPDATE_LOG_ENTRY`)
  - Document counterexamples found to understand root cause
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Non-Retry Behavior Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - **Observe on UNFIXED code**:
    - `handleSkipStep({ stepIndex: N })` while `awaitingAction === true` → sets `awaitingAction = false`, advances `stepIndex`, calls `runStepLoop` or `finishRun`
    - First-attempt step failure with `allowRetryOnFailure: true` → emits `STEP_FAILED_AWAITING_ACTION`, sets `awaitingAction = true`
    - First-attempt step pass → emits `type: 'LOG'` with `ok: true`, advances `stepIndex`
    - `stopRun()` during `awaitingAction` → sets `running = false`, calls `unlockTab`, emits `RUN_STOPPED`
  - Write property-based tests:
    - For all skip actions while `awaitingAction === true`: system advances past failed step, sets `awaitingAction = false`, and resumes or finishes
    - For all first-attempt failures with retry enabled: system emits `STEP_FAILED_AWAITING_ACTION` and enters `awaitingAction` state
    - For all first-attempt passes: system emits `LOG` with `ok: true` and advances
    - For all stop actions during `awaitingAction`: system halts, unlocks tab, emits `RUN_STOPPED`
  - Create test file at `packages/extension/src/preservation.test.js`
  - Verify tests pass on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 3. Fix for unlimited retry on failure

  - [x] 3.1 Fix `handleRetryStep` failure branch in `background.js`
    - In the `else` branch (retry failed, ~line 1621), replace the run-halting logic:
      - Remove: `runState.awaitingAction = false`
      - Remove: `runState.failedStepIndex = null`
      - Remove: `runState.running = false`
      - Remove: `unlockTab()` call
      - Remove: `emitSummary('RUN_COMPLETE', ...)` call
    - Replace with: keep `runState.awaitingAction = true`, keep `runState.running = true`, keep tab locked, re-emit `STEP_FAILED_AWAITING_ACTION` to the panel with `{ type: 'STEP_FAILED_AWAITING_ACTION', stepIndex: currentIndex, retryAttempt: runState.retryAttempt, error: error }`
    - _Bug_Condition: isBugCondition(input) where input.retryResult.ok === false AND runState.awaitingAction === true_
    - _Expected_Behavior: System remains in awaitingAction state, increments retryAttempt, re-emits STEP_FAILED_AWAITING_ACTION_
    - _Preservation: Skip, stop, first-attempt pass/fail behavior unchanged (different code paths)_
    - _Requirements: 2.1, 3.4, 3.5_

  - [x] 3.2 Replace LOG emission with UPDATE_LOG_ENTRY in `handleRetryStep` success and failure branches
    - In the success branch: replace `{ type: 'LOG', ... }` with `{ type: 'UPDATE_LOG_ENTRY', stepIndex: currentIndex, ok: true, retryAttempt: runState.retryAttempt }`
    - In the failure branch: replace `{ type: 'LOG', ... }` with `{ type: 'UPDATE_LOG_ENTRY', stepIndex: currentIndex, ok: false, retryAttempt: runState.retryAttempt, error: error || 'Retry failed' }`
    - _Bug_Condition: isBugCondition(input) where input.retryResult.ok IN [true, false] — emits LOG instead of update_
    - _Expected_Behavior: Emit UPDATE_LOG_ENTRY so panel updates in-place instead of appending_
    - _Preservation: Normal first-attempt LOG emission is unaffected (different code path)_
    - _Requirements: 2.2, 2.3, 3.3_

  - [x] 3.3 Reset `retryAttempt` counter on step advance in `handleRetryStep` success branch
    - After `runState.stepIndex++` in the success branch, add `runState.retryAttempt = 0`
    - This ensures the next step starts with a fresh retry counter
    - _Expected_Behavior: retryAttempt resets to 0 when step advances after successful retry_
    - _Requirements: 2.1_

  - [x] 3.4 Add `data-step-index` attribute to log entries in `panel.js`
    - In `appendLogEntry`, after creating the `div` element, add: `div.setAttribute('data-step-index', String(logData.stepIndex))`
    - This allows the UPDATE_LOG_ENTRY handler to locate the correct DOM element
    - _Requirements: 2.2_

  - [x] 3.5 Add `UPDATE_LOG_ENTRY` handler in `panel.js` `onBackgroundMessage`
    - Add a new `case 'UPDATE_LOG_ENTRY':` in the switch statement
    - Handler logic:
      - Find existing log entry: `document.querySelector('[data-step-index="' + message.stepIndex + '"]')`
      - Update its class: remove 'pass'/'fail', add 'pass' if `message.ok`, else 'fail'
      - Rebuild inner HTML using `buildLogEntryHtml` with the updated data
      - Append indicator text: `✓ Attempt N` for success, `✗ Attempt N` + error for failure
    - _Expected_Behavior: Panel modifies existing DOM element in-place, no new log row appended_
    - _Requirements: 2.2, 2.3_

  - [x] 3.6 Remove old action buttons on repeated retries in `panel.js`
    - In `handleStepFailedAwaitingAction`, before appending the new button container, remove any existing `.action-buttons` element from the log container: `var oldBtns = logContainer.querySelector('.action-buttons'); if (oldBtns) oldBtns.parentNode.removeChild(oldBtns);`
    - This prevents duplicate "Try Again"/"Skip" button rows on repeated retry failures
    - _Requirements: 2.1_

  - [x] 3.7 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Retry Failure Keeps Run Alive
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior
    - When this test passes, it confirms the expected behavior is satisfied
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed — run stays alive, UPDATE_LOG_ENTRY emitted, retryAttempt incremented)
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 3.8 Verify preservation tests still pass
    - **Property 2: Preservation** - Non-Retry Behavior Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions — skip, stop, first-attempt logging all unchanged)
    - Confirm all tests still pass after fix (no regressions)

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- The fix targets `packages/extension/src/background.js` (handleRetryStep function) and `packages/extension/src/panel.js` (log update handling)
- The existing skip, stop, and first-attempt logging code paths are NOT modified
- All code must follow the existing ES5 style (var, function declarations, no arrow functions)
- Property-based tests use fast-check to generate diverse step objects and run state configurations
- The `UPDATE_LOG_ENTRY` message is a new message type that replaces `LOG` only in the retry path

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1", "2"] },
    { "id": 1, "tasks": ["3.1", "3.2", "3.3", "3.4", "3.5", "3.6"] },
    { "id": 2, "tasks": ["3.7", "3.8"] },
    { "id": 3, "tasks": ["4"] }
  ]
}
```
