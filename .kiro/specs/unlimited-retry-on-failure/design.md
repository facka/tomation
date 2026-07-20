# Unlimited Retry on Failure Bugfix Design

## Overview

The retry-on-failure feature in the Tomation browser extension currently halts the test run after a single failed retry and appends a new log entry for each retry attempt. This design formalizes the fix to allow unlimited retries (until the user manually stops or skips) and to update the existing step log entry in-place with a retry counter instead of appending new entries.

## Glossary

- **Bug_Condition (C)**: The condition that triggers the bug — when `handleRetryStep` is called and the retried step fails again, the function halts the run instead of remaining in the `awaitingAction` state
- **Property (P)**: The desired behavior — the system remains in `awaitingAction` state after a failed retry, increments the retry counter, and re-presents the action buttons; the panel updates the existing log entry in-place rather than appending new rows
- **Preservation**: Existing skip behavior, first-attempt pass/fail logging, stop behavior, and non-retry flows must remain unchanged
- **handleRetryStep**: The function in `background.js` that processes `RETRY_STEP` messages from the panel
- **handleStepFailedAwaitingAction**: The function in `panel.js` that renders "Try Again"/"Skip" buttons when a step fails
- **appendLogEntry**: The function in `panel.js` that appends a new DOM element to the log container for each `LOG` message
- **runState.retryAttempt**: The counter tracking how many retry attempts have been made for the current failed step
- **awaitingAction**: Boolean flag indicating the run is paused waiting for user to retry or skip

## Bug Details

### Bug Condition

The bug manifests in two related areas:

1. **Background (halting on retry failure)**: When `handleRetryStep` receives a failed result from `sendStepToRuntime`, it sets `awaitingAction = false`, `running = false`, calls `unlockTab()`, and emits `RUN_COMPLETE` — killing the run instead of letting the user try again.

2. **Panel (new log entry per retry)**: When `handleRetryStep` succeeds or fails, it emits a new `LOG` message, which causes `appendLogEntry` in `panel.js` to append a brand new DOM element to the log container rather than updating the existing failed entry.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type { message: RETRY_STEP, retryResult: StepResult }
  OUTPUT: boolean
  
  RETURN input.message.type == 'RETRY_STEP'
         AND runState.awaitingAction == true
         AND (
           (input.retryResult.ok == false)  -- Bug 1: halts instead of re-awaiting
           OR
           (input.retryResult.ok IN [true, false])  -- Bug 2: emits new LOG instead of updating
         )
END FUNCTION
```

### Examples

- User clicks "Try Again" on step 3, retry fails → **Current**: run halts with `RUN_COMPLETE`. **Expected**: system stays in `awaitingAction`, shows "Try Again"/"Skip" buttons again, retry counter shows "Attempt 2"
- User clicks "Try Again" twice, both fail, third succeeds → **Current**: run halts after first retry failure. **Expected**: log entry for step 3 shows "✓ Attempt 3" in-place
- User clicks "Try Again" on step 3, retry succeeds → **Current**: new log entry appended for the same step. **Expected**: existing step 3 entry updated from "✗" to "✓ Attempt 1"
- User clicks "Try Again" on step 3, retry fails → **Current**: new log entry appended with "✗ Attempt 1". **Expected**: existing step 3 entry updated to show "✗ Attempt 2" with buttons re-rendered

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- "Skip" button continues to advance past the failed step and mark it as skipped in the log
- Steps that pass on the first attempt append a normal pass log entry without any retry counter
- "Stop" button during `awaitingAction` state halts the run, unlocks the tab, emits `RUN_STOPPED`
- When debug mode is off (neither retry nor skip enabled), step failures halt the run immediately
- `STEP_FAILED_AWAITING_ACTION` continues to be emitted to the panel on initial step failure
- Pass/fail counts continue to be tracked correctly across the run
- The `retryAttempt` counter resets to 0 for each new step (via `resetRunState` or when advancing)

**Scope:**
All inputs that do NOT involve the `RETRY_STEP` message path should be completely unaffected by this fix. This includes:
- Normal step execution (pass or fail without retry)
- Skip flow
- Stop flow
- Pause/resume flow
- Manual step handling
- Tab tracking behavior

## Hypothesized Root Cause

Based on the code analysis, the root causes are clearly identifiable:

1. **Halting on retry failure (background.js `handleRetryStep`)**: The `else` branch (line ~1621) sets `runState.awaitingAction = false`, `runState.running = false`, calls `unlockTab()`, and emits `RUN_COMPLETE`. This immediately terminates the run instead of remaining in the `awaitingAction` state and re-emitting `STEP_FAILED_AWAITING_ACTION` to allow another retry.

2. **New log entry per retry (background.js `handleRetryStep`)**: Both the success and failure branches emit a new `type: 'LOG'` message via `safeSendMessage`. The panel's `onBackgroundMessage` handler routes `LOG` messages to `appendLogEntry`, which always creates and appends a new DOM element. There is no mechanism to update an existing log entry.

3. **No in-place update mechanism (panel.js)**: The panel lacks a message type or handler to update an existing log entry's DOM content. All step results go through `appendLogEntry` which unconditionally appends.

## Correctness Properties

Property 1: Bug Condition - Unlimited Retry Keeps Run Alive

_For any_ `RETRY_STEP` message where the retried step fails (result.ok === false), the fixed `handleRetryStep` function SHALL remain in the `awaitingAction` state (awaitingAction = true, running = true, tab locked), increment the retry counter, and re-emit `STEP_FAILED_AWAITING_ACTION` to the panel so the user can retry again indefinitely.

**Validates: Requirements 2.1**

Property 2: Bug Condition - In-Place Log Update on Retry

_For any_ retry attempt (success or failure), the fixed system SHALL emit an update message (not a new `LOG` message) that causes the panel to modify the existing step log entry DOM element in-place, updating its pass/fail state and displaying the retry attempt count, without appending a new log row.

**Validates: Requirements 2.2, 2.3**

Property 3: Preservation - Non-Retry Behavior Unchanged

_For any_ input that does NOT involve the `RETRY_STEP` message (normal step pass/fail, skip, stop, pause/resume), the fixed code SHALL produce exactly the same behavior as the original code, preserving all existing functionality including skip advancement, stop halting, first-attempt logging, and `STEP_FAILED_AWAITING_ACTION` emission.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `packages/extension/src/background.js`

**Function**: `handleRetryStep`

**Specific Changes**:
1. **Remove run-halting on retry failure**: In the `else` branch (retry failed), instead of setting `awaitingAction = false`, `running = false`, calling `unlockTab()`, and emitting `RUN_COMPLETE`, keep `awaitingAction = true`, keep `running = true`, keep tab locked, and re-emit `STEP_FAILED_AWAITING_ACTION` so the panel shows action buttons again.

2. **Replace LOG emission with UPDATE_LOG_ENTRY emission**: In both the success and failure branches, instead of emitting `{ type: 'LOG', ... }`, emit a new message type `{ type: 'UPDATE_LOG_ENTRY', stepIndex, ok, retryAttempt, error? }` that tells the panel to update the existing entry rather than append a new one.

3. **Reset retryAttempt on step advance**: When a retry succeeds and `runState.stepIndex` advances, reset `runState.retryAttempt = 0` so the next step starts fresh.

**File**: `packages/extension/src/panel.js`

**Function**: `onBackgroundMessage` (message router)

**Specific Changes**:
4. **Add UPDATE_LOG_ENTRY handler**: Add a new case in `onBackgroundMessage` for `'UPDATE_LOG_ENTRY'` that locates the existing log entry DOM element for the given `stepIndex` and updates its class (pass/fail) and inner HTML (indicator text with retry counter) in-place.

5. **Remove old action buttons on retry**: When an `UPDATE_LOG_ENTRY` or new `STEP_FAILED_AWAITING_ACTION` arrives, remove any existing `.action-buttons` container from the log before rendering new buttons (to avoid duplicate button rows on repeated retries).

**File**: `packages/extension/src/panel.js`

**Function**: `appendLogEntry` (no changes needed — it is bypassed for retries)

**Specific Changes**:
6. **Add data-step-index attribute to log entries**: Ensure `appendLogEntry` sets a `data-step-index` attribute on each log entry `<div>` so that `UPDATE_LOG_ENTRY` can locate the correct element to update.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write unit tests that call `handleRetryStep` with a mock `sendStepToRuntime` that returns `{ ok: false }` and assert that the run remains alive. Run these tests on the UNFIXED code to observe failures and confirm the root cause.

**Test Cases**:
1. **Retry failure halts run**: Call `handleRetryStep` with a failed result → assert `runState.running` becomes `false` (will confirm bug on unfixed code)
2. **Retry failure emits RUN_COMPLETE**: Call `handleRetryStep` with a failed result → assert `safeSendMessage` is called with `RUN_COMPLETE` type (will confirm bug on unfixed code)
3. **Retry emits new LOG**: Call `handleRetryStep` with success or failure → assert `safeSendMessage` is called with `type: 'LOG'` (will confirm log duplication bug on unfixed code)
4. **Multiple retries impossible**: Call `handleRetryStep` with failure, then call again → assert second call is rejected because `awaitingAction` is now `false` (will confirm bug on unfixed code)

**Expected Counterexamples**:
- `runState.running === false` after a retry failure, proving the run halts
- `safeSendMessage` called with `{ type: 'LOG' }` instead of an update message
- Possible causes confirmed: explicit `runState.running = false` and `unlockTab()` in the failure branch

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := handleRetryStep_fixed(input)
  ASSERT runState.awaitingAction == true
  ASSERT runState.running == true
  ASSERT runState.retryAttempt == previousAttempt + 1
  ASSERT safeSendMessage called with type 'STEP_FAILED_AWAITING_ACTION' (on failure)
         OR type 'UPDATE_LOG_ENTRY' with ok: true (on success)
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT handleRetryStep_original(input) = handleRetryStep_fixed(input)
  -- specifically:
  ASSERT skip behavior unchanged
  ASSERT stop behavior unchanged
  ASSERT first-attempt pass/fail logging unchanged
  ASSERT STEP_FAILED_AWAITING_ACTION emission unchanged
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain (various step types, configurations)
- It catches edge cases that manual unit tests might miss (e.g., retry on the last step, retry with context store errors)
- It provides strong guarantees that behavior is unchanged for all non-retry paths

**Test Plan**: Observe behavior on UNFIXED code first for skip, stop, and normal pass/fail flows, then write property-based tests capturing that behavior.

**Test Cases**:
1. **Skip Preservation**: Verify that `handleSkipStep` advances past the failed step and marks as skipped — unchanged by fix
2. **Stop Preservation**: Verify that `stopRun` during `awaitingAction` halts the run and emits `RUN_STOPPED` — unchanged by fix
3. **First-Attempt Pass Preservation**: Verify that steps passing on first attempt emit a normal `LOG` entry — unchanged by fix
4. **First-Attempt Fail Preservation**: Verify that first step failure still emits `STEP_FAILED_AWAITING_ACTION` and enters `awaitingAction` — unchanged by fix

### Unit Tests

- Test `handleRetryStep` with failed retry result → assert `awaitingAction` remains `true`, `running` remains `true`, `retryAttempt` incremented
- Test `handleRetryStep` with successful retry → assert `awaitingAction` set to `false`, `stepIndex` advanced, `retryAttempt` reset to 0
- Test `handleRetryStep` emits `UPDATE_LOG_ENTRY` (not `LOG`) on both success and failure
- Test `handleRetryStep` re-emits `STEP_FAILED_AWAITING_ACTION` on failure
- Test panel `UPDATE_LOG_ENTRY` handler updates existing DOM element in-place
- Test panel removes old action buttons before rendering new ones on repeated failure

### Property-Based Tests

- Generate random sequences of retry/skip/stop actions and verify the run state machine transitions are correct
- Generate random step configurations and verify that non-retry paths produce identical LOG messages before and after the fix
- Test that `retryAttempt` counter correctly increments across N retries and resets on advance

### Integration Tests

- Test full retry loop: step fails → retry fails → retry fails → retry succeeds → run continues
- Test retry counter display: verify the log DOM shows correct "Attempt N" text after multiple retries
- Test retry then skip: step fails → retry fails → user clicks Skip → run advances correctly
- Test retry then stop: step fails → retry fails → user clicks Stop → run halts correctly
