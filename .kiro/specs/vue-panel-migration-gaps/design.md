# Vue Panel Migration Gaps Bugfix Design

## Overview

The Vue 3 panel (`packages/extension/panel-vue/`) is missing 14 features that exist in the original panel (`packages/extension/src/panel.js`). These are functional parity gaps — the Vue panel compiles and renders correctly, but silently omits behaviors users depend on. This design formalizes the bug condition, identifies root causes in the Vue codebase, and plans targeted fixes that maintain existing working behavior.

## Glossary

- **Bug_Condition (C)**: Any user interaction or system event that triggers one of the 14 missing feature paths — tab sync, error view, config persistence, param persistence, required params check, saved config loading, close-on-pause, resolvedContext display, sensitive masking, escape key, URL warning, multiple files error, value truncation, or back-to-home button
- **Property (P)**: The desired behavior matching the original panel implementation for each gap
- **Preservation**: All existing Vue panel behaviors that must remain unchanged — initial mount, view routing, defaults when no config exists, failure-only param non-persistence, quick-run with saved values, active-run controls, plain log entries, non-sensitive values, backdrop close, matching URLs, single file drop, short values, and close button navigation
- **store (Pinia-like reactive store)**: `packages/extension/panel-vue/src/store/index.ts` — central state management
- **useMessaging**: Composable wrapping `chrome.runtime` messaging between panel and background script
- **useFileLoader**: Composable handling drag-drop file loading and validation
- **syncToActiveTab()**: Original panel function that detects tab changes and reloads the project for the new hostname (skipping if a run is in progress)

## Bug Details

### Bug Condition

The bug manifests when a user interacts with any of 14 feature paths that exist in the original panel but are absent or incomplete in the Vue panel. The `App.vue` does not register `tabs.onActivated`/`tabs.onUpdated` listeners, the `TestPlanView` does not persist config, the `HomeView` quick-run does not check required params or load saved speed, the `RunView` only shows close on `runComplete`, `LogEntry` ignores `resolvedContext`, `ContextPopup` lacks masking/escape/truncation, `LoadedHeader` has no URL warning, `useFileLoader` silently drops extra files, and `RunSummary` has no distinct back button.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type UserInteraction | SystemEvent
  OUTPUT: boolean
  
  RETURN (input.type == 'TAB_SWITCH' AND panel is mounted)
         OR (input.type == 'SPEC_ERROR' AND state.errorMessage is set)
         OR (input.type == 'RUN_FROM_PLAN' AND config not persisted)
         OR (input.type == 'RUN_COMPLETE' AND failures == 0 AND params not persisted)
         OR (input.type == 'QUICK_RUN_AUTOMATION' AND hasRequiredParamsWithoutValues)
         OR (input.type == 'QUICK_RUN' AND speed not loaded from storage)
         OR (input.type == 'PAUSE_OR_STOP' AND close button not shown)
         OR (input.type == 'LOG_ENTRY' AND resolvedContext.length > 0)
         OR (input.type == 'CONTEXT_POPUP_DISPLAY' AND isSensitiveKey(key))
         OR (input.type == 'KEYDOWN_ESCAPE' AND contextPopup is open)
         OR (input.type == 'SPEC_LOADED' AND meta.urls do not match hostname)
         OR (input.type == 'FILE_DROP' AND files.length > 1)
         OR (input.type == 'CONTEXT_POPUP_DISPLAY' AND value.length > 30)
         OR (input.type == 'RUN_COMPLETE_SUMMARY' AND no back-to-home button)
END FUNCTION
```

### Examples

- **Tab sync**: User has Vue panel open on `example.com`, switches to a tab on `other.com` → panel stays showing `example.com` project (expected: reload for `other.com`)
- **Error view**: Background sends `BUNDLED_SPEC_ERROR` → `errorMessage` is set but nothing renders (expected: ErrorView component displays the message)
- **Config persistence**: User sets speed to SLOW, runs test, closes panel, reopens → speed is NORMAL again (expected: SLOW persisted and restored)
- **Quick run required params**: Automation has `username` (required) with no saved value → runs with empty string (expected: falls back to test plan view)
- **Close on pause**: User pauses a run → no way to navigate away (expected: close/back button appears)
- **Resolved context**: Log entry value is `"Hello {{ctx.name}}"` with resolvedContext `[{key: "name", value: "World"}]` → shows literal `{{ctx.name}}` (expected: shows `"Hello World"` + "from ctx.name")
- **Sensitive masking**: Context popup shows `apiKey: "sk-12345..."` unmasked (expected: `****`)
- **Multiple files**: User drops 3 files → first one loads silently (expected: error message, no file loaded)

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Initial panel mount queries active tab and loads project for detected hostname exactly as today
- Views `home`, `test-plan`, and `run` render their components without interference from new error view
- When no persisted config exists, defaults (NORMAL speed, no debug) are used
- Automation param values are only persisted on zero-failure runs
- Quick-run with all required params having saved values proceeds directly without showing plan view
- When no persisted config exists for quick-run, default speed (NORMAL) is used
- During active execution (not paused/stopped), close button remains hidden with only pause/stop visible
- Log entries without `resolvedContext` display value as-is
- Non-sensitive context keys display unmasked
- Backdrop click continues to close context popup
- Specs with matching `meta.urls` show no warning
- Single valid `.tomation.json` file drops load normally
- Values of 30 characters or fewer display without truncation
- The ✕ close button continues to navigate back to home

**Scope:**
All user interactions and system events that do NOT fall into the 14 identified gap conditions should behave identically to the current Vue panel implementation.

## Hypothesized Root Cause

Based on the bug analysis and code review, the root causes are straightforward omissions during the Vue migration:

1. **Tab Sync Listeners Missing**: `App.vue` `onMounted` only queries the initial active tab but never registers `api.tabs.onActivated` or `api.tabs.onUpdated` listeners. The original panel registers these in its `init()` function.

2. **ErrorView Component Missing**: `App.vue` template only conditionally renders `HomeView`, `TestPlanView`, and `RunView`. No `ErrorView` component exists, and `currentView === 'error'` renders nothing.

3. **Config Not Persisted on Run**: `TestPlanView.onRun()` reads config from `ConfigSection` but never calls `saveTestPlanConfig`. The original panel calls `saveTestPlanConfig` in `onConfigChange()` and on run start.

4. **Params Not Persisted on Success**: `App.vue` handles `RUN_COMPLETE` by calling `store.setRunComplete()` but never checks `failed === 0` to persist params. The original panel does this in `showRunSummary()`.

5. **Quick Run Skips Required Params Check**: `HomeView.quickRunAutomation()` calls `buildDefaultParams()` directly without loading saved values or checking `hasRequiredParamsWithoutValues()`.

6. **Quick Run Hardcodes Speed**: `HomeView.quickRunTest/quickRunAutomation()` hardcode `executionSpeed: 'NORMAL'` instead of loading from storage via `getTestPlanConfig()`.

7. **Close Button Only on runComplete**: `RunView` shows the ✕ button only when `runComplete` is true. It should also show when paused or stopped.

8. **ResolvedContext Not Processed**: `LogEntry.vue` `valueDisplay` computed uses raw `entry.value` without replacing `{{ctx.key}}` placeholders, and doesn't render "from ctx.key" annotations.

9. **No Sensitive Key Masking**: `ContextPopup.vue` `formatValue()` returns the raw string without checking if the key matches the sensitive pattern.

10. **No Escape Key Handler**: `ContextPopup.vue` doesn't register a `keydown` listener for Escape. Only the backdrop click and ✕ button close it.

11. **No URL Warning Banner**: `LoadedHeader.vue` renders spec name and file info but doesn't check `meta.urls` against `currentHostname` to show a mismatch warning.

12. **Multiple Files Silently Ignored**: `useFileLoader.handleDrop()` takes `files[0]` without checking `files.length > 1` or showing an error.

13. **No Value Truncation**: `ContextPopup.vue` displays full values regardless of length — no 30-char truncation with tooltip.

14. **Back-to-Home Already Present** (partially): `RunSummary.vue` already has a "← Back to Home" button. However the bugfix.md indicates it's not rendered — this may be a conditional rendering issue where `RunSummary` doesn't show in all completion states, or the requirement is for it to be more prominent.

## Correctness Properties

Property 1: Bug Condition - Migration Gap Features Function Correctly

_For any_ user interaction or system event where the bug condition holds (isBugCondition returns true), the fixed Vue panel SHALL produce behavior matching the original panel.js implementation: tab sync reloads projects, errors render in ErrorView, configs persist to storage, params save on success, required params trigger plan fallback, saved speed loads for quick-run, close button shows on pause/stop, resolvedContext replaces placeholders and shows annotations, sensitive keys are masked, Escape closes popup, URL mismatches show warnings, multiple files show errors, long values truncate with tooltip, and run summary shows back button.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 2.12, 2.13, 2.14**

Property 2: Preservation - Existing Vue Panel Behavior Unchanged

_For any_ user interaction or system event where the bug condition does NOT hold (isBugCondition returns false), the fixed Vue panel SHALL produce the same behavior as the current unfixed Vue panel, preserving initial mount behavior, view routing, default config usage, failure-run non-persistence, direct quick-run with saved values, default speed fallback, active-run controls, plain log entries, non-sensitive display, backdrop close, matching URL silence, single file loading, short value display, and close button navigation.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12, 3.13, 3.14**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `packages/extension/panel-vue/src/App.vue`

**Changes**:
1. **Add tab sync listeners**: In `onMounted`, register `api.tabs.onActivated` and `api.tabs.onUpdated` listeners that call a `syncToActiveTab()` function. The function checks `store.state.isRunning` — if running, skip. Otherwise query active tab URL, extract hostname, and if different from current, reload project.
2. **Add ErrorView rendering**: Import and render `ErrorView` when `store.state.currentView === 'error'`.
3. **Persist params on run complete**: In the `RUN_COMPLETE` handler, check if `msg.failed === 0` and `store.state.automationParams` is set, then call `saveParamValues()`.

---

**File**: `packages/extension/panel-vue/src/components/ErrorView.vue` (NEW)

**Changes**:
1. **Create ErrorView component**: Renders `store.state.errorMessage` with a retry/dismiss button that navigates back to home.

---

**File**: `packages/extension/panel-vue/src/store/index.ts`

**Changes**:
1. **Add `saveTestPlanConfig` function**: Persist config to storage keyed by `config:<specId>:<runnableIndex>`.
2. **Add `getTestPlanConfig` function**: Load persisted config from storage with validation and defaults fallback.
3. **Add `saveParamValues` function**: Persist param values into `project.savedParams[automationName]`.
4. **Add `loadParamValues` function**: Load saved param values from project storage.
5. **Add `hasRequiredParamsWithoutValues` helper**: Check if any required params lack saved values.

---

**File**: `packages/extension/panel-vue/src/components/TestPlanView.vue`

**Changes**:
1. **Load persisted config on mount**: Call `getTestPlanConfig()` with the config key and apply to `ConfigSection`.
2. **Persist config on run**: Call `saveTestPlanConfig()` in `onRun()` before sending the message.

---

**File**: `packages/extension/panel-vue/src/components/HomeView.vue`

**Changes**:
1. **Quick-run automation required params check**: In `quickRunAutomation()`, load saved params via `loadParamValues()`. If `hasRequiredParamsWithoutValues()` returns true, navigate to test-plan view instead of running.
2. **Quick-run load saved speed**: In both `quickRunTest()` and `quickRunAutomation()`, call `getTestPlanConfig()` to load persisted speed instead of hardcoding `'NORMAL'`.

---

**File**: `packages/extension/panel-vue/src/components/RunView.vue`

**Changes**:
1. **Show close button on pause/stop**: Change the `v-if` condition on the close button from `runComplete` to `runComplete || isPaused || !isRunning` (where `!isRunning && !runComplete` means stopped state). More precisely: show when `runComplete` OR `isPaused` OR `(!isRunning && logEntries.length > 0)`.

---

**File**: `packages/extension/panel-vue/src/components/LogEntry.vue`

**Changes**:
1. **Replace resolvedContext placeholders**: In `valueDisplay` computed, if `entry.resolvedContext` exists and has items, replace `{{ctx.key}}` placeholders in the value with the resolved values.
2. **Show "from ctx.key" annotation**: Render a `<span class="ctx-source">` after the value showing which context keys were resolved.

---

**File**: `packages/extension/panel-vue/src/components/LogContainer.vue`

**Changes**:
1. **Pass resolvedContext to LogEntry**: Ensure the `LogEntry` component receives `resolvedContext` data from the log entries (already available via `entry` prop — just needs the store to populate it).

---

**File**: `packages/extension/panel-vue/src/components/ContextPopup.vue`

**Changes**:
1. **Sensitive key masking**: Add `isSensitiveKey()` check — if key matches `/password|secret|token|key|auth/i`, display `****` instead of the value.
2. **Escape key handler**: Register a `keydown` listener on mount that emits `close` when Escape is pressed. Remove on unmount.
3. **Value truncation**: If formatted value length > 30, truncate to 30 chars + "..." and add a `title` attribute with the full value.

---

**File**: `packages/extension/panel-vue/src/components/LoadedHeader.vue`

**Changes**:
1. **URL warning banner**: Compare `store.state.currentSpec.spec.meta.urls` (or `.meta.url`) against `store.state.currentHostname`. If no URL matches the current hostname, render a warning banner.

---

**File**: `packages/extension/panel-vue/src/composables/useFileLoader.ts`

**Changes**:
1. **Multiple files error**: In `handleDrop()`, check `files.length > 1` before processing. If true, set `error.value = 'Only a single file can be loaded at a time'` and return without processing any file.

---

**File**: `packages/extension/panel-vue/src/components/RunSummary.vue`

**Changes**:
1. **Verify back-to-home button**: The component already has a "← Back to Home" button. Confirm it renders correctly in all completion states (both `RUN_COMPLETE` and `RUN_STOPPED`).

---

**File**: `packages/extension/panel-vue/src/types/messages.ts`

**Changes**:
1. **Add resolvedContext to LOG message type**: Already present in the type definition — verify it flows through to `LogEntry`.

---

**File**: `packages/extension/panel-vue/src/types/store.ts`

**Changes**:
1. **Add resolvedContext to LogEntry interface**: Add `resolvedContext?: Array<{ key: string; value: unknown }>` field.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the missing features on unfixed code, then verify the fixes work correctly and preserve existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the 14 gaps BEFORE implementing the fix. Confirm or refute the root cause analysis.

**Test Plan**: Write unit tests for each gap that simulate the triggering condition and assert the expected behavior. Run these on the UNFIXED code to observe failures.

**Test Cases**:
1. **Tab Sync Test**: Mount App.vue, simulate `tabs.onActivated` event → assert project reloads (will fail on unfixed code)
2. **ErrorView Test**: Set `state.currentView = 'error'` and `state.errorMessage = 'test'` → assert ErrorView renders (will fail on unfixed code)
3. **Config Persistence Test**: Call `onRun()` in TestPlanView → assert `saveTestPlanConfig` called (will fail on unfixed code)
4. **Param Persistence Test**: Dispatch `RUN_COMPLETE` with `failed: 0` and params set → assert `saveParamValues` called (will fail on unfixed code)
5. **Required Params Fallback Test**: Call `quickRunAutomation` with required param and no saved value → assert view changes to 'test-plan' (will fail on unfixed code)
6. **Saved Speed Test**: Call `quickRunTest` → assert config uses persisted speed not hardcoded NORMAL (will fail on unfixed code)
7. **Close on Pause Test**: Set `isPaused: true` → assert close button is visible (will fail on unfixed code)
8. **ResolvedContext Test**: Render LogEntry with resolvedContext data → assert placeholders replaced and annotation shown (will fail on unfixed code)
9. **Sensitive Masking Test**: Render ContextPopup with key "apiKey" → assert value shows `****` (will fail on unfixed code)
10. **Escape Key Test**: Mount ContextPopup, dispatch Escape keydown → assert close emitted (will fail on unfixed code)
11. **URL Warning Test**: Set spec with `meta.urls: ['other.com']` and hostname `example.com` → assert warning banner renders (will fail on unfixed code)
12. **Multiple Files Test**: Call handleDrop with 3 files → assert error set and no file processed (will fail on unfixed code)
13. **Truncation Test**: Render ContextPopup with 50-char value → assert truncated display with tooltip (will fail on unfixed code)
14. **Back to Home Test**: Render RunSummary with summary data → assert back button present (may pass — already implemented)

**Expected Counterexamples**:
- Tab sync: no listeners registered, hostname never updates
- Config: `saveTestPlanConfig` never called from Vue code
- Params: `saveParamValues` never called from Vue code
- Close button: `v-if="runComplete"` excludes paused state

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := vuePanelFixed(input)
  ASSERT expectedBehavior(result)
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT vuePanelOriginal(input) = vuePanelFixed(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain
- It catches edge cases that manual unit tests might miss
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for non-gap interactions (mouse clicks, normal view routing, single file drops, non-sensitive keys), then write property-based tests capturing that behavior.

**Test Cases**:
1. **Initial Mount Preservation**: Verify panel mounts and loads project for current hostname without interference from tab sync listeners
2. **View Routing Preservation**: Verify switching between home/test-plan/run works without ErrorView interference
3. **Default Config Preservation**: Verify when no saved config exists, defaults are applied
4. **Non-Sensitive Display Preservation**: Verify context values for non-sensitive keys remain unmasked
5. **Backdrop Close Preservation**: Verify clicking backdrop still closes popup
6. **Single File Drop Preservation**: Verify single file drops continue to work normally
7. **Short Value Preservation**: Verify values ≤ 30 chars display without truncation

### Unit Tests

- Test `syncToActiveTab` skips when `isRunning` is true
- Test `syncToActiveTab` reloads when hostname differs
- Test ErrorView renders error message correctly
- Test `saveTestPlanConfig` persists correct key format
- Test `hasRequiredParamsWithoutValues` logic for various param configurations
- Test LogEntry resolvedContext replacement with multiple placeholders
- Test `isSensitiveKey` regex matching
- Test value truncation at exactly 30 characters boundary
- Test multiple file drop error message

### Property-Based Tests

- Generate random context key/value pairs and verify sensitive keys are always masked while non-sensitive are never masked
- Generate random string values of varying lengths and verify truncation boundary at exactly 30 characters
- Generate random automation param configurations and verify `hasRequiredParamsWithoutValues` correctly identifies missing required values
- Generate random RunConfig objects and verify persistence/restoration round-trip preserves all fields

### Integration Tests

- Test full quick-run flow: load project → quick-run automation with required params → verify fallback to plan view
- Test full config persistence flow: open plan → change speed → run → reopen → verify speed restored
- Test tab switch flow: mount panel → simulate tab change → verify project reloads
- Test run lifecycle: start → pause → verify close button → resume → verify close hidden → complete → verify summary with back button
