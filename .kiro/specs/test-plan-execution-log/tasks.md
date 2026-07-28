# Implementation Plan: Test Plan Execution Log

## Overview

Enhance the Tomation extension's execution log to render the complete test plan upfront when a run starts. The background script sends a new `STEP_PLAN` message with all resolved steps, the panel renders them as queued (greyed-out) entries, and existing `STEP_STARTING`/`LOG` handlers transition entries through in-progress → completed states. All code is ES5 style (var, function declarations, no arrow functions).

## Tasks

- [x] 1. Add `emitStepPlan` function and integrate into run start flow in background.js
  - [x] 1.1 Implement `emitStepPlan` function in background.js
    - Add function after `emitLog` that takes `resolvedSteps`, `originalSteps`, `tasksMap`, and `checkedSteps` parameters
    - Build an array of plan entries from `resolvedSteps`, each with: `action`, `target` (or null), `value` (or null), `url` (or null), `description` (or null), `ms` (or null), `taskName` (or null), `gone` (if applicable), `contextKey` (if applicable)
    - To determine `taskName`: walk `originalSteps` with `checkedSteps`, for each checked step that is a task action, mark all resolved steps expanded from it with the task's name (use an index counter matching flattenSteps expansion order)
    - Call `safeSendMessage({ type: 'STEP_PLAN', steps: planSteps })`
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [x] 1.2 Call `emitStepPlan` from `startRun` function
    - After `flattenSteps` call and before `runStepLoop`, call `emitStepPlan(resolvedSteps, test.steps, spec.tasks || {}, checkedSteps)`
    - _Requirements: 5.1_

  - [x] 1.3 Call `emitStepPlan` from `startAutomationRun` function
    - After `flattenSteps` call and before `runStepLoop`, call `emitStepPlan(resolvedSteps, automation.steps, spec.tasks || {}, checkedSteps)`
    - _Requirements: 5.1_

- [x] 2. Checkpoint - Verify background.js changes
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Add CSS for queued and skipped states in panel.html
  - [x] 3.1 Add `.log-entry.queued` CSS rule in panel.html
    - Place after the existing `.log-entry.in-progress` rule block
    - Set `color: var(--text-muted)` and `border-left: 3px solid transparent`
    - This makes queued entries visually lower-contrast with no colored left border
    - _Requirements: 2.1, 2.4, 1.5_

- [x] 4. Implement `renderStepPlan` and `STEP_PLAN` handler in panel.js
  - [x] 4.1 Add `renderStepPlan` function in panel.js
    - Place near `appendInProgressEntry` function
    - Takes a `steps` array parameter (from the STEP_PLAN message)
    - Clear the log container (same as switchToRunView does)
    - Track current `taskName` to detect task boundaries; when a step's `taskName` differs from the previous step's `taskName` and is non-null, insert a task-header div with class `log-entry task-header queued` and the task name label
    - For each step, create a div with class `log-entry queued` (add `indented` if step has a non-null taskName)
    - Set `data-step-index` attribute to the step's index in the array
    - Build inner HTML using `buildLogEntryHtml` (reuse existing function) passing the step data and pageElements — no pass/fail indicator, no spinner
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 2.1, 2.2, 2.4_

  - [x] 4.2 Add `STEP_PLAN` case to `onBackgroundMessage` switch in panel.js
    - Add `case 'STEP_PLAN':` before the existing `STEP_STARTING` case
    - Call `renderStepPlan(message.steps)`
    - _Requirements: 1.1_

- [x] 5. Modify `appendInProgressEntry` to locate and transition queued entries in panel.js
  - [x] 5.1 Update `appendInProgressEntry` to find existing queued entry by `data-step-index`
    - Before creating a new div, query the log container for `.log-entry.queued[data-step-index="N"]` where N is `data.stepIndex`
    - If found: remove the `queued` class, add `in-progress` class, update innerHTML to include the spinner (`<span class="spinner">⟳</span>`), and scroll into view
    - If not found (fallback per Req 3.5): create a new in-progress entry as current code does (append to container)
    - Also remove any previous `.log-entry.in-progress` entry's in-progress state (remove class and spinner) before applying to the new one — but only remove the class, don't remove the element
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 6. Modify `finalizeInProgressEntry` and `appendLogEntry` to work with pre-rendered entries in panel.js
  - [x] 6.1 Update `finalizeInProgressEntry` to remove the in-progress entry for the matching stepIndex
    - Keep existing behavior: find `.log-entry.in-progress[data-step-index="N"]` and remove it
    - This clears the transitional in-progress element so `appendLogEntry` can insert the completed entry
    - _Requirements: 4.1, 4.4_

  - [x] 6.2 Update `appendLogEntry` to insert completed entry at the correct position
    - After building the completed log entry div, instead of always appending to the end of logContainer:
    - Find the queued entry with matching `data-step-index` — if it exists, replace it with the completed entry (use `parentNode.replaceChild`)
    - If no queued entry exists at that index (fallback per Req 4.5): append to the end as before
    - _Requirements: 4.1, 4.2, 4.3, 4.5, 1.4_

- [x] 7. Checkpoint - Verify panel changes work end-to-end
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Handle stop scenarios in panel.js
  - [x] 8.1 Verify existing skip handler works correctly with pre-rendered entries
    - The existing skip handler in `handleStepFailedAwaitingAction` already operates on a failed in-progress entry (not a queued entry), so no changes to queued entry handling are needed
    - Verify that when a step fails and is then skipped, the `.fail` → `.skipped` transition works correctly on the pre-rendered entry (it should, since the entry was already transitioned from queued → in-progress → fail before skip applies)
    - Add a comment documenting that skip only applies to failed in-progress steps, never to queued entries
    - _Requirements: 6.3_

  - [x] 8.2 Verify RUN_COMPLETE/RUN_STOPPED preserves queued entries
    - In `showRunSummary`, ensure no code removes or hides elements with the `queued` class from the log container
    - The existing implementation already does not remove log entries on completion, so this should hold — verify and add a comment documenting this invariant
    - _Requirements: 6.1, 6.2_

- [x] 9. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All code must use ES5 style: `var`, `function` declarations, no arrow functions, no template literals
- The `buildLogEntryHtml` function is reused for both queued entries and in-progress entries, ensuring visual consistency
- Task-header entries in the queued plan use the same `task-header` class as completed task headers for layout consistency
- The `data-step-index` attribute is the key mechanism for matching STEP_STARTING and LOG messages to pre-rendered queued entries
- Queued entries remaining after RUN_COMPLETE/RUN_STOPPED provide visual indication of unexecuted steps
- Fallback behavior (appending new entries when no queued match exists) ensures backward compatibility with edge cases like STATE_SYNC reconnections

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "3.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "4.1"] },
    { "id": 2, "tasks": ["4.2", "5.1"] },
    { "id": 3, "tasks": ["6.1", "6.2"] },
    { "id": 4, "tasks": ["8.1", "8.2"] }
  ]
}
```
