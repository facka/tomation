# Design Document: Failure Recovery

## Overview

This spec extends the Tomation browser extension with failure recovery capabilities:

1. **Retry Failed Action** — Re-execute only the last failed step without restarting the test.
2. **Skip Failed Action** — Bypass a failed step and continue from the next one.
3. **Test Plan Configuration** — Per-test-plan settings controlling retry/skip visibility and execution speed.

These features integrate into the existing three-component architecture (Panel ↔ Background ↔ Runtime) without changing the extension's ES5-compatible, bundler-free approach. The Background gains a new "awaiting user action" state in its run state machine, the Panel adds configuration controls, and the message protocol expands with three new message types.

---

## Architecture

### Existing Component Interaction (unchanged)

```
┌──────────────────────────────────────────────────────────┐
│                     Browser Extension                     │
│                                                          │
│  ┌─────────────┐      messages       ┌───────────────┐  │
│  │  panel.js   │◄───────────────────►│ background.js │  │
│  │  (sidebar)  │                     │ (orchestrator)│  │
│  └─────────────┘                     └───────┬───────┘  │
│                                              │           │
│                                      tabs.sendMessage    │
│                                              │           │
│                                       ┌──────▼───────┐  │
│                                       │  runtime.js  │  │
│                                       │ (content     │  │
│                                       │  script)     │  │
│                                       └──────────────┘  │
└──────────────────────────────────────────────────────────┘
```

### New State in the Run Loop

The Background's step loop currently halts on failure. This spec introduces an intermediate **"awaiting user action"** state that keeps the run alive while the user decides whether to retry or skip:

```
┌──────────┐     step ok      ┌──────────────┐
│ Running  │─────────────────►│ Next Step    │
└──────────┘                  └──────────────┘
      │
      │ step fails & (allowRetry || allowSkip)
      ▼
┌─────────────────────────┐
│ Awaiting User Action    │
│ (run alive, paused on   │
│  failed step)           │
└──────────┬──────────────┘
           │
     ┌─────┴──────┐
     │             │
  RETRY_STEP    SKIP_STEP
     │             │
     ▼             ▼
  Re-execute    Advance to
  same step     next step
```

If neither `allowRetryOnFailure` nor `allowContinueOnFailure` is enabled, the run halts immediately on failure (existing v1 behavior).

### Execution Speed Integration

The Background inserts a configurable delay **before** dispatching each step:
- **FAST**: 0ms (no delay, current v1 behavior)
- **NORMAL**: 500ms
- **SLOW**: 1500ms

This delay is implemented as a `setTimeout` promise in the step loop, after the pause check but before `sendStepToRuntime`.

---

## Components and Interfaces

### Updated Message Protocol

#### Panel → Background (new messages)

| Message type   | Payload                      | Description                                      |
|----------------|------------------------------|--------------------------------------------------|
| `RETRY_STEP`   | `{ stepIndex: number }`      | Retry the failed step at stepIndex               |
| `SKIP_STEP`    | `{ stepIndex: number }`      | Skip the failed step and continue from next step |
| `RUN_TEST`     | `{ testIndex, checkedSteps, config }` | Start a run (extended with config object) |

The `config` object shape:
```js
{
  allowContinueOnFailure: boolean,
  allowRetryOnFailure: boolean,
  executionSpeed: 'FAST' | 'NORMAL' | 'SLOW'
}
```

#### Background → Panel (new messages)

| Message type                 | Payload                                   | Description                                    |
|------------------------------|-------------------------------------------|------------------------------------------------|
| `STEP_FAILED_AWAITING_ACTION`| `{ stepIndex, action, target, value, error }` | Step failed, waiting for user retry/skip   |
| `LOG`                        | `{ ..., retryAttempt?: number }`          | Extended LOG with optional retry attempt count |

### Panel Components (new/modified)

| Component             | Location                | Description                                           |
|-----------------------|-------------------------|-------------------------------------------------------|
| Configuration section | Test Plan view, between step checklist and Run button | Contains 2 toggles + 1 selector |
| Retry/Skip buttons    | Run view, inline in failed log entries | Appear based on config flags |

### Background Functions (new/modified)

| Function                | Description                                                     |
|-------------------------|-----------------------------------------------------------------|
| `handleRetryStep(msg)`  | Re-sends the failed step to runtime, resumes loop on success    |
| `handleSkipStep(msg)`   | Advances `stepIndex`, resumes step loop                         |
| `applySpeedDelay()`     | Returns a Promise that resolves after the configured delay      |
| `runStepLoop()` (mod)   | Now checks `awaitingAction` state and inserts speed delay       |
| `handleMessage()` (mod) | Routes `RETRY_STEP` and `SKIP_STEP` messages                   |

### Storage Functions (new)

| Function                        | Description                                             |
|---------------------------------|---------------------------------------------------------|
| `getTestPlanConfig(key)`        | Retrieve config object for a spec+test combination      |
| `saveTestPlanConfig(key, config)` | Persist config object to `browser.storage.local`      |

---

## Data Models

### Run State (extended)

```js
// background.js — additions to existing runState object
{
  // ... existing fields ...
  awaitingAction: boolean,       // true when step failed and retry/skip is available
  failedStepIndex: number|null,  // index of the step currently awaiting action
  retryAttempt: number,          // attempt counter for the current step (starts at 1)
  config: {                      // configuration for the current run
    allowContinueOnFailure: boolean,
    allowRetryOnFailure: boolean,
    executionSpeed: 'FAST' | 'NORMAL' | 'SLOW'
  }
}
```

### Test Plan Configuration Storage Schema

```js
// browser.storage.local layout addition
{
  // existing: [hostname]: { ... project data ... }
  
  // new: configuration keyed by "config:<specId>:<testIndex>"
  "config:<specId>:<testIndex>": {
    allowContinueOnFailure: boolean,  // default: false
    allowRetryOnFailure: boolean,     // default: false
    executionSpeed: 'FAST' | 'NORMAL' | 'SLOW'  // default: 'NORMAL'
  }
}
```

The composite key `config:<specId>:<testIndex>` uniquely identifies a test plan's configuration. The `specId` is the UUID already stored in the spec entry within the project.

### Speed Delay Map

```js
var SPEED_DELAYS = {
  'FAST': 0,
  'NORMAL': 500,
  'SLOW': 1500
};
```

### Log Entry (extended for retry)

```js
// LOG message payload extension
{
  type: 'LOG',
  stepIndex: number,
  action: string,
  target: string|null,
  value: string|null,
  ok: boolean,
  error?: string,
  retryAttempt?: number   // present when step was retried (2, 3, ...)
}
```

### STEP_FAILED_AWAITING_ACTION Message

```js
{
  type: 'STEP_FAILED_AWAITING_ACTION',
  stepIndex: number,
  action: string,
  target: string|null,
  value: string|null,
  error: string
}
```

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Failure Action Button Visibility Matches Configuration

*For any* test plan configuration and any step failure event, the "Try Again" button SHALL be visible if and only if `allowRetryOnFailure` is `true`, and the "Skip" button SHALL be visible if and only if `allowContinueOnFailure` is `true`. When a button is not configured to appear, it SHALL be absent from the DOM for that log entry.

**Validates: Requirements 1.1, 1.8, 2.1, 2.6, 3.5, 3.6**

### Property 2: Retry Re-executes Only the Failed Step

*For any* run state where `awaitingAction` is `true` and `failedStepIndex` points to a valid step, handling a `RETRY_STEP` message SHALL dispatch exactly one `EXECUTE_STEP` to the runtime for the step at `failedStepIndex`. If the runtime returns `{ ok: true }`, `stepIndex` SHALL advance to `failedStepIndex + 1` and `passCount` SHALL increment by 1. If the runtime returns `{ ok: false }`, the run SHALL halt (`running = false`) and the tab SHALL be unlocked.

**Validates: Requirements 1.3, 1.4, 1.5**

### Property 3: Awaiting-Action State Blocks Step Advancement

*For any* run state where `awaitingAction` is `true`, the step loop SHALL NOT advance `stepIndex`, SHALL NOT send any `EXECUTE_STEP` message, and SHALL NOT emit `RUN_COMPLETE` or `RUN_STOPPED` until a `RETRY_STEP` or `SKIP_STEP` message is received.

**Validates: Requirements 1.7**

### Property 4: Skip Preserves Progress and Advances Correctly

*For any* run state where `awaitingAction` is `true`, handling a `SKIP_STEP` message SHALL advance `stepIndex` to `failedStepIndex + 1` without modifying `passCount`. The `failCount` SHALL remain as incremented by the initial failure. If `failedStepIndex` is the last step in the sequence, the run SHALL end with a `RUN_COMPLETE` summary.

**Validates: Requirements 2.3, 2.4**

### Property 5: Speed Delay Mapping

*For any* `executionSpeed` value in `{ 'FAST', 'NORMAL', 'SLOW' }`, the `applySpeedDelay` function SHALL return a delay of exactly 0ms, 500ms, or 1500ms respectively. *For any* other value, the function SHALL default to 0ms (FAST behavior).

**Validates: Requirements 3.8, 3.9, 3.10**

### Property 6: Configuration Storage Round-Trip

*For any* valid configuration object (with `allowContinueOnFailure` as boolean, `allowRetryOnFailure` as boolean, and `executionSpeed` as one of FAST/NORMAL/SLOW), saving it to storage via `saveTestPlanConfig(key, config)` and then reading it back via `getTestPlanConfig(key)` SHALL return an object equal to the original configuration.

**Validates: Requirements 3.11, 3.12**

### Property 7: RUN_TEST Message Includes Configuration

*For any* configuration state in the Panel UI (any combination of toggle values and speed selector), clicking the Run button SHALL produce a `RUN_TEST` message whose `config` field matches the current UI state: `config.allowContinueOnFailure` equals the "Allow continue on failure" toggle state, `config.allowRetryOnFailure` equals the "Allow retry on failure" toggle state, and `config.executionSpeed` equals the selected speed value.

**Validates: Requirements 3.7**

---

## Error Handling

### Retry/Skip Error Scenarios

- **RETRY_STEP received when not in awaitingAction state**: Ignore the message (no-op). Log a warning to console.
- **SKIP_STEP received when not in awaitingAction state**: Ignore the message (no-op). Log a warning to console.
- **RETRY_STEP with invalid stepIndex**: If `stepIndex` doesn't match `failedStepIndex`, ignore. Prevents stale messages from previous failures.
- **Runtime disconnected during retry**: Same as v1 — the `sendStepToRuntime` promise rejects, Background halts the run and emits `RUN_COMPLETE` with failure.
- **Tab closed during awaitingAction**: Background's existing `tabs.onRemoved` listener fires, aborts the run with an error.

### Configuration Error Scenarios

- **Corrupted config in storage**: If `getTestPlanConfig` returns a value that doesn't match the expected schema (missing fields, wrong types), fall back to defaults. Log a warning.
- **Storage write failure**: If `saveTestPlanConfig` rejects, catch the error and log to console. Do not block the user from running the test (config is best-effort persistence).

### Speed Delay Error Scenarios

- **Unknown executionSpeed value**: Default to 0ms (FAST). Log a warning. This makes the system fail-open — tests still run rather than hanging.
- **Config missing from RUN_TEST message**: Background defaults to `{ allowContinueOnFailure: false, allowRetryOnFailure: false, executionSpeed: 'FAST' }` — equivalent to v1 behavior.

---

## Testing Strategy

### Dual Testing Approach

- **Unit tests**: Verify specific examples, edge cases, and error conditions.
- **Property-based tests**: Verify universal properties across generated inputs.

Property-based tests use [**fast-check**](https://github.com/dubzzz/fast-check), already installed in the extension package.

### Property Test Configuration

- Library: `fast-check` (v3.23.2, already in devDependencies)
- Test runner: Node.js built-in `node:test`
- Minimum iterations: 100 per property
- Tag format: `// Feature: failure-recovery, Property N: <property_text>`
- Each property test must implement exactly one correctness property from this document

### Property Test Plan

| Property | Module under test | Generator strategy |
|----------|------------------|--------------------|
| 1: Button visibility | Panel rendering logic (extracted function) | Generate random `{ allowRetryOnFailure, allowContinueOnFailure }` configs and step failure events |
| 2: Retry state transition | `background.js` handleRetryStep | Generate random run states (step arrays, failure positions), mock runtime responses |
| 3: Awaiting-action blocking | `background.js` runStepLoop | Generate run states with `awaitingAction=true`, verify no advancement over time |
| 4: Skip state transition | `background.js` handleSkipStep | Generate random step arrays and failure positions at different points |
| 5: Speed delay mapping | `background.js` applySpeedDelay | Generate random speed values from the enum + invalid values |
| 6: Config round-trip | `storage.js` getTestPlanConfig / saveTestPlanConfig | Generate random config objects with arbitrary boolean/enum combinations |
| 7: RUN_TEST includes config | Panel onRunClick logic (extracted) | Generate random config UI states |

### Unit Test Plan

| Area | Tests |
|------|-------|
| handleRetryStep | Retry when not awaiting (ignored), retry success resumes, retry failure halts, invalid stepIndex ignored |
| handleSkipStep | Skip mid-sequence advances, skip last step ends run, skip preserves passCount, skip when not awaiting ignored |
| applySpeedDelay | Returns correct delay for each speed, defaults for unknown values |
| Configuration UI | Defaults when no saved config, restores saved config, persists on change |
| STEP_FAILED_AWAITING_ACTION | Panel receives message and renders buttons correctly |
| Button disabling | Clicking retry/skip disables both buttons |

### Integration Test Plan

| Scenario | Components involved |
|----------|-------------------|
| Full retry flow | Panel sends RETRY_STEP → Background re-dispatches → Runtime responds → Panel updates log |
| Full skip flow | Panel sends SKIP_STEP → Background advances → next step executes → Panel logs |
| Speed delay end-to-end | Panel sends RUN_TEST with speed config → Background inserts delays → steps execute at intervals |
| Config persistence across sessions | Save config → close panel → reopen → config restored |
