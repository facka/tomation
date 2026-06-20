# Requirements Document

## Introduction

This spec extends the Tomation browser extension with failure recovery capabilities: manual retry of failed actions, manual skip of failed actions, and per-test-plan configuration controlling retry/skip visibility and execution speed. These features enhance the test execution workflow by giving users more control over failures, allowing recovery from transient issues without restarting entire test runs.

All features are implemented within the existing extension architecture: `panel.html`/`panel.js` for the UI, `background.js` for orchestration, and `storage.js` for persistence. The extension continues to use ES5-compatible vanilla JavaScript with no bundlers or modern syntax.

## Glossary

- **Panel**: The sidebar UI (`panel.html` / `panel.js`) through which users interact with the extension.
- **Background**: The extension's service worker (`background.js`) that orchestrates all test execution state.
- **Runtime**: The `runtime.js` content script injected into the active tab that performs DOM operations for each step.
- **Execution_Log**: The scrolling list of log entries displayed in the Run view showing step results.
- **Failed_Action**: A step that the Runtime returned `{ ok: false, error: "..." }` for during execution.
- **Retry**: Re-executing only the last failed action without restarting the entire test.
- **Skip**: Bypassing a failed action and continuing test execution from the next action in the sequence.
- **Test_Plan_Configuration**: A set of per-test-plan settings that control runtime behavior (retry visibility, skip visibility, execution speed).
- **Execution_Speed**: A configuration option controlling the delay between steps — FAST (no delay), NORMAL (500ms delay), SLOW (1500ms delay).
- **Control_Button**: Any button in the controller bar or action bar (Play, Pause, Stop, Continue, Try Again, Skip).

---

## Requirements

### Requirement 1: Retry Failed Action (Manual)

**User Story:** As a tester, I want to retry only the last failed action without restarting the entire test, so that I can recover from transient failures and continue my test run.

#### Acceptance Criteria

1. WHEN a step returns a failure result and the test plan's `allowRetryOnFailure` configuration is enabled, THE Panel SHALL display a "Try Again" button adjacent to the failed action entry in the Execution_Log.
2. WHEN the "Try Again" button is clicked, THE Panel SHALL send a `RETRY_STEP` message to the Background containing the index of the failed step.
3. WHEN the Background receives a `RETRY_STEP` message, THE Background SHALL re-send the failed step as an `EXECUTE_STEP` message to the Runtime without restarting the test or re-executing prior steps.
4. WHEN the retried step returns `{ ok: true }`, THE Background SHALL resume test execution from the next step in sequence and SHALL emit a `LOG` message with the updated pass status for the retried step.
5. WHEN the retried step returns `{ ok: false }`, THE Background SHALL halt the test run, emit a failure log entry, and unlock the active tab.
6. WHEN a retry attempt occurs, THE Panel SHALL update the failed log entry to reflect the retry attempt by displaying an attempt count (e.g., "Attempt 2") alongside the status indicator.
7. WHILE the Background is waiting for user action on a failed step (retry or skip), THE Background SHALL NOT proceed to the next step or terminate the run automatically.
8. WHEN the test plan's `allowRetryOnFailure` configuration is disabled, THE Panel SHALL NOT display the "Try Again" button next to failed action entries.
9. WHEN the "Try Again" button is clicked, THE Panel SHALL disable both the "Try Again" and "Skip" buttons for that log entry to prevent duplicate submissions while the Background processes the retry.

---

### Requirement 2: Skip Failed Action (Manual)

**User Story:** As a tester, I want to skip a failed action and continue the test from the next step, so that I can complete the remaining test steps even when one action fails.

#### Acceptance Criteria

1. WHEN a step returns a failure result and the test plan's `allowContinueOnFailure` configuration is enabled, THE Panel SHALL display a "Skip" button adjacent to the failed action entry in the Execution_Log.
2. WHEN the "Skip" button is clicked, THE Panel SHALL send a `SKIP_STEP` message to the Background containing the index of the failed step.
3. WHEN the Background receives a `SKIP_STEP` message and subsequent steps remain in the sequence, THE Background SHALL advance execution to the next step without re-executing the failed step. WHEN the Background receives a `SKIP_STEP` message and the failed step is the last step in the sequence, THE Background SHALL end the test run and emit a `RUN_COMPLETE` summary.
4. WHEN a step is skipped, THE Background SHALL preserve all progress made before the failure — pass counts, log entries, and execution state SHALL remain intact. The skipped step SHALL NOT increment the pass count and SHALL retain its existing fail count increment from the initial failure.
5. WHEN a step is skipped, THE Panel SHALL replace the failed status indicator on that log entry with a "skipped" badge and apply a muted visual style (e.g., grey text or different background color) to distinguish it from passed and failed entries.
6. WHEN the test plan's `allowContinueOnFailure` configuration is disabled, THE Panel SHALL NOT display the "Skip" button next to failed action entries, and THE Background SHALL halt execution immediately on failure.
7. WHEN both "Try Again" and "Skip" buttons are displayed, THE Panel SHALL render them on the same row adjacent to the failed log entry, with "Try Again" appearing before "Skip".
8. WHEN the "Skip" button is clicked, THE Panel SHALL disable both the "Skip" and "Try Again" buttons for that log entry to prevent duplicate submissions while the Background processes the skip.

---

### Requirement 3: Test Plan Configuration Section

**User Story:** As a tester, I want to configure retry, skip, and execution speed settings per test plan, so that I can tailor execution behavior to different testing scenarios.

#### Acceptance Criteria

1. THE Panel SHALL display a "Configuration" section within the Test Plan view, positioned between the step checklist and the Run button.
2. THE Configuration section SHALL include an "Allow continue on failure" toggle that defaults to disabled (off).
3. THE Configuration section SHALL include an "Allow retry on failure" toggle that defaults to disabled (off).
4. THE Configuration section SHALL include an "Execution speed" selector with three options: FAST, NORMAL, and SLOW, defaulting to NORMAL.
5. WHEN the "Allow continue on failure" toggle is enabled, THE Panel SHALL display the "Skip" button next to failed action entries during test execution.
6. WHEN the "Allow retry on failure" toggle is enabled, THE Panel SHALL display the "Try Again" button next to failed action entries during test execution.
7. WHEN the user clicks the Run button, THE Panel SHALL include the current configuration values (`allowContinueOnFailure`, `allowRetryOnFailure`, `executionSpeed`) in the `RUN_TEST` message payload sent to the Background.
8. WHEN the Background receives an `executionSpeed` value of FAST, THE Background SHALL insert no delay between steps.
9. WHEN the Background receives an `executionSpeed` value of NORMAL, THE Background SHALL insert a 500-millisecond delay between steps.
10. WHEN the Background receives an `executionSpeed` value of SLOW, THE Background SHALL insert a 1500-millisecond delay between steps.
11. WHEN the user changes any configuration control (toggle or selector), THE Panel SHALL immediately persist the complete configuration object for that test plan to `browser.storage.local`, keyed by the combination of spec ID and test index.
12. WHEN the Test Plan view is opened for a test plan that has a previously saved configuration in `browser.storage.local`, THE Panel SHALL restore the saved configuration values into the UI controls.
13. WHEN the Test Plan view is opened for a test plan that has no previously saved configuration, THE Panel SHALL display all configuration controls in their default states (both toggles disabled, execution speed set to NORMAL).
