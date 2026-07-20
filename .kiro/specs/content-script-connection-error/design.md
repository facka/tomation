# Content Script Connection Error Bugfix Design

## Overview

When the background script sends a step to a tab via `api.tabs.sendMessage`, the content script (`runtime.js`) may not be loaded — for example, if the extension was installed/reloaded without refreshing the page. In this case, Chrome rejects the promise with `"Could not establish connection. Receiving end does not exist."` The error is currently unhandled in `sendStepToRuntime` and `sendUploadToRuntime`, causing an unhandled promise rejection with no user feedback.

The fix wraps `api.tabs.sendMessage` calls with a catch that detects this specific error, halts the run gracefully, and sends a descriptive error message to the panel. The panel then displays a user-friendly message explaining the issue and how to resolve it (reload the page).

## Glossary

- **Bug_Condition (C)**: The condition that triggers the bug — `api.tabs.sendMessage` rejects with "Could not establish connection" because the content script is not loaded on the target tab
- **Property (P)**: The desired behavior — the run halts gracefully, emits a LOG with a descriptive error, and sends a RUN_COMPLETE summary to the panel, which displays a user-friendly message
- **Preservation**: Existing behavior that must remain unchanged — normal step execution when the content script IS loaded, non-connection failures reported via existing LOG/RUN_COMPLETE flow, safeSendMessage behavior for runtime.sendMessage
- **sendStepToRuntime**: The function in `background.js` that sends an EXECUTE_STEP message to the content script via `api.tabs.sendMessage(runState.lockedTabId, msg)`
- **sendUploadToRuntime**: The function in `background.js` that sends an upload step to the content script via `api.tabs.sendMessage(runState.lockedTabId, msg)`
- **safeSendMessage**: The existing function that wraps `api.runtime.sendMessage` with error handling for panel communication
- **runStepLoop**: The step execution loop in `background.js` that orchestrates the test run

## Bug Details

### Bug Condition

The bug manifests when the background script attempts to send a message to the content script on a tab where `runtime.js` has not been injected. This typically happens when the extension is installed or reloaded without the user refreshing the page, or when the tab is on a restricted URL (e.g., `chrome://`, `chrome-extension://`).

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type { tabId: number, message: object }
  OUTPUT: boolean
  
  RETURN api.tabs.sendMessage(input.tabId, input.message) rejects
         AND rejection.message CONTAINS "Could not establish connection"
         AND rejection.message CONTAINS "Receiving end does not exist"
END FUNCTION
```

### Examples

- User installs extension, opens side panel, loads a spec, clicks Run → step sent to tab → unhandled rejection, no feedback in panel
- User reloads the extension from `chrome://extensions`, clicks Run on an already-open tab → unhandled rejection, no feedback in panel
- User clicks Run on a tab showing `chrome://newtab` or another restricted URL → unhandled rejection, no feedback in panel
- User runs a test with an upload step on a tab without content script → unhandled rejection from `sendUploadToRuntime`, no feedback

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- When the content script IS loaded and responsive, `sendStepToRuntime` and `sendUploadToRuntime` must continue to send steps and receive results normally without any additional overhead
- When a step fails for reasons other than a missing content script (e.g., element not found, assertion failure), the existing LOG and RUN_COMPLETE flow must remain unchanged
- `safeSendMessage` behavior for `runtime.sendMessage` (panel communication) must remain unchanged — it should continue to log to console without crashing when the panel is closed

**Scope:**
All inputs that do NOT result in a "Could not establish connection" rejection from `api.tabs.sendMessage` should be completely unaffected by this fix. This includes:
- Successful step executions where the content script responds
- Step failures due to element-not-found, timeout, or assertion errors
- Panel communication via `safeSendMessage` / `api.runtime.sendMessage`

## Hypothesized Root Cause

Based on the bug description, the root cause is straightforward:

1. **Missing `.catch()` on `api.tabs.sendMessage`**: The `sendStepToRuntime` function returns `api.tabs.sendMessage(runState.lockedTabId, msg)` directly without catching connection errors. When the content script is not loaded, the promise rejects and the rejection propagates as unhandled.

2. **Same issue in `sendUploadToRuntime`**: The upload handler calls `api.tabs.sendMessage(runState.lockedTabId, msg).then(...)` but has no `.catch()` for connection errors — only the `.then()` handler processes the result.

3. **No user-facing error path**: Even if the error were caught, there is currently no code path that translates a "connection failed" error into a user-friendly message in the panel UI. The panel needs to recognize this specific error type and display appropriate guidance.

## Correctness Properties

Property 1: Bug Condition - Connection Error Produces Graceful Halt

_For any_ step execution where `api.tabs.sendMessage` rejects with a "Could not establish connection" error, the fixed code SHALL catch the rejection, halt the run gracefully (teardown tab tracker, unlock tab, set running to false), emit a LOG entry with a descriptive error message indicating the content script is not available, and send a RUN_COMPLETE summary to the panel.

**Validates: Requirements 2.1, 2.2, 2.3**

Property 2: Preservation - Normal Step Execution Unchanged

_For any_ step execution where `api.tabs.sendMessage` resolves successfully (content script is loaded and responds), the fixed code SHALL produce exactly the same behavior as the original code, preserving normal LOG emission, pass/fail counting, and run continuation logic.

**Validates: Requirements 3.1, 3.2, 3.3**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `packages/extension/src/background.js`

**Function**: `sendStepToRuntime`

**Specific Changes**:
1. **Add `.catch()` handler to `api.tabs.sendMessage`**: Detect "Could not establish connection" errors and return a failure result object `{ ok: false, error: "..." }` with a user-friendly message, rather than letting the rejection propagate.

2. **User-friendly error message**: The error message returned should explain the problem clearly: the content script is not loaded on the active tab, and the user should reload the page and try again.

**Function**: `sendUploadToRuntime`

**Specific Changes**:
3. **Add `.catch()` handler to `api.tabs.sendMessage`**: Same pattern as `sendStepToRuntime` — catch connection errors and handle them as a step failure with a descriptive message.

**Function**: `runStepLoop` (and callers of `sendStepToRuntime`)

**Specific Changes**:
4. **No changes needed in `runStepLoop`**: The existing failure handling logic (emit LOG, increment failCount, halt run or enter awaiting-action) already handles `{ ok: false, error: "..." }` results. By converting the rejection into a resolved value with `ok: false`, the existing flow handles the rest.

**File**: `packages/extension/src/panel.js`

**Specific Changes**:
5. **Display user-friendly guidance in the error message**: The panel already renders error messages from LOG entries. The key improvement is that the error text itself (produced by the background script) should contain actionable guidance like "Content script not available. Reload the page and try again." No structural panel changes should be needed — the existing error display should suffice if the message is well-crafted.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write unit tests that mock `api.tabs.sendMessage` to reject with "Could not establish connection. Receiving end does not exist." Call `sendStepToRuntime` and observe that the promise rejection is unhandled (on unfixed code).

**Test Cases**:
1. **sendStepToRuntime connection error**: Mock `api.tabs.sendMessage` to reject with connection error → observe unhandled rejection (will fail on unfixed code)
2. **sendUploadToRuntime connection error**: Mock `api.tabs.sendMessage` to reject with connection error during upload → observe unhandled rejection (will fail on unfixed code)
3. **Full run with connection error**: Start a run, mock the first step's sendMessage to reject → observe run hangs without summary or LOG (will fail on unfixed code)
4. **Upload step connection error during run**: Start a run with an upload step, mock sendMessage to reject → observe run hangs (will fail on unfixed code)

**Expected Counterexamples**:
- `sendStepToRuntime` returns a rejected promise that no caller handles
- `sendUploadToRuntime`'s `.then()` is never reached, and no `.catch()` exists
- Possible causes: missing `.catch()` on `api.tabs.sendMessage` return value

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := sendStepToRuntime_fixed(input.step, input.stepIndex)
  ASSERT result resolves (not rejects)
  ASSERT result.ok === false
  ASSERT result.error CONTAINS "content script"
  ASSERT runState.running === false (run halted)
  ASSERT safeSendMessage was called with RUN_COMPLETE
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT sendStepToRuntime_fixed(input) === sendStepToRuntime_original(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain (various step types, actions, targets)
- It catches edge cases that manual unit tests might miss (different error message formats, partial connection errors)
- It provides strong guarantees that behavior is unchanged for all non-connection-error scenarios

**Test Plan**: Observe behavior on UNFIXED code first for successful step executions and non-connection failures, then write property-based tests capturing that behavior.

**Test Cases**:
1. **Normal step execution preservation**: Verify that when `api.tabs.sendMessage` resolves with `{ ok: true }`, the result is passed through unchanged
2. **Non-connection failure preservation**: Verify that when `api.tabs.sendMessage` resolves with `{ ok: false, error: "Element not found" }`, the existing failure flow continues unchanged
3. **Upload success preservation**: Verify that successful upload steps continue to work identically
4. **Run completion preservation**: Verify that a full run with all steps succeeding produces the same summary as before

### Unit Tests

- Test `sendStepToRuntime` with mocked connection rejection → returns `{ ok: false, error: "..." }`
- Test `sendUploadToRuntime` with mocked connection rejection → emits LOG with error and RUN_COMPLETE
- Test that the error message contains actionable guidance (mentions reloading the page)
- Test that `runState` is properly cleaned up after a connection error (running=false, tab unlocked)

### Property-Based Tests

- Generate random step objects (various actions, targets, values) and verify that when `sendMessage` resolves normally, the result is unchanged by the fix
- Generate random error messages and verify that only "Could not establish connection" errors trigger the new handling; all other rejections propagate as before
- Test across many step configurations that the fix does not alter the happy-path timing or result shape

### Integration Tests

- Test a full run where the first step hits a connection error → run halts with correct summary
- Test a full run where a middle step hits a connection error → previous steps logged, run halts
- Test that after a connection error, the user can reload the page and run again successfully
