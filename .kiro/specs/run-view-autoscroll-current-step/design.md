# Run View Auto-Scroll Current Step Bugfix Design

## Overview

During a run, the run/log view (`LogContainer.vue`) must keep the currently-executing step visible so the user can follow execution in real time. Today the auto-scroll watcher does not reliably do this: it targets the **last non-`queued`** entry (which may be a just-completed step, not the active one) and calls `scrollIntoView({ block: 'nearest' })`, which by specification performs no scroll when the target is already partially visible. In long logs the active step can therefore lag behind or stay clipped at a container edge.

The fix is a minimal, targeted change to the single auto-scroll watcher in `LogContainer.vue`. It changes two things: (1) the **target-selection logic** so the scroll target is the currently-executing step — preferring the last `in-progress` entry and falling back to the most recently updated non-`queued` entry — and (2) the **scroll behavior** so the target row is brought *fully* into the visible area even when partially visible, while preserving smooth scrolling and avoiding jarring jumps for rows already fully in view. The logic remains run-type agnostic, so identical behavior applies to tests, automations, and multi-task runs. All rendering, keying, task headers, the param banner, and the no-scroll-when-all-queued behavior are preserved.

## Glossary

- **Bug_Condition (C)**: The condition that triggers the bug — the currently-executing step is not the scroll target and/or is not fully within the visible area of the `log-container`.
- **Property (P)**: The desired behavior — the currently-executing step is selected as the scroll target and brought fully into the visible area of the container with smooth scrolling.
- **Preservation**: Existing rendering (task headers, log entries, param banner, status indicators, `data-key` entry keying) and the no-scroll-when-all-`queued` behavior that must remain unchanged by the fix.
- **currentStep**: The function that identifies the step to track: the last `in-progress` entry if one exists, otherwise the most recently updated non-`queued` entry, otherwise NONE.
- **auto-scroll watcher**: The `watch(() => logEntries.value.map((e) => e.status), ...)` block in `LogContainer.vue` (~lines 151-176) that reacts to step status changes and scrolls.
- **containerRef / `log-container`**: The scrollable `<div ref="containerRef" class="log-container">` wrapping all entries. Its geometry (scrollTop, clientHeight) defines the visible area.
- **logEntries**: The ordered list of `LogEntry` objects in the store, each with a `stepIndex` and a `status` of `'queued' | 'in-progress' | 'pass' | 'fail' | 'skipped'`. Entries are keyed in the DOM by `data-key="entry-<stepIndex>"`.
- **StepStatus transitions**: `App.vue` dispatches `STEP_STARTING` → `'in-progress'`, then `LOG` → `'pass'`/`'fail'`. The currently-executing step is the `in-progress` entry. `setStepStatus` mutates entries in place and creates entries on demand for spliced steps.
- **F / F'**: The original (unfixed) watcher / the fixed watcher.

## Bug Details

### Bug Condition

The bug manifests when a step becomes the currently-executing step (`in-progress`) or a step completes, and the auto-scroll watcher either **selects the wrong target** (the last non-`queued` entry instead of the current step) or **fails to bring the target fully into view** (because `block: 'nearest'` performs no scroll when the row is already partially visible). The watcher is either targeting a completed step instead of the active one, or leaving the active step clipped at a container edge, or both.

**Formal Specification:**
```
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

Where `currentStep` prefers the `in-progress` entry and falls back to the most recently updated non-`queued` entry:

```
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

### Examples

- **Target divergence**: Step 5 is `in-progress`, but step 6 (a later or equal position that was touched) is `pass`. Expected: scroll to step 5 (the active step). Actual (F): scrolls to the last non-`queued` entry, which can be a completed step, leaving step 5 out of view.
- **Partially clipped active step**: Step 8 is `in-progress` and its row is half-visible at the bottom edge of the `log-container`. Expected: the row is brought fully into view. Actual (F): `scrollIntoView({ block: 'nearest' })` does nothing because the row is already partially visible, so it stays clipped.
- **Long log advancing**: A 40-step run is executing; the active step is below the visible area. Expected: as each step becomes `in-progress`, the view scrolls to keep it visible. Actual (F): the view lags and the active step is not consistently brought into the viewport.
- **Edge case — final step completes**: The last step just transitioned to `pass`/`fail` with no later `in-progress` step. Expected: scroll to that most recently updated non-`queued` step so the last activity stays visible. (F' falls back to this via `currentStep`.)

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- No auto-scroll occurs when no step has left the `queued` state (run not started / all entries `queued`) — `currentStep = NONE`.
- Task headers, log entries, the parameter banner, and status indicators render exactly as before; auto-scroll does not alter rendering or entry keying via `data-key="entry-<stepIndex>"`.
- Spliced/on-demand entries created by the runtime (context-based conditionals) continue to display, and current-step tracking accounts for their positions.
- Smooth scrolling behavior is retained, without introducing jarring jumps for steps already fully in view.
- When a step completes and no later step is yet `in-progress`, the most recently updated step remains visible without scrolling away from it.

**Scope:**
All inputs that do NOT trigger the bug condition should be completely unaffected by this fix. This includes:
- Run states where all entries are `queued` (no scroll target).
- States where the current step is already fully visible and is the correct target (no additional scroll).
- All rendering, keying, and structural output of the component.

**Note:** The actual expected correct behavior (target selection + full visibility) is defined in the Correctness Properties section (Property 1). This section focuses on what must NOT change.

## Hypothesized Root Cause

Based on the bug description and code inspection of the auto-scroll watcher in `LogContainer.vue`, the causes are:

1. **Incorrect target selection**: The watcher chooses the **last non-`queued`** entry. Because a completing step transitions to `pass`/`fail` around the next step's `STEP_STARTING`, "last non-`queued`" tracks the last *touched* step, not the *current* step. When an `in-progress` step exists at an earlier index than a completed step, the scroll target diverges from the active step.
   - `STEP_STARTING` → `in-progress` and `LOG` → `pass`/`fail` are driven by `App.vue` on the same `logEntries` state.
   - The current step is precisely the last `in-progress` entry, with a fallback for the "just completed final step" case.

2. **`block: 'nearest'` performs no scroll when partially visible**: Per the `scrollIntoView` specification, `block: 'nearest'` is a no-op when the element is already partially within the scrollport. In a long log the active step can be clipped at an edge and never brought fully into view.

3. **Not a trigger defect**: The watcher observes `logEntries.value.map((e) => e.status)` with `{ deep: true }` and fires on both status changes and array-length changes (spliced entries). The trigger is adequate; the defect is in target selection and scroll behavior, not in when the watcher fires.

4. **Run-type independence is correct as-is**: The logic operates on `logEntries` only and does not distinguish run type, so tests, automations, and multi-task runs share the same (buggy) behavior — and will share the same fixed behavior.

## Correctness Properties

Property 1: Bug Condition - Current Step Is Selected And Fully Visible

_For any_ run state where the bug condition holds (`isBugCondition` returns true), the fixed auto-scroll watcher SHALL select the currently-executing step as the scroll target — the last `in-progress` entry if one exists, otherwise the most recently updated non-`queued` entry — and SHALL scroll so that this step's row is brought fully within the visible area of the `log-container`, using smooth scrolling.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**

Property 2: Preservation - Non-Bug States Unchanged

_For any_ run state where the bug condition does NOT hold (`isBugCondition` returns false), the fixed watcher SHALL produce the same observable result as the original watcher, preserving the no-scroll-when-all-`queued` behavior, the no-additional-scroll-when-already-correct-and-fully-visible behavior, and all rendering, task headers, param banner, status indicators, and `data-key="entry-<stepIndex>"` entry keying.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct, the change is confined to the auto-scroll watcher in `LogContainer.vue`. No other code (store, message handling, rendering) changes.

**File**: `packages/extension/panel-vue/src/components/LogContainer.vue`

**Function**: the `watch(() => logEntries.value.map((e) => e.status), ...)` callback (~lines 151-176)

**Specific Changes**:

1. **Introduce `currentStep` target selection**: Replace the "last non-`queued`" scan with a helper that first scans from the end for the last `in-progress` entry, and if none is found, scans from the end for the last non-`queued` entry. Return NONE (e.g. `-1`) when all entries are `queued`.
   - This makes the active (`in-progress`) step the preferred target (Requirements 2.1, 2.5).
   - The fallback preserves "keep last activity visible" when the final step just completed (Requirement 2.5, 3.2).

2. **Guard the no-target case**: When `currentStep` yields NONE, return early and perform no scroll — preserving the all-`queued` no-scroll behavior (Requirement 3.1).

3. **Resolve the target row via existing keying**: Continue to locate the element with `containerRef.value.querySelector('[data-key="entry-' + entry.stepIndex + '"]')`. No change to `data-key` (Requirement 3.3).

4. **Bring the row fully into view reliably**: Replace `block: 'nearest'` with behavior that brings a partially-visible row fully into the visible area while remaining a no-op when the row is already fully visible. Preferred approach: compute the row's position relative to the container (`el.offsetTop`, `el.offsetHeight`, `containerRef.value.scrollTop`, `containerRef.value.clientHeight`) and only adjust `scrollTop` when the row is above the top edge or below the bottom edge, using `containerRef.value.scrollTo({ top, behavior: 'smooth' })`. If explicit math is undesirable, use `el.scrollIntoView({ block: 'end', behavior: 'smooth' })` with a visibility check to avoid scrolling when already fully visible.
   - Explicit-math approach is preferred because it precisely satisfies "no additional scroll when already fully in view" (Requirements 2.2, 3.5) and avoids `nearest`'s partial-visibility no-op.

5. **Preserve smooth scrolling and run-type independence**: Keep `behavior: 'smooth'` and keep the logic operating on `logEntries` only, so all run types get identical behavior (Requirements 2.4, 3.5).

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior. Because the defect depends on scroll geometry, tests exercise a jsdom-backed `log-container` with controlled `clientHeight`/`scrollTop` and stubbed `scrollIntoView`/`scrollTo`, asserting on the resolved target `stepIndex` and the resulting scroll intent.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write tests that mount `LogContainer` with a controlled `logEntries` sequence and container geometry, drive status transitions (`STEP_STARTING` → `in-progress`, `LOG` → `pass`/`fail`), and assert which entry is chosen as the scroll target and whether it is fully brought into view. Run these tests on the UNFIXED code to observe failures and understand the root cause.

**Test Cases**:
1. **In-progress vs completed divergence**: An `in-progress` step exists at an earlier index than a later `pass` step; assert the target is the `in-progress` step (will fail on unfixed code — it targets last non-`queued`).
2. **Partially clipped active step**: Active `in-progress` row is partially visible at the bottom edge; assert it is fully brought into view (will fail on unfixed code — `block: 'nearest'` no-op).
3. **Long log advancing**: 40-step run; as each step goes `in-progress`, assert the active step becomes fully visible (will fail on unfixed code — lags / stays clipped).
4. **Final step completed (fallback)**: Last step transitions to `pass` with no later `in-progress`; assert target is that step (may pass on unfixed code — used to confirm fallback equivalence).

**Expected Counterexamples**:
- Scroll target is a completed step while an earlier step is `in-progress`.
- Active step remains partially clipped after the watcher runs.
- Possible causes: last-non-`queued` selection, `block: 'nearest'` partial-visibility no-op.

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL X WHERE isBugCondition(X) DO
  F'(X)
  current ← currentStep(X.logEntries)
  ASSERT fullyVisible(current.row, X.container)
  ASSERT scrolledToTarget(current) = true   // target is the current step, not merely last-non-queued
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT F(X) = F'(X)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many `logEntries` sequences and container geometries automatically across the input domain.
- It catches edge cases (spliced entries, all-`queued`, already-fully-visible rows) that manual unit tests might miss.
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs.

**Test Plan**: Observe behavior on UNFIXED code first for all-`queued` states, already-fully-visible correct targets, and rendering output, then write property-based tests capturing that behavior and asserting F' matches F for `NOT isBugCondition(X)`.

**Test Cases**:
1. **All-queued no-scroll**: Observe no scroll when every entry is `queued` on unfixed code, then verify this continues after fix (Requirement 3.1).
2. **Already-fully-visible correct target**: Observe no additional scroll when the current step is already fully visible on unfixed code, then verify this continues after fix (Requirements 3.2, 3.5).
3. **Rendering/keying unchanged**: Observe task headers, param banner, status indicators, and `data-key` values on unfixed code, then verify identical output after fix (Requirement 3.3).
4. **Spliced/on-demand entries displayed**: Observe on-demand entries render on unfixed code, then verify they still render and are tracked after fix (Requirement 3.4).

### Unit Tests

- Target selection for each case: `in-progress` present, `in-progress` absent with fallback, all `queued` (NONE).
- Full-visibility scroll for a row clipped at the top edge and at the bottom edge.
- No-op when the correct target is already fully visible.
- Rendering assertions for task headers, param banner, and `data-key` keying unchanged.

### Property-Based Tests

- Generate random `logEntries` status sequences and container geometries; assert the selected target equals `currentStep` and the target row is fully visible after F' (Fix Checking).
- Generate random non-bug states (`NOT isBugCondition`); assert F' equals F (no extra scroll, identical rendering) (Preservation Checking).
- Generate sequences including spliced/on-demand entries; assert tracking accounts for their positions.

### Integration Tests

- Full run flow for a single test: drive `STEP_STARTING`/`LOG` messages and assert the active step stays visible in a long log.
- Automation and multi-task run flows: assert identical current-step tracking behavior across run types (Requirement 2.4).
- Context-switching / conditional splicing: assert on-demand entries appear and current-step tracking follows execution, with smooth scrolling and no jarring jumps for already-visible rows.
