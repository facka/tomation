# Implementation Plan: Failure Recovery

## Overview

This plan extends the existing Tomation browser extension with failure recovery capabilities: retry failed action, skip failed action, and per-test-plan configuration (controlling retry/skip visibility and execution speed). Each task builds on the existing v1 implementation (background.js, panel.js, storage.js, runtime.js) using ES5-compatible vanilla JavaScript with Node's built-in `node:test` runner and fast-check for property-based testing.

The implementation progresses incrementally: storage/config layer → background orchestration → panel UI → property/integration tests → final checkpoint.

---

## Tasks

- [x] 1. Extend storage layer with test plan configuration
  - [x] 1.1 Add `getTestPlanConfig(key)` and `saveTestPlanConfig(key, config)` to `packages/extension/src/storage.js`
    - `getTestPlanConfig(key)` retrieves the config object from `browser.storage.local` using key format `"config:<specId>:<testIndex>"`
    - If stored value is missing or has wrong shape (missing fields, wrong types), return defaults: `{ allowContinueOnFailure: false, allowRetryOnFailure: false, executionSpeed: 'NORMAL' }`
    - `saveTestPlanConfig(key, config)` persists the config object; catch and log write failures without throwing
    - _Requirements: 3.11, 3.12, 3.13_

  - [x] 1.2 Write property test for configuration storage round-trip
    - **Property 6: Configuration Storage Round-Trip**
    - Generate random valid config objects (boolean toggles + speed enum); save then read back; verify equality
    - Also verify that corrupted/missing storage returns default config
    - **Validates: Requirements 3.11, 3.12**

  - [ ]* 1.3 Write unit tests for storage configuration
    - Test default return when no config exists for key
    - Test schema validation fallback for corrupted stored data
    - Test that write failures are caught and logged
    - _Requirements: 3.11, 3.12, 3.13_

- [x] 2. Checkpoint — storage tests pass
  - Ensure all tests pass, ask the user if questions arise.

---

- [x] 3. Extend background orchestration with awaiting-action state
  - [x] 3.1 Add speed delay infrastructure to `packages/extension/src/background.js`
    - Add `SPEED_DELAYS` map: `{ 'FAST': 0, 'NORMAL': 500, 'SLOW': 1500 }`
    - Implement `applySpeedDelay(speed)` function returning a Promise that resolves after the mapped delay; unknown values default to 0ms
    - _Requirements: 3.8, 3.9, 3.10_

  - [x] 3.2 Extend run state and step loop with `awaitingAction` state in `packages/extension/src/background.js`
    - Add fields to run state: `awaitingAction`, `failedStepIndex`, `retryAttempt`, `config`
    - Modify `runStepLoop`: insert `applySpeedDelay(config.executionSpeed)` before each `sendStepToRuntime` call
    - On step failure: if `config.allowRetryOnFailure || config.allowContinueOnFailure`, set `awaitingAction = true`, store `failedStepIndex`, emit `STEP_FAILED_AWAITING_ACTION` message to panel, and pause the loop (do NOT halt or unlock tab)
    - If neither flag is enabled, preserve existing v1 behavior (halt immediately)
    - _Requirements: 1.7, 3.8, 3.9, 3.10_

  - [x] 3.3 Implement `handleRetryStep(msg)` in `packages/extension/src/background.js`
    - Validate: ignore if `awaitingAction` is false or `msg.stepIndex !== failedStepIndex`
    - Increment `retryAttempt`; re-send the failed step via `sendStepToRuntime`
    - On `{ ok: true }`: set `awaitingAction = false`, increment `passCount`, advance `stepIndex`, emit LOG with `retryAttempt`, resume step loop
    - On `{ ok: false }`: halt run, emit failure LOG, unlock tab
    - _Requirements: 1.3, 1.4, 1.5_

  - [x] 3.4 Implement `handleSkipStep(msg)` in `packages/extension/src/background.js`
    - Validate: ignore if `awaitingAction` is false or `msg.stepIndex !== failedStepIndex`
    - Set `awaitingAction = false`, advance `stepIndex` to `failedStepIndex + 1` without modifying `passCount`
    - If `failedStepIndex` was the last step, emit `RUN_COMPLETE` with summary
    - Otherwise resume step loop from the next step
    - _Requirements: 2.3, 2.4_

  - [x] 3.5 Extend `handleMessage()` in `packages/extension/src/background.js` to route `RETRY_STEP` and `SKIP_STEP` messages
    - Also extend `RUN_TEST` handler to accept and store `config` field from the message payload (default to v1 behavior if config is missing)
    - _Requirements: 1.2, 2.2, 3.7_

  - [ ]* 3.6 Write property test: Retry re-executes only the failed step
    - **Property 2: Retry Re-executes Only the Failed Step**
    - Generate random run states with valid step arrays and failure positions; mock runtime responses; verify exactly one EXECUTE_STEP sent for the failed step
    - **Validates: Requirements 1.3, 1.4, 1.5**

  - [ ]* 3.7 Write property test: Awaiting-action state blocks step advancement
    - **Property 3: Awaiting-Action State Blocks Step Advancement**
    - Generate run states with `awaitingAction=true`; verify no step advancement, no EXECUTE_STEP, no RUN_COMPLETE emitted
    - **Validates: Requirements 1.7**

  - [ ]* 3.8 Write property test: Skip preserves progress and advances correctly
    - **Property 4: Skip Preserves Progress and Advances Correctly**
    - Generate random step arrays and failure positions; verify `passCount` unchanged, `stepIndex` advanced, run ends if last step
    - **Validates: Requirements 2.3, 2.4**

  - [ ]* 3.9 Write property test: Speed delay mapping
    - **Property 5: Speed Delay Mapping**
    - Generate random speed values from the enum + invalid values; verify correct delay returned (0, 500, 1500, or default 0)
    - **Validates: Requirements 3.8, 3.9, 3.10**

  - [ ]* 3.10 Write unit tests for background v2 orchestration
    - Test handleRetryStep when not in awaiting state (ignored)
    - Test handleRetryStep with invalid stepIndex (ignored)
    - Test handleSkipStep at last step ends run
    - Test handleSkipStep preserves passCount
    - Test step loop inserts correct delay for each speed setting
    - Test RUN_TEST without config field uses v1 defaults
    - _Requirements: 1.3, 1.4, 1.5, 2.3, 2.4, 3.8, 3.9, 3.10_

- [x] 4. Checkpoint — background orchestration tests pass
  - Ensure all tests pass, ask the user if questions arise.

---

- [x] 5. Implement panel configuration section
  - [x] 5.1 Add configuration UI to Test Plan view in `packages/extension/src/panel.js`
    - Render a "Configuration" section between the step checklist and the Run button
    - Include "Allow continue on failure" toggle (checkbox), default disabled
    - Include "Allow retry on failure" toggle (checkbox), default disabled
    - Include "Execution speed" selector (`<select>`) with FAST, NORMAL, SLOW options, default NORMAL
    - On view open: call `getTestPlanConfig(key)` and restore saved values (or defaults if none saved)
    - On any control change: call `saveTestPlanConfig(key, config)` with full config object
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.12, 3.13_

  - [x] 5.2 Extend `RUN_TEST` message to include config in `packages/extension/src/panel.js`
    - When Run button is clicked, include `config: { allowContinueOnFailure, allowRetryOnFailure, executionSpeed }` in the `RUN_TEST` message payload, reading current values from the UI controls
    - _Requirements: 3.7_

  - [ ]* 5.3 Write property test: RUN_TEST message includes configuration
    - **Property 7: RUN_TEST Message Includes Configuration**
    - Generate random config UI states (boolean toggles + speed values); simulate Run click; verify message payload matches UI state
    - **Validates: Requirements 3.7**

---

- [x] 6. Implement retry/skip buttons in Run view
  - [x] 6.1 Handle `STEP_FAILED_AWAITING_ACTION` message in Run view in `packages/extension/src/panel.js`
    - When panel receives `STEP_FAILED_AWAITING_ACTION`: render "Try Again" button if `config.allowRetryOnFailure` is true; render "Skip" button if `config.allowContinueOnFailure` is true
    - Buttons appear adjacent to the failed log entry, "Try Again" before "Skip" when both shown
    - On "Try Again" click: send `RETRY_STEP` message with `stepIndex`, disable both buttons
    - On "Skip" click: send `SKIP_STEP` message with `stepIndex`, disable both buttons
    - _Requirements: 1.1, 1.2, 1.8, 1.9, 2.1, 2.2, 2.6, 2.7, 2.8_

  - [x] 6.2 Handle retry attempt display and skip badge in Run view in `packages/extension/src/panel.js`
    - When LOG message has `retryAttempt` field: update the log entry to show "Attempt N" alongside status
    - When a step is skipped: replace fail indicator with "skipped" badge and apply muted styling (grey text)
    - _Requirements: 1.6, 2.5_

  - [ ]* 6.3 Write property test: Failure action button visibility matches configuration
    - **Property 1: Failure Action Button Visibility Matches Configuration**
    - Generate random `{ allowRetryOnFailure, allowContinueOnFailure }` configs and step failure events; verify button presence/absence matches config flags exactly
    - **Validates: Requirements 1.1, 1.8, 2.1, 2.6, 3.5, 3.6**

---

- [ ] 7. Integration wiring and final tests
  - [ ]* 7.1 Write integration tests for retry flow
    - Panel sends RETRY_STEP → Background re-dispatches → mock Runtime responds ok → Panel updates log with pass status and attempt count
    - Panel sends RETRY_STEP → Background re-dispatches → mock Runtime responds fail → run halts, tab unlocked
    - _Requirements: 1.3, 1.4, 1.5, 1.6_

  - [ ]* 7.2 Write integration tests for skip flow
    - Panel sends SKIP_STEP → Background advances → next step executes → Panel logs with skipped badge
    - Panel sends SKIP_STEP on last step → run ends with RUN_COMPLETE summary
    - _Requirements: 2.3, 2.4, 2.5_

  - [ ]* 7.3 Write integration tests for speed delay end-to-end
    - Panel sends RUN_TEST with SLOW config → verify Background inserts 1500ms delay before each step dispatch
    - _Requirements: 3.8, 3.9, 3.10_

- [x] 8. Final checkpoint — all failure recovery tests pass
  - Run full test suite: `node --test` in `packages/extension/`
  - Verify all property tests pass with minimum 100 iterations
  - Ensure all tests pass, ask the user if questions arise.

---

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP iteration
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation throughout the build
- Property tests use fast-check (v3.23.2, already in devDependencies) with minimum 100 iterations per property
- Unit tests use Node's built-in `node:test` runner
- DOM-dependent panel tests use jsdom (already in devDependencies)
- The extension uses ES5-compatible vanilla JS — no modern syntax, no bundler
- All changes extend existing files (background.js, panel.js, storage.js) rather than creating new modules
- The `config` field in `RUN_TEST` defaults to v1 behavior when absent, preserving backward compatibility

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "3.1"] },
    { "id": 2, "tasks": ["3.2"] },
    { "id": 3, "tasks": ["3.3", "3.4", "3.5", "3.9"] },
    { "id": 4, "tasks": ["3.6", "3.7", "3.8", "3.10"] },
    { "id": 5, "tasks": ["5.1"] },
    { "id": 6, "tasks": ["5.2", "5.3"] },
    { "id": 7, "tasks": ["6.1"] },
    { "id": 8, "tasks": ["6.2", "6.3"] },
    { "id": 9, "tasks": ["7.1", "7.2", "7.3"] }
  ]
}
```
