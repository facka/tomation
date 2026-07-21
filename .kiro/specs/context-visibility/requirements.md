# Requirements Document

## Introduction

This feature improves the Tomation browser extension's run log to make context (stored variables) visible and readable to the user. It covers three areas: displaying saved context values in log entries, showing resolved context references in assert steps, and providing a dedicated Context button/popup for inspecting all stored context at any time.

## Glossary

- **Run_Log**: The panel UI component (`.log-container`) that displays step-by-step execution results during and after a test run.
- **Context_Store**: The in-memory key-value map (`runState.contextStore`) that holds variables saved during a run.
- **Save_Step**: Any step with action `saveText`, `saveValue`, `saveAttribute`, or `saveExpression` that stores a value into the Context_Store.
- **Assert_Step**: Any step with action `assertHasText`, `assertExists`, `assertNotExists`, or `assertHasValue` that validates page state.
- **Context_Expression**: A template token in the format `{{ctx.X}}` that references a value stored in the Context_Store.
- **Sensitive_Key**: A context key whose name matches (case-insensitive) one of: `password`, `secret`, `token`, `key`, `auth`.
- **Controller_Bar**: The panel UI bar containing Pause, Resume, and Stop buttons shown during a run.
- **Context_Popup**: An overlay panel showing all current Context_Store entries in a key-value table.
- **Log_Entry**: A single rendered row in the Run_Log representing one executed step.
- **Panel**: The extension sidebar UI rendered by panel.html and panel.js.
- **Background**: The extension background script (background.js) responsible for test execution and messaging.

## Requirements

### Requirement 1: Emit Context Data in Save Step Log Messages

**User Story:** As a test author, I want to see what value was stored when a Save_Step executes, so that I can verify context is being captured correctly without adding extra debug steps.

#### Acceptance Criteria

1. WHEN a Save_Step executes successfully, THE Background SHALL include the `contextKey` and `savedValue` fields in the LOG message sent to the Panel, where `contextKey` is the step's configured key name and `savedValue` is the string value stored in the Context_Store.
2. WHEN a `saveExpression` step executes successfully, THE Background SHALL include the `key` as `contextKey` and the resolved expression result as `savedValue` in the LOG message sent to the Panel.
3. THE Background SHALL send the full untruncated `savedValue` in the LOG message without applying any character limit or truncation.
4. IF a Save_Step fails, THEN THE Background SHALL omit the `contextKey` and `savedValue` fields from the LOG message sent to the Panel.

### Requirement 2: Display Context Data in Save Step Log Entries

**User Story:** As a test author, I want the run log to clearly show the context property name and stored value for Save_Steps, so that I can trace data flow through my test.

#### Acceptance Criteria

1. WHEN a Log_Entry for a Save_Step is rendered, THE Panel SHALL display the context property name inside a badge element prefixed with the label "ctx." (e.g., for key "username", display "ctx.username").
2. WHEN a Log_Entry for a Save_Step is rendered and the saved value exceeds 30 characters, THE Panel SHALL display the first 30 characters of the value followed by "..." (three dot characters).
3. WHEN the saved value exceeds 30 characters, THE Panel SHALL display the full untruncated value in a tooltip on hover over the truncated value.
4. WHEN the saved value is 30 characters or fewer, THE Panel SHALL display the full value inline without truncation and without a tooltip.
5. WHEN a Save_Step has a Sensitive_Key, THE Panel SHALL display `****` as the value instead of the actual value, regardless of the actual value length.
6. WHEN a Save_Step has a Sensitive_Key, THE Panel SHALL NOT reveal the actual value in any tooltip or hover state.
7. IF the saved value is empty string, null, or undefined, THEN THE Panel SHALL display an empty inline value element with no text content and no tooltip.

### Requirement 3: Display Resolved Context References in Assert Steps

**User Story:** As a test author, I want to see which context values were substituted into assert steps, so that I can understand what actual value was being validated.

#### Acceptance Criteria

1. WHEN an Assert_Step's value contains a single Context_Expression `{{ctx.X}}`, THE Background SHALL include the context key name and resolved value in the LOG message sent to the Panel.
2. WHEN an Assert_Step's value contains multiple Context_Expressions, THE Background SHALL include all context key names and their resolved values in the LOG message sent to the Panel.
3. WHEN a Log_Entry for an Assert_Step with resolved context values is rendered, THE Panel SHALL display a label indicating the resolved context sources (e.g., "(from ctx.X)") after the step value.
4. WHEN a Log_Entry for an Assert_Step references multiple context values, THE Panel SHALL display all sources in a single label (e.g., "(from ctx.X, ctx.Y)").
5. WHEN a resolved context value originates from a Sensitive_Key, THE Panel SHALL mask the resolved value display as `****` in the context source label.

### Requirement 4: Context Button in Controller Bar

**User Story:** As a test author, I want a dedicated button to inspect all stored context values at any time during or after a run, so that I can debug data dependencies without re-running the test.

#### Acceptance Criteria

1. THE Panel SHALL display a "Context" button in the Controller_Bar, positioned immediately after the Stop button.
2. WHEN a run starts, THE Panel SHALL display the Context button as visible and enabled.
3. WHILE a run is in progress, THE Panel SHALL keep the Context button visible and enabled.
4. WHEN a run completes (pass or fail), THE Panel SHALL keep the Context button visible and enabled so the user can inspect final context state.
5. WHEN the user clicks the Context button, THE Panel SHALL open the Context_Popup overlay.
6. WHEN the Context_Popup is open and the user clicks the Context button again, THE Panel SHALL close the Context_Popup.
7. THE Panel SHALL render the Context button with an accessible label of "Context" so that screen readers can identify its purpose.

### Requirement 5: Context Popup Content and Display

**User Story:** As a test author, I want the context popup to show all stored key-value pairs in a readable table, so that I can quickly scan the full context state.

#### Acceptance Criteria

1. WHEN the Context_Popup is opened, THE Panel SHALL display all current Context_Store entries as a key-value table with columns for property name and value.
2. WHEN the Context_Store is empty, THE Panel SHALL display the message "No context values stored yet." in the Context_Popup.
3. WHEN a context entry has a Sensitive_Key, THE Panel SHALL display `****` as the value in the Context_Popup table.
4. WHEN a context entry has a Sensitive_Key, THE Panel SHALL NOT reveal the actual value in any tooltip or hover state within the Context_Popup.
5. WHEN a context value exceeds 30 characters, THE Panel SHALL truncate the displayed value at 30 characters with an ellipsis and show the full value in a tooltip on hover.
6. THE Panel SHALL update the Context_Popup content in real time as new context values are stored during a run.
7. WHEN the user clicks outside the Context_Popup or presses Escape, THE Panel SHALL close the Context_Popup.

### Requirement 6: Sensitive Key Detection

**User Story:** As a test author, I want sensitive values automatically masked, so that credentials are not exposed in the UI during screen sharing or recordings.

#### Acceptance Criteria

1. THE Panel SHALL treat a context key as sensitive if the key name contains (case-insensitive match) any of the following substrings: `password`, `secret`, `token`, `key`, `auth`.
2. THE Panel SHALL apply consistent masking (`****`) across all display locations: Save_Step log entries, Assert_Step context labels, and Context_Popup table values.
3. IF a new context value is stored with a Sensitive_Key during a run, THEN THE Panel SHALL mask the value immediately without requiring user action.

### Requirement 7: Context Store Communication

**User Story:** As a test author, I want the panel to have access to the current context store state, so that the Context_Popup can display up-to-date values.

#### Acceptance Criteria

1. WHEN the user clicks the Context button, THE Panel SHALL request the current Context_Store state from the Background.
2. WHEN the Panel requests the Context_Store state, THE Background SHALL respond with the complete Context_Store object (all key-value pairs).
3. WHEN a Save_Step executes successfully during a run, THE Background SHALL include the updated context entry in the LOG message so the Panel can maintain a local copy.
4. IF the Panel receives a Context_Store response while no run is active, THEN THE Background SHALL respond with the last known Context_Store from the most recent completed run.
