# Bugfix Requirements Document

## Introduction

During a run, the log/run view (`LogContainer.vue`) is supposed to keep the currently-executing step visible so the user can follow what the execution is doing in real time. In practice the view does not reliably track the active step: it can lag behind or leave the current step out of view, especially in long logs. This affects the user's ability to observe progress. The behavior is required for all run/execution types (single tests, automations, and multi-task runs), which all drive the same `logEntries` state through the same status-transition messages (`STEP_STARTING` → `in-progress`, `LOG` → `pass`/`fail`).

The existing auto-scroll watcher (LogContainer.vue, "Auto-scroll to last updated step") has two confirmed defects and one interaction defect verified against the code:

- It targets the **last non-`queued`** entry rather than the **currently-executing (`in-progress`)** entry. Since a completing step transitions to `pass`/`fail` (`LOG` message) after the next step's `STEP_STARTING`/before it, the "last non-queued" selection tracks the last *touched* step, not necessarily the *current* step, and can point at a completed step instead of the active one.
- It calls `scrollIntoView({ block: 'nearest' })`, which by specification performs **no scroll when the target is already partially visible**, so in a long log the active step can remain clipped at the container edge and never be brought fully into view.
- The watcher observes only `logEntries.value.map((e) => e.status)`. Step statuses are the trigger; this is confirmed to fire on both status changes and array-length changes (spliced/on-demand entries). The scroll target selection, not the trigger, is the primary defect.

## Bug Analysis

### Current Behavior (Defect)

The run view fails to reliably keep the active step visible while a run executes.

1.1 WHEN a step transitions to `in-progress` (via `STEP_STARTING`) while a previously-touched step at a later or equal position is `pass`/`fail`/`skipped` THEN the system scrolls to the last non-`queued` entry, which may not be the `in-progress` step, so the currently-executing step can be left out of view.

1.2 WHEN the active step's row is already partially visible at an edge of the scroll container THEN the system uses `scrollIntoView({ block: 'nearest' })` and performs no scroll, leaving the current step clipped/not fully visible.

1.3 WHEN the log is long enough that the active step is below the visible area of the `log-container` THEN the system does not consistently bring the currently-executing step into the viewport as execution advances.

1.4 WHEN a run is an automation or a multi-task run (as opposed to a single test) THEN the system exhibits the same failure to track the current step, because the auto-scroll logic operates on `logEntries` only and does not distinguish run type.

### Expected Behavior (Correct)

2.1 WHEN a step transitions to `in-progress` (via `STEP_STARTING`) THEN the system SHALL scroll so that the `in-progress` step's row is brought into the visible area of the `log-container`, selecting the currently-executing step as the scroll target in preference to merely the last non-`queued` step.

2.2 WHEN the active step's row is partially visible at an edge of the scroll container THEN the system SHALL still scroll so the active step's row is fully within the visible area of the container.

2.3 WHEN the log is long enough that the active step is outside the visible area THEN the system SHALL bring the currently-executing step into the viewport as execution advances, keeping it visible.

2.4 WHEN a run is a test, an automation, or a multi-task run THEN the system SHALL apply identical current-step tracking behavior for all run/execution types.

2.5 WHEN there is no `in-progress` step but at least one step has been touched (e.g. the final step just completed) THEN the system SHALL scroll to the most recently updated non-`queued` step so the last activity remains visible.

### Unchanged Behavior (Regression Prevention)

3.1 WHEN no step has left the `queued` state (run not started, all entries `queued`) THEN the system SHALL CONTINUE TO perform no auto-scroll.

3.2 WHEN a step completes (`pass`/`fail`/`skipped`) and no later step is yet `in-progress` THEN the system SHALL CONTINUE TO keep the most recently updated step visible without scrolling away from it.

3.3 WHEN the user is viewing the log THEN the system SHALL CONTINUE TO render task headers, log entries, the parameter banner, and status indicators exactly as before (auto-scroll must not alter rendering or entry keying via `data-key="entry-<stepIndex>"`).

3.4 WHEN entries are spliced/created on demand by the runtime (context-based conditionals) THEN the system SHALL CONTINUE TO display those entries, and current-step tracking SHALL account for their positions.

3.5 WHEN the run view scrolls THEN the system SHALL CONTINUE TO use smooth scrolling behavior consistent with the current experience, without introducing jarring jumps for steps already fully in view.

## Bug Condition and Properties

### Definitions

- **F**: The original auto-scroll watcher in `LogContainer.vue` (selects the last non-`queued` entry and calls `scrollIntoView({ block: 'nearest', behavior: 'smooth' })`).
- **F'**: The fixed auto-scroll behavior (selects the currently-executing step and reliably brings it into the visible area).
- **X**: The run state, primarily the ordered list `logEntries` (each with `stepIndex` and `status`) plus the scroll geometry of the `log-container` and the target row.

### Bug Condition Function

```pascal
FUNCTION isBugCondition(X)
  INPUT: X of type RunState        // logEntries + container/row geometry
  OUTPUT: boolean

  // The current step is the in-progress step if one exists,
  // otherwise the most recently updated non-queued step.
  current ← currentStep(X.logEntries)

  RETURN current ≠ NONE AND (
      // (a) target selection diverges: last-non-queued ≠ in-progress current step
      (hasInProgress(X.logEntries) AND lastNonQueued(X.logEntries) ≠ current)
      // (b) current step is not fully within the visible area of the container
      OR NOT fullyVisible(current.row, X.container)
  )
END FUNCTION
```

### Property: Fix Checking

```pascal
// For every state that triggers the bug, the fixed behavior must make the
// currently-executing step fully visible in the container.
FOR ALL X WHERE isBugCondition(X) DO
  F'(X)
  current ← currentStep(X.logEntries)
  ASSERT fullyVisible(current.row, X.container)
  ASSERT scrolledToTarget(current) = true   // scroll target is the current step, not merely last-non-queued
END FOR
```

Where `currentStep` prefers the `in-progress` entry and falls back to the most recently updated non-`queued` entry:

```pascal
FUNCTION currentStep(entries)
  FOR i FROM entries.length - 1 DOWNTO 0 DO
    IF entries[i].status = 'in-progress' THEN RETURN entries[i]
  END FOR
  FOR i FROM entries.length - 1 DOWNTO 0 DO
    IF entries[i].status ≠ 'queued' THEN RETURN entries[i]
  END FOR
  RETURN NONE
END FUNCTION
```

### Property: Preservation Checking

```pascal
// For all states that do NOT trigger the bug, the fixed behavior is
// indistinguishable from the original (no unnecessary scroll, no rendering change).
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT F(X) = F'(X)
END FOR
```

Notably, when all entries are `queued` (`currentStep = NONE`) or when the current step is already fully visible and is the correct target, the fixed behavior performs no additional scroll and leaves rendering unchanged.
