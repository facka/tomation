# Requirements Document

## Introduction

This feature enhances the Tomation browser extension's execution log (run view) to display the complete test plan upfront when a test run starts. Currently, the execution log only shows steps as they are executed. With this change, all steps in the test plan are rendered immediately when a run begins, with pending/queued steps visually greyed out. As each step executes, it transitions from the queued state to an in-progress or completed state. This allows users to see the full scope of the test, track where execution is, and know whether the test will reach the end.

## Glossary

- **Execution_Log**: The scrollable log container in the run view (`#log-container`) that displays step entries during a test run
- **Panel**: The Tomation extension side panel UI that displays test plans and execution progress
- **Step_Entry**: A single DOM element in the Execution_Log representing one test step
- **Queued_Step**: A step that has not yet started execution and is waiting in the plan
- **Active_Step**: The step currently being executed, shown with an in-progress indicator
- **Completed_Step**: A step that has finished execution with a pass or fail result
- **Test_Plan**: The full ordered list of resolved steps that will be executed in a test run
- **Background_Script**: The extension service worker (`background.js`) that orchestrates test execution and sends messages to the Panel

## Requirements

### Requirement 1: Render complete test plan in execution log on run start

**User Story:** As a tester, I want to see all steps in the test plan displayed in the execution log when a test run begins, so that I can understand the full scope of the test at a glance.

#### Acceptance Criteria

1. WHEN a test run starts, THE Panel SHALL render all steps from the Test_Plan in the Execution_Log as queued entries before any step begins execution
2. THE Panel SHALL display each queued entry using the same layout as completed log entries (action label, target element, value, URL, duration, or description as applicable to the step action) but without a pass/fail indicator
3. WHEN a test run starts with task steps, THE Panel SHALL render task header entries and their child steps in the same hierarchical structure (task-header row followed by indented child entries) used for completed log entries
4. WHEN a step completes execution, THE Panel SHALL replace the corresponding queued entry with the completed log entry showing its pass/fail indicator
5. THE Panel SHALL visually distinguish queued entries from completed entries by applying a distinct CSS class to queued entries

### Requirement 2: Visually distinguish queued steps from active and completed steps

**User Story:** As a tester, I want queued steps to appear greyed out in the execution log, so that I can easily distinguish between steps that have run and steps that are still pending.

#### Acceptance Criteria

1. WHEN a test run starts, THE Panel SHALL render all non-active steps in the Execution_Log as Queued_Step entries using the `--text-muted` color for their text, making them visually lower-contrast than Active_Step and Completed_Step entries which use `--text-primary` or `--accent-text` colors
2. THE Panel SHALL NOT display pass/fail indicators (✓ or ✗) or a spinner on Queued_Step entries
3. WHEN a Queued_Step transitions to Active_Step, THE Panel SHALL replace the muted queued styling with the in-progress styling (accent border and accent-soft background) within the same rendering cycle
4. WHEN the Execution_Log contains both Completed_Step and Queued_Step entries, THE Panel SHALL render Completed_Step entries with a left border color (success or error) and Queued_Step entries without a left border color, providing an observable boundary between executed and pending steps

### Requirement 3: Transition step entries from queued to in-progress state

**User Story:** As a tester, I want the current step to transition from greyed out to an active in-progress state, so that I can see exactly which step is executing right now.

#### Acceptance Criteria

1. WHEN a STEP_STARTING message is received from the Background_Script, THE Panel SHALL locate the Queued_Step entry whose step index matches the message's stepIndex field and update it to the Active_Step visual state by removing the greyed-out style and applying the in-progress styling (accent-colored left border and accent background)
2. WHEN a STEP_STARTING message is received and a previous Active_Step entry exists in the Execution_Log, THE Panel SHALL remove the in-progress indicator from the previous Active_Step entry before applying the Active_Step state to the new step
3. WHEN a step transitions to in-progress, THE Panel SHALL add an animated spinner indicator to the Active_Step entry
4. WHEN a step transitions to in-progress, THE Panel SHALL scroll the Execution_Log container so that the Active_Step entry is within the visible area of the container
5. IF a STEP_STARTING message is received and no matching Queued_Step entry exists in the Execution_Log for the given stepIndex, THEN THE Panel SHALL append a new Active_Step entry to the Execution_Log with the step's action label, target, and value

### Requirement 4: Transition step entries from in-progress to completed state

**User Story:** As a tester, I want completed steps to show their pass/fail result in place, so that I can see a clear trail of execution outcomes alongside the remaining plan.

#### Acceptance Criteria

1. WHEN a LOG message is received from the Background_Script, THE Panel SHALL remove the in-progress entry for the corresponding stepIndex and append a new log entry displaying the step action label with the pass or fail visual state
2. WHEN a step completes with a pass result (ok equals true), THE Panel SHALL render the log entry with a green left border and a checkmark character (✓) appended after the step label
3. WHEN a step completes with a fail result (ok equals false), THE Panel SHALL render the log entry with a red left border, a cross mark character (✗) appended after the step label, and the error text from the LOG message displayed inline after the indicator
4. WHEN a step completes, THE Panel SHALL remove the spinner indicator (⟳) that was present on the in-progress entry by replacing the entire in-progress entry with the completed log entry
5. IF a LOG message is received with a stepIndex that has no matching in-progress entry in the log container, THEN THE Panel SHALL still append the completed log entry with the correct pass or fail visual state

### Requirement 5: Provide the full step plan from background to panel

**User Story:** As a tester, I want the background script to send the full resolved step plan to the panel, so that the panel can render all steps upfront.

#### Acceptance Criteria

1. WHEN a test run is initiated (via RUN_TEST or RUN_AUTOMATION message), THE Background_Script SHALL send a single message of type STEP_PLAN to the Panel containing the complete ordered array of resolved steps before executing the first step
2. THE Background_Script SHALL include for each step entry in the STEP_PLAN message: the action type, target element key (if applicable), resolved value (if applicable), URL (if applicable), description (if applicable), and a taskName field indicating the parent task name (or null if the step is not inside a task)
3. IF a test run resolves to zero steps (all steps unchecked or empty test), THEN THE Background_Script SHALL send a STEP_PLAN message with an empty steps array before emitting the RUN_COMPLETE summary
4. IF a test run contains steps expanded from task actions, THEN THE Background_Script SHALL set the taskName field on each step that was expanded from a task to the task's name, so the Panel can render task group headers at task boundaries

### Requirement 6: Handle stop and run completion scenarios

**User Story:** As a tester, I want the execution log to remain accurate when a test run is stopped or completes, so that the displayed plan stays consistent with what actually happened.

#### Acceptance Criteria

1. IF the test run is stopped before all steps complete, THEN THE Panel SHALL leave remaining Queued_Step entries unchanged in their greyed-out state with no status indicator appended, to indicate they were never executed
2. WHEN a test run ends (via RUN_COMPLETE or RUN_STOPPED), THE Panel SHALL NOT remove or hide any Queued_Step entries from the Execution_Log, preserving the full original plan view
3. WHEN a step is skipped via the Skip action in debug mode (which only applies to a failed in-progress step), THE existing skip handler SHALL continue to apply the `skipped` CSS class to the failed entry as it does today — no changes needed for queued entries since skip only operates on already-executed steps
