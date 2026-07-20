# Implementation Plan: Content Script Connection Error Bugfix

## Overview

Fix the unhandled promise rejection in `sendStepToRuntime` and `sendUploadToRuntime` when `api.tabs.sendMessage` rejects with "Could not establish connection. Receiving end does not exist." Add `.catch()` handlers that detect this specific error and return `{ ok: false, error: "..." }` with a user-friendly message, allowing the existing `runStepLoop` failure handling to display the error in the panel.

## Tasks

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Connection Error Produces Unhandled Rejection
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists
  - **Scoped PBT Approach**: Scope the property to the concrete failing case: `api.tabs.sendMessage` rejects with "Could not establish connection. Receiving end does not exist."
  - Mock `api.tabs.sendMessage` to reject with `Error("Could not establish connection. Receiving end does not exist.")`
  - Test that `sendStepToRuntime` resolves (not rejects) with `{ ok: false, error: <string containing "content script"> }`
  - Test that `sendUploadToRuntime` resolves (not rejects) with a graceful failure (emits LOG with error, sends RUN_COMPLETE)
  - Test that after the connection error, `runState.running === false` (run halted gracefully)
  - Test that `safeSendMessage` was called with a RUN_COMPLETE message containing the error
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bug exists: sendStepToRuntime rejects instead of resolving with a failure object)
  - Document counterexamples found: `sendStepToRuntime` returns a rejected promise that no caller handles; `sendUploadToRuntime`'s `.then()` is never reached and no `.catch()` exists
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Normal Step Execution Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - Observe: when `api.tabs.sendMessage` resolves with `{ ok: true, result: ... }`, `sendStepToRuntime` passes through the result unchanged on unfixed code
  - Observe: when `api.tabs.sendMessage` resolves with `{ ok: false, error: "Element not found" }`, the existing failure flow continues unchanged on unfixed code
  - Observe: when upload steps succeed, `sendUploadToRuntime` processes the result through `.then()` identically on unfixed code
  - Write property-based tests: for all step objects (various actions, targets, values) where `api.tabs.sendMessage` resolves successfully, the result from `sendStepToRuntime` is identical to the mocked response
  - Write property-based tests: for all non-connection error failures (e.g., element not found, timeout), the failure is reported through existing LOG/RUN_COMPLETE flow unchanged
  - Write property-based tests: `safeSendMessage` behavior for `api.runtime.sendMessage` remains unchanged (console log on error, no crash)
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3_

- [x] 3. Fix for content script connection error

  - [x] 3.1 Add .catch() handler to sendStepToRuntime
    - In `packages/extension/src/background.js`, add a `.catch()` to the `api.tabs.sendMessage` call in `sendStepToRuntime`
    - Detect errors where `error.message` contains "Could not establish connection"
    - Return `{ ok: false, error: "Content script not available on this tab. Reload the page and try again." }` for connection errors
    - Re-throw non-connection errors so they propagate as before
    - _Bug_Condition: isBugCondition(input) where api.tabs.sendMessage rejects with "Could not establish connection. Receiving end does not exist."_
    - _Expected_Behavior: resolves with { ok: false, error: "Content script not available on this tab. Reload the page and try again." }_
    - _Preservation: Non-connection errors re-thrown; successful responses passed through unchanged_
    - _Requirements: 2.1, 2.3, 3.1, 3.2_

  - [x] 3.2 Add .catch() handler to sendUploadToRuntime
    - In `packages/extension/src/background.js`, add a `.catch()` to the `api.tabs.sendMessage` call in `sendUploadToRuntime`
    - Same pattern as sendStepToRuntime: detect "Could not establish connection" errors
    - Return `{ ok: false, error: "Content script not available on this tab. Reload the page and try again." }` for connection errors
    - Re-throw non-connection errors so they propagate as before
    - _Bug_Condition: isBugCondition(input) where api.tabs.sendMessage rejects with "Could not establish connection. Receiving end does not exist."_
    - _Expected_Behavior: resolves with { ok: false, error: "Content script not available on this tab. Reload the page and try again." }_
    - _Preservation: Non-connection errors re-thrown; successful responses passed through unchanged_
    - _Requirements: 2.2, 2.3, 3.1, 3.2_

  - [x] 3.3 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Connection Error Produces Graceful Halt
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior (resolves with `{ ok: false }`, run halts, RUN_COMPLETE sent)
    - When this test passes, it confirms the expected behavior is satisfied
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 3.4 Verify preservation tests still pass
    - **Property 2: Preservation** - Normal Step Execution Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all tests still pass after fix (no regressions)
    - _Requirements: 3.1, 3.2, 3.3_

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- The fix targets `packages/extension/src/background.js` only — no panel changes needed
- The existing `runStepLoop` failure handling already processes `{ ok: false }` results and emits LOG + RUN_COMPLETE
- The error message is crafted to be user-friendly and actionable (mentions reloading the page)
- `safeSendMessage` for `api.runtime.sendMessage` (panel communication) is NOT affected by this fix
- All code must follow the existing ES5 style (var, function declarations, no arrow functions)
- Property-based tests use fast-check to generate diverse step objects and error messages

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1", "2"] },
    { "id": 1, "tasks": ["3.1", "3.2"] },
    { "id": 2, "tasks": ["3.3", "3.4"] },
    { "id": 3, "tasks": ["4"] }
  ]
}
```
