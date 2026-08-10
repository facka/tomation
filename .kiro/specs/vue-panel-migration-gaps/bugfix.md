# Bugfix Requirements Document

## Introduction

The Vue 3 panel migration (`packages/extension/panel-vue/`) is missing 14 features that exist in the original panel (`packages/extension/src/panel.js`). These are functional parity gaps discovered during migration validation — the Vue panel compiles and renders, but silently omits behaviors users depend on. The gaps range from critical (broken tab sync, missing error view, no config persistence) to moderate UX regressions (missing keyboard shortcuts, value masking) and minor polish issues.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN the user switches browser tabs while the Vue panel is open THEN the system does not reload the project for the new hostname because `tabs.onActivated`/`tabs.onUpdated` listeners are not registered

1.2 WHEN a spec validation error occurs THEN the system sets `state.errorMessage` but has no `ErrorView` component to render it, so the user sees nothing

1.3 WHEN the user configures debug mode or execution speed in the test plan and runs a test THEN the system does not persist the config via `saveTestPlanConfig`, so the next session starts with defaults

1.4 WHEN an automation run completes successfully THEN the system does not call `saveParamValues` to persist the last-used parameters for that automation

1.5 WHEN the user quick-runs an automation that has required parameters without saved values THEN the system runs with `buildDefaultParams()` (empty strings for required string params) instead of falling back to the test plan view

1.6 WHEN the user quick-runs a test or automation THEN the system hardcodes `executionSpeed: 'NORMAL'` instead of loading the persisted speed from storage via `getTestPlanConfig`

1.7 WHEN the user pauses or stops a run THEN the system does not show the close/back button — it only appears after `runComplete`, so the user cannot navigate away

1.8 WHEN a log entry contains `resolvedContext` references THEN the system does not replace `{{ctx.key}}` placeholders in the displayed value or show "from ctx.key" annotations

1.9 WHEN the context popup displays a value whose key matches `/password|secret|token|key|auth/i` THEN the system shows the raw value instead of masking it with `****`

1.10 WHEN the context popup is open and the user presses the Escape key THEN the system does not close the popup (only backdrop click closes it)

1.11 WHEN a loaded spec has `meta.urls` that do not match the current tab hostname THEN the system does not show a URL mismatch warning banner

1.12 WHEN the user drops multiple files onto the drop zone THEN the system silently processes only the first file without informing the user that only a single file is accepted

1.13 WHEN the context popup displays a value longer than 30 characters THEN the system shows the full untruncated string without a tooltip

1.14 WHEN a run completes and the summary is shown THEN the system provides only the ✕ close button in the nav row and no distinct "Back to Home" button below the summary

### Expected Behavior (Correct)

2.1 WHEN the user switches browser tabs while the Vue panel is open THEN the system SHALL listen to `tabs.onActivated` and `tabs.onUpdated`, detect the new hostname, and reload the project for that hostname (skipping sync if a run is in progress)

2.2 WHEN a spec validation error occurs THEN the system SHALL render an `ErrorView` component displaying `state.errorMessage` when `currentView === 'error'`

2.3 WHEN the user runs a test or automation from the test plan view THEN the system SHALL persist the run config (debug mode, retry, speed) to storage keyed by `config:<specId>:<runnableIndex>` and reload it next session

2.4 WHEN an automation run completes with zero failures THEN the system SHALL call `saveParamValues` to persist the last-used parameter values for that automation under `project.savedParams[automationName]`

2.5 WHEN the user quick-runs an automation that has required parameters without saved values THEN the system SHALL fall back to the test plan view instead of running with empty defaults

2.6 WHEN the user quick-runs a test or automation THEN the system SHALL load the persisted execution speed from storage via `getTestPlanConfig` and use it in the run config

2.7 WHEN the user pauses or stops a run (not just on completion) THEN the system SHALL show the close/back button, and hide it again if the user resumes

2.8 WHEN a log entry contains `resolvedContext` references THEN the system SHALL replace `{{ctx.key}}` placeholders in the displayed value with the resolved value AND show a "from ctx.key" annotation

2.9 WHEN the context popup displays a value whose key matches `/password|secret|token|key|auth/i` THEN the system SHALL mask the value with `****`

2.10 WHEN the context popup is open and the user presses the Escape key THEN the system SHALL close the popup

2.11 WHEN a loaded spec has `meta.urls` that do not match the current tab hostname THEN the system SHALL display a warning banner indicating the mismatch

2.12 WHEN the user drops multiple files onto the drop zone THEN the system SHALL display an error message "Only a single file can be loaded at a time" and not process any file

2.13 WHEN the context popup displays a value longer than 30 characters THEN the system SHALL truncate the display to 30 characters with an ellipsis and show the full value in a tooltip

2.14 WHEN a run completes and the summary is shown THEN the system SHALL display a distinct "Back to Home" button below the summary in addition to the ✕ close button

### Unchanged Behavior (Regression Prevention)

3.1 WHEN the panel initially mounts and queries the active tab URL THEN the system SHALL CONTINUE TO load the project for the detected hostname exactly as it does today

3.2 WHEN the view is `home` or `test-plan` or `run` THEN the system SHALL CONTINUE TO render the corresponding component without interference from the new error view

3.3 WHEN the user opens a test plan without changing config THEN the system SHALL CONTINUE TO show defaults (NORMAL speed, no debug) if no persisted config exists

3.4 WHEN an automation run completes with failures THEN the system SHALL CONTINUE TO not persist param values (persistence only happens on zero-failure runs)

3.5 WHEN the user quick-runs an automation that has all required params with saved values THEN the system SHALL CONTINUE TO quick-run directly without showing the plan view

3.6 WHEN no persisted config exists for a quick-run THEN the system SHALL CONTINUE TO fall back to default speed (NORMAL)

3.7 WHEN a run is actively in progress (not paused/stopped) THEN the system SHALL CONTINUE TO hide the close button and show only pause/stop controls

3.8 WHEN a log entry has no `resolvedContext` field THEN the system SHALL CONTINUE TO display the value as-is without any placeholder replacement

3.9 WHEN the context popup displays a value whose key does NOT match the sensitive pattern THEN the system SHALL CONTINUE TO show the value unmasked

3.10 WHEN the user clicks the backdrop behind the context popup THEN the system SHALL CONTINUE TO close the popup

3.11 WHEN a loaded spec has `meta.urls` that match the current tab hostname THEN the system SHALL CONTINUE TO not show any warning banner

3.12 WHEN the user drops exactly one valid `.tomation.json` file THEN the system SHALL CONTINUE TO process and load it normally

3.13 WHEN the context popup displays a value of 30 characters or fewer THEN the system SHALL CONTINUE TO show the full value without truncation

3.14 WHEN the ✕ close button is clicked after a run THEN the system SHALL CONTINUE TO navigate back to home view
