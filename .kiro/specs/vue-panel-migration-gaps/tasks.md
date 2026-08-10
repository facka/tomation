# Implementation Plan

## Overview

Fix 14 functional parity gaps in the Vue 3 panel migration by implementing missing features from the original panel.js. Uses the bugfix workflow: explore (write tests to confirm gaps), preserve (capture existing behavior), implement (apply fixes), validate (verify fixes and no regressions).

## Tasks

- [ ] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Vue Panel Migration Gap Features Missing
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bugs exist
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fixes when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the 14 migration gaps exist in the unfixed code
  - **Scoped PBT Approach**: Scope the property to the concrete failing cases for each gap:
    - Tab sync: `App.vue` does not register `tabs.onActivated`/`tabs.onUpdated` → hostname never changes on tab switch
    - Error view: `currentView === 'error'` renders nothing (no ErrorView component)
    - Config persistence: `TestPlanView.onRun()` never calls `saveTestPlanConfig`
    - Param persistence: `RUN_COMPLETE` handler never calls `saveParamValues` on zero failures
    - Required params: `quickRunAutomation()` calls `buildDefaultParams()` without checking `hasRequiredParamsWithoutValues()`
    - Saved speed: `quickRunTest()`/`quickRunAutomation()` hardcode `executionSpeed: 'NORMAL'`
    - Close on pause: `RunView` close button shows only when `runComplete` is true
    - ResolvedContext: `LogEntry` `valueDisplay` uses raw value without replacing `{{ctx.key}}` placeholders
    - Sensitive masking: `ContextPopup` `formatValue()` returns raw string without sensitive key check
    - Escape key: `ContextPopup` has no `keydown` listener for Escape
    - URL warning: `LoadedHeader` has no `meta.urls` mismatch banner
    - Multiple files: `useFileLoader.handleDrop()` takes `files[0]` without checking `files.length > 1`
    - Truncation: `ContextPopup` displays full values without 30-char limit
    - Back-to-home: Verify `RunSummary` back button renders in all completion states
  - Write unit tests (Vitest) for representative cases:
    - Test that `ContextPopup` does NOT mask a value with key `apiKey` (confirms gap 9)
    - Test that `ContextPopup` does NOT close on Escape keydown (confirms gap 10)
    - Test that `useFileLoader.handleDrop()` with 3 files processes first without error (confirms gap 12)
    - Test that `ContextPopup` shows full 50-char value without truncation (confirms gap 13)
    - Test that `RunView` close button is NOT visible when `isPaused: true` (confirms gap 7)
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests FAIL (this is correct - it proves the bugs exist)
  - Document counterexamples found to confirm root cause analysis
  - Mark task complete when tests are written, run, and failures are documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 1.11, 1.12, 1.13, 1.14_

- [ ] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Existing Vue Panel Behavior Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - **Observe behavior on UNFIXED code** for non-buggy inputs (cases where isBugCondition returns false):
    - Observe: Initial mount queries active tab URL and loads project for detected hostname
    - Observe: Views `home`, `test-plan`, `run` render their components correctly
    - Observe: When no saved config exists, defaults (NORMAL speed, no debug) are applied
    - Observe: Automation params are NOT persisted on failed runs
    - Observe: Quick-run with all required params having saved values runs directly
    - Observe: Context popup closes on backdrop click
    - Observe: Single valid `.tomation.json` file drop loads normally
    - Observe: Values ≤ 30 chars display without truncation in ContextPopup
    - Observe: Non-sensitive keys display values unmasked
    - Observe: Close button (✕) navigates back to home after run complete
  - Write property-based tests (Vitest + fast-check) capturing observed behavior:
    - Property: For all non-sensitive keys (not matching `/password|secret|token|key|auth/i`), values are displayed unmasked
    - Property: For all string values of length ≤ 30, full value is displayed without truncation
    - Property: For all single-file drops with valid `.tomation.json`, file loads successfully
    - Property: For all RunConfig objects with no persisted config, defaults are used (speed = NORMAL)
    - Property: Backdrop click always closes context popup
  - Verify tests PASS on UNFIXED code (confirms baseline behavior to preserve)
  - **EXPECTED OUTCOME**: Tests PASS
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12, 3.13, 3.14_

- [x] 3. Implement store persistence functions

  - [ ] 3.1 Add `resolvedContext` field to `LogEntry` interface in `types/store.ts`
    - Add `resolvedContext?: Array<{ key: string; value: unknown }>` to the `LogEntry` interface
    - _Requirements: 2.8_

  - [ ] 3.2 Add `saveTestPlanConfig` and `getTestPlanConfig` to store
    - Add `saveTestPlanConfig(specId: string, runnableIndex: number, config: RunConfig): Promise<void>` — persists config to storage keyed by `config:<specId>:<runnableIndex>`
    - Add `getTestPlanConfig(specId: string, runnableIndex: number): Promise<RunConfig | null>` — loads persisted config with validation, returns null if missing
    - _Bug_Condition: isBugCondition(input) where input.type == 'RUN_FROM_PLAN' AND config not persisted_
    - _Expected_Behavior: Config persists to storage and restores next session_
    - _Preservation: When no persisted config exists, defaults (NORMAL speed, no debug) are used_
    - _Requirements: 2.3, 2.6, 3.3, 3.6_

  - [ ] 3.3 Add `saveParamValues` and `loadParamValues` to store
    - Add `saveParamValues(hostname: string, automationName: string, params: Record<string, unknown>): Promise<void>` — persists params into `project.savedParams[automationName]`
    - Add `loadParamValues(hostname: string, automationName: string): Promise<Record<string, unknown> | null>` — loads saved param values from project storage
    - _Bug_Condition: isBugCondition(input) where input.type == 'RUN_COMPLETE' AND failures == 0 AND params not persisted_
    - _Expected_Behavior: Params persist on zero-failure completion and load on next session_
    - _Preservation: Params are NOT persisted when failures > 0_
    - _Requirements: 2.4, 3.4_

  - [ ] 3.4 Add `hasRequiredParamsWithoutValues` helper to store
    - Add `hasRequiredParamsWithoutValues(params: AutomationParam[], savedValues: Record<string, unknown> | null): boolean` — returns true if any required param lacks a saved value
    - _Bug_Condition: isBugCondition(input) where input.type == 'QUICK_RUN_AUTOMATION' AND hasRequiredParamsWithoutValues_
    - _Expected_Behavior: Returns true when any required param has no saved value_
    - _Preservation: Returns false when all required params have saved values_
    - _Requirements: 2.5, 3.5_

- [x] 4. Implement App.vue changes (tab sync, error view, param persistence)

  - [ ] 4.1 Add tab sync listeners in `App.vue` `onMounted`
    - Register `api.tabs.onActivated` listener that calls `syncToActiveTab()`
    - Register `api.tabs.onUpdated` listener (on URL change) that calls `syncToActiveTab()`
    - `syncToActiveTab()` checks `store.state.isRunning` — if true, skip. Otherwise query active tab URL, extract hostname, compare with `state.currentHostname`, and if different, call `loadProjectFromStorage(newHostname)`
    - Clean up listeners in `onUnmounted`
    - _Bug_Condition: isBugCondition(input) where input.type == 'TAB_SWITCH' AND panel is mounted_
    - _Expected_Behavior: Panel reloads project for new hostname on tab switch_
    - _Preservation: During active run, tab switch is ignored; initial mount behavior unchanged_
    - _Requirements: 2.1, 3.1, 3.7_

  - [ ] 4.2 Add ErrorView rendering in `App.vue` template
    - Import `ErrorView` component
    - Add `<ErrorView v-if="store.state.currentView === 'error'" />` to the template
    - _Bug_Condition: isBugCondition(input) where input.type == 'SPEC_ERROR' AND state.errorMessage is set_
    - _Expected_Behavior: ErrorView renders when currentView === 'error'_
    - _Preservation: Home, test-plan, and run views render without interference_
    - _Requirements: 2.2, 3.2_

  - [ ] 4.3 Create `ErrorView.vue` component
    - New file: `packages/extension/panel-vue/src/components/ErrorView.vue`
    - Display `store.state.errorMessage` with error styling
    - Add a dismiss button that sets `state.errorMessage = null` and navigates to home
    - _Requirements: 2.2_

  - [ ] 4.4 Persist automation params on successful run complete
    - In `App.vue` `handleBackgroundMessage` for `RUN_COMPLETE`: check `msg.failed === 0` AND `store.state.automationParams` is not null AND `store.state.currentRunnable?.type === 'automation'`
    - If conditions met, call `saveParamValues(hostname, automationName, params)`
    - _Bug_Condition: isBugCondition(input) where input.type == 'RUN_COMPLETE' AND failures == 0 AND params not persisted_
    - _Expected_Behavior: Params saved to storage on successful completion_
    - _Preservation: Params NOT saved when failures > 0_
    - _Requirements: 2.4, 3.4_

  - [ ] 4.5 Set view to 'error' on `BUNDLED_SPEC_ERROR`
    - In `App.vue` `handleBackgroundMessage` for `BUNDLED_SPEC_ERROR`: after setting `errorMessage`, also call `store.setView('error')`
    - _Requirements: 2.2_

- [x] 5. Implement HomeView.vue changes (quick run improvements)

  - [ ] 5.1 Add required params check to `quickRunAutomation`
    - Load saved params via `loadParamValues(hostname, automationName)`
    - Call `hasRequiredParamsWithoutValues(automation.params, savedValues)`
    - If returns true, navigate to test-plan view instead of running (call `selectRunnable` then `setView('test-plan')`)
    - If returns false, use saved params for the run
    - _Bug_Condition: isBugCondition(input) where input.type == 'QUICK_RUN_AUTOMATION' AND hasRequiredParamsWithoutValues_
    - _Expected_Behavior: Falls back to test-plan view when required params missing_
    - _Preservation: Quick-run proceeds directly when all required params have saved values_
    - _Requirements: 2.5, 3.5_

  - [ ] 5.2 Load saved execution speed for quick-run
    - In both `quickRunTest()` and `quickRunAutomation()`, call `getTestPlanConfig(specId, runnableIndex)` to load persisted config
    - Use `config.executionSpeed` if available, otherwise fall back to `'NORMAL'`
    - _Bug_Condition: isBugCondition(input) where input.type == 'QUICK_RUN' AND speed not loaded from storage_
    - _Expected_Behavior: Uses persisted speed from storage_
    - _Preservation: Falls back to NORMAL when no persisted config exists_
    - _Requirements: 2.6, 3.6_

- [x] 6. Implement TestPlanView.vue changes (config persistence)

  - [ ] 6.1 Load persisted config on mount
    - In `TestPlanView` `onMounted`, call `getTestPlanConfig(specId, runnableIndex)`
    - Apply loaded config values to the ConfigSection component state
    - _Preservation: When no persisted config exists, defaults are shown_
    - _Requirements: 2.3, 3.3_

  - [ ] 6.2 Persist config on run
    - In `onRun()` handler, call `saveTestPlanConfig(specId, runnableIndex, config)` before sending the run message
    - _Bug_Condition: isBugCondition(input) where input.type == 'RUN_FROM_PLAN' AND config not persisted_
    - _Expected_Behavior: Config saved to storage keyed by specId and runnableIndex_
    - _Requirements: 2.3_

- [x] 7. Implement RunView.vue changes (close button on pause/stop)

  - [ ] 7.1 Show close button when paused or stopped
    - Change close button `v-if` from `runComplete` to `runComplete || isPaused || (!isRunning && logEntries.length > 0)`
    - Import `isPaused` and `isRunning` computed refs (or add them from store)
    - _Bug_Condition: isBugCondition(input) where input.type == 'PAUSE_OR_STOP' AND close button not shown_
    - _Expected_Behavior: Close button visible when paused or stopped_
    - _Preservation: Close button hidden during active execution; visible after runComplete_
    - _Requirements: 2.7, 3.7, 3.14_

- [x] 8. Implement LogEntry.vue changes (resolvedContext display)

  - [ ] 8.1 Replace `{{ctx.key}}` placeholders with resolved values
    - In `valueDisplay` computed, if `entry.resolvedContext` exists and has items, iterate over each `{key, value}` and replace all `{{ctx.key}}` occurrences in the displayed string with the resolved value
    - _Bug_Condition: isBugCondition(input) where input.type == 'LOG_ENTRY' AND resolvedContext.length > 0_
    - _Expected_Behavior: Placeholders replaced with resolved values_
    - _Preservation: Entries without resolvedContext display value as-is_
    - _Requirements: 2.8, 3.8_

  - [ ] 8.2 Show "from ctx.key" annotation
    - Render a `<span class="ctx-source">` after the value showing which context keys were resolved (e.g., "from ctx.name, ctx.email")
    - Only show when `resolvedContext` has items
    - _Requirements: 2.8_

  - [ ] 8.3 Propagate `resolvedContext` from LOG message to store
    - In `App.vue` `handleBackgroundMessage` for `LOG`: pass `msg.resolvedContext` into `setStepStatus` meta
    - In `store.setStepStatus`: if `meta.resolvedContext` is provided, set `entry.resolvedContext`
    - _Requirements: 2.8_

- [x] 9. Implement ContextPopup.vue changes (masking, escape, truncation)

  - [ ] 9.1 Add sensitive key masking
    - Add `isSensitiveKey(key: string): boolean` function that checks against `/password|secret|token|key|auth/i`
    - In `contextEntries` computed, if `isSensitiveKey(key)` is true, display `****` instead of the value
    - _Bug_Condition: isBugCondition(input) where input.type == 'CONTEXT_POPUP_DISPLAY' AND isSensitiveKey(key)_
    - _Expected_Behavior: Sensitive values masked with `****`_
    - _Preservation: Non-sensitive keys display values unmasked_
    - _Requirements: 2.9, 3.9_

  - [ ] 9.2 Add Escape key handler
    - Register a `keydown` event listener on `document` in `onMounted` that emits `close` when `event.key === 'Escape'`
    - Remove listener in `onUnmounted`
    - _Bug_Condition: isBugCondition(input) where input.type == 'KEYDOWN_ESCAPE' AND contextPopup is open_
    - _Expected_Behavior: Popup closes on Escape key press_
    - _Preservation: Backdrop click continues to close popup_
    - _Requirements: 2.10, 3.10_

  - [ ] 9.3 Add value truncation with tooltip
    - If formatted value length > 30, truncate to 30 chars + `…` and add a `title` attribute with the full value
    - Values of 30 characters or fewer display without truncation
    - _Bug_Condition: isBugCondition(input) where input.type == 'CONTEXT_POPUP_DISPLAY' AND value.length > 30_
    - _Expected_Behavior: Long values truncated with ellipsis and full value in tooltip_
    - _Preservation: Values ≤ 30 chars show in full without truncation_
    - _Requirements: 2.13, 3.13_

- [x] 10. Implement LoadedHeader.vue changes (URL warning banner)

  - [ ] 10.1 Add URL mismatch warning banner
    - Compare spec's `meta.urls` (or `meta.url`) against `store.state.currentHostname`
    - If no URL in the spec matches the current hostname, render a warning banner (e.g., "This spec targets [urls] but current site is [hostname]")
    - Do NOT show banner when URLs match
    - _Bug_Condition: isBugCondition(input) where input.type == 'SPEC_LOADED' AND meta.urls do not match hostname_
    - _Expected_Behavior: Warning banner displayed for URL mismatch_
    - _Preservation: No banner when URLs match current hostname_
    - _Requirements: 2.11, 3.11_

- [x] 11. Implement useFileLoader.ts changes (multiple files error)

  - [ ] 11.1 Add multiple files validation in `handleDrop`
    - Before `handleFile(files[0])`, check `files.length > 1`
    - If true, set `error.value = 'Only a single file can be loaded at a time'` and return without processing any file
    - _Bug_Condition: isBugCondition(input) where input.type == 'FILE_DROP' AND files.length > 1_
    - _Expected_Behavior: Error message shown, no file processed_
    - _Preservation: Single file drops continue to work normally_
    - _Requirements: 2.12, 3.12_

- [x] 12. Verify RunSummary.vue back-to-home button

  - [x] 12.1 Confirm "Back to Home" button renders in all completion states
    - Verify `RunSummary.vue` has a distinct "Back to Home" button that renders for both `RUN_COMPLETE` and `RUN_STOPPED` states
    - If missing or conditional, add/fix it so it always appears below the summary alongside the ✕ close button
    - _Bug_Condition: isBugCondition(input) where input.type == 'RUN_COMPLETE_SUMMARY' AND no back-to-home button_
    - _Expected_Behavior: Distinct "Back to Home" button displayed below summary_
    - _Preservation: ✕ close button continues to navigate to home_
    - _Requirements: 2.14, 3.14_

- [ ] 13. Verify bug condition exploration test now passes

  - [ ] 13.1 Re-run bug condition exploration test
    - **Property 1: Expected Behavior** - Vue Panel Migration Gap Features Function Correctly
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior for all 14 gaps
    - When this test passes, it confirms the expected behavior is satisfied
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms bugs are fixed)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 2.12, 2.13, 2.14_

  - [ ] 13.2 Verify preservation tests still pass
    - **Property 2: Preservation** - Existing Vue Panel Behavior Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all tests still pass after fix (no regressions)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12, 3.13, 3.14_

- [ ] 14. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.


## Task Dependency Graph

```json
{
  "waves": [
    ["1", "2"],
    ["3"],
    ["4", "5", "6", "7", "8", "9", "10", "11", "12"],
    ["13"],
    ["14"]
  ]
}
```

## Notes

- Tasks 1 and 2 MUST be completed BEFORE any implementation tasks (3-12)
- Task 1 tests are expected to FAIL on unfixed code (confirms bugs exist)
- Task 2 tests are expected to PASS on unfixed code (captures baseline behavior)
- Tasks 3-12 can be executed in dependency order (3 first, then 4-12 in parallel where possible)
- Task 13 re-runs the same tests from tasks 1 and 2 to validate fixes
- Task 14 is the final checkpoint ensuring everything passes
