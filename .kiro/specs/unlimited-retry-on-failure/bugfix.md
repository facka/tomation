# Bugfix Requirements Document

## Introduction

The "Try Again" (retry on failure) feature in the browser extension test runner has two defects. First, it only allows a single retry attempt — if the retry also fails, the run is halted. Users expect to retry without limit until the step passes or they choose to skip/stop. Second, each retry attempt creates a new log entry in the panel, cluttering the log. Instead, the existing step entry should be updated in-place with an incrementing retry counter.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a step fails and the user clicks "Try Again" and the retry also fails THEN the system halts the run, sets `awaitingAction = false`, unlocks the tab, and emits a `RUN_COMPLETE` summary — preventing any further retry attempts

1.2 WHEN a step fails and the user clicks "Try Again" (regardless of success or failure) THEN the system emits a new LOG message which causes the panel to append a brand new log entry row to the log container, creating duplicate entries for the same step

1.3 WHEN a retry succeeds after one or more attempts THEN the system emits a new LOG entry with `retryAttempt` field, resulting in both the original failed entry and a separate success entry for the same step being visible in the log

### Expected Behavior (Correct)

2.1 WHEN a step fails and the user clicks "Try Again" and the retry also fails THEN the system SHALL remain in the `awaitingAction` state, keep the tab locked, keep the run alive, increment the retry counter, update the panel with the new attempt count, and present the "Try Again" / "Skip" buttons again so the user can retry indefinitely

2.2 WHEN a step fails and the user clicks "Try Again" THEN the system SHALL update the existing failed step's log entry in-place (same DOM element) with the incremented retry counter instead of appending a new log entry row

2.3 WHEN a retry succeeds after one or more attempts THEN the system SHALL update the existing step's log entry to show a pass state with the total retry attempt count (e.g., "✓ Attempt 3") without creating an additional log entry row

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a step fails and the user clicks "Skip" THEN the system SHALL CONTINUE TO advance past the failed step, mark it as skipped in the log, and resume the step loop from the next step

3.2 WHEN a step fails and neither retry nor skip is enabled (debug mode off) THEN the system SHALL CONTINUE TO halt the run immediately and emit the `RUN_COMPLETE` summary

3.3 WHEN a step passes on the first attempt (no failure) THEN the system SHALL CONTINUE TO append a normal pass log entry and advance to the next step without any retry counter displayed

3.4 WHEN the user clicks "Stop" while in the awaiting-action state THEN the system SHALL CONTINUE TO stop the run, unlock the tab, and emit the `RUN_STOPPED` summary

3.5 WHEN a step fails and retry is enabled THEN the system SHALL CONTINUE TO emit `STEP_FAILED_AWAITING_ACTION` to the panel and display the "Try Again" and "Skip" action buttons
