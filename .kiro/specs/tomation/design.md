# Design Document: Tomation Browser Extension

## Overview

Tomation is a monorepo containing three packages:

1. **`@tomation/dsl`** — A stub npm package providing TypeScript type definitions for authoring POMs and test files.
2. **`@tomation/compiler`** — A Node.js CLI that resolves, parses, flattens, deduplicates, and emits `spec.json` from DSL source files.
3. **Browser Extension** — A cross-browser WebExtensions extension (Chrome, Firefox, Edge) that loads `spec.json` files and executes their tests against the live DOM via a sidebar panel.

The system flow is:
```
Author writes DSL (.pom.js / .test.js)
  → @tomation/compiler resolves imports, parses, flattens → spec.json
  → User loads spec.json into extension sidebar
  → Background orchestrates test run step-by-step → Runtime executes DOM ops
  → Panel renders live log
```

---

## Architecture

### Monorepo Structure

```
tomation/
├── package.json                          (npm workspaces root)
├── packages/
│   ├── dsl/                              (@tomation/dsl)
│   │   ├── index.js
│   │   ├── index.d.ts
│   │   ├── globals.d.ts
│   │   └── package.json
│   ├── compiler/                         (@tomation/compiler)
│   │   ├── src/
│   │   │   ├── resolver.js               (import graph, topo sort, cycle detection)
│   │   │   ├── parser.js                 (AST parsing of Page() / Task() calls)
│   │   │   ├── pom.js                    (POM extraction and namespacing)
│   │   │   ├── flattener.js              (merge POMs + tests into spec shape)
│   │   │   ├── deduplicator.js           (detect conflicting keys across POMs)
│   │   │   └── emitter.js                (write spec.json to disk)
│   │   ├── bin/
│   │   │   └── tomation.js               (CLI entry point)
│   │   └── package.json
│   └── extension/                        (browser extension)
│       ├── manifest.json
│       ├── src/
│       │   ├── background.js             (service worker / orchestrator)
│       │   ├── runtime.js                (content script / DOM executor)
│       │   ├── panel.html / panel.js     (sidebar UI)
│       │   ├── options.html / options.js (options page)
│       │   └── storage.js                (storage abstraction)
│       └── playground/
│           ├── login/
│           ├── todo/
│           └── navigation/
└── examples/
    └── my-app-tests/
```

### Cross-Browser API Shim

All extension scripts use:
```js
var api = typeof browser !== 'undefined' ? browser : chrome;
```

### Manifest Strategy

`manifest.json` uses MV3 for Chrome/Edge and MV2 compatibility for Firefox:
- Chrome/Edge: `"side_panel"` key + `"action"` to open it
- Firefox: `"browser_action"` with `"default_popup"` pointing to `panel.html`

---

## Components and Interfaces

### Extension: Component Interaction

```
┌──────────────────────────────────────────────────────┐
│                   Browser Extension                   │
│                                                       │
│  ┌─────────────┐      messages      ┌──────────────┐  │
│  │  panel.js   │◄──────────────────►│ background.js│  │
│  │  (sidebar)  │                    │ (orchestrator│  │
│  └─────────────┘                    └──────┬───────┘  │
│                                            │          │
│                                    sendMessage        │
│                                            │          │
│                                     ┌──────▼───────┐  │
│                                     │  runtime.js  │  │
│                                     │ (content     │  │
│                                     │  script)     │  │
│                                     └──────────────┘  │
└──────────────────────────────────────────────────────┘
```

### Message Protocol

All messages use `api.runtime.sendMessage` (panel ↔ background) and `api.tabs.sendMessage` (background → runtime).

#### Panel → Background
| Message type       | Payload                        | Description                         |
|--------------------|--------------------------------|-------------------------------------|
| `RUN_TEST`         | `{ testIndex, checkedSteps }`  | Start a test run                    |
| `PAUSE`            | —                              | Pause step dispatch                 |
| `CONTINUE`         | —                              | Resume after pause or manual step   |
| `STOP`             | —                              | Abort the run                       |

#### Background → Panel
| Message type       | Payload                                              | Description                   |
|--------------------|------------------------------------------------------|-------------------------------|
| `LOG`              | `{ stepIndex, action, target, value, ok, error }`    | Step result log entry         |
| `MANUAL_PAUSE`     | `{ description }`                                    | Manual step banner            |
| `RUN_COMPLETE`     | `{ total, passed, failed }`                          | Final summary                 |
| `RUN_STOPPED`      | `{ total, passed, failed }`                          | Stop confirmed summary        |
| `STATE_SYNC`       | `{ running, paused, lockedTabId }`                   | State sync on panel open      |

#### Background → Runtime (content script)
| Message type       | Payload                                              | Description                   |
|--------------------|------------------------------------------------------|-------------------------------|
| `EXECUTE_STEP`     | `{ stepIndex, action, target, elementDescriptor, parentDescriptor?, value, ms, url, gone }` | Execute one step — `elementDescriptor` is the full element definition from `pageElements`; `parentDescriptor` is the full definition of the `childOf` parent element, present only when the target has a `childOf` field |

#### Runtime → Background
| Message type       | Payload                                 | Description                    |
|--------------------|-----------------------------------------|--------------------------------|
| `STEP_RESULT`      | `{ stepIndex, ok, error? }`             | Step outcome                   |
| `RUNTIME_READY`    | —                                       | Content script loaded after nav|

### Compiler Pipeline

```
CLI (tomation.js)
  → resolver.js    reads tomation.config.js, discovers files, builds import graph, topo sorts
  → parser.js      parses each file for Page() / Task() AST nodes
  → pom.js         extracts elements and tasks, applies PageName__key namespacing
  → flattener.js   merges all definitions + test arrays into spec shape
  → deduplicator.js checks for conflicting keys, reports errors with file+line
  → emitter.js     writes spec.json
```

---

## Data Models

### Spec JSON Schema

```js
// Top-level spec structure
{
  format: "tomation-spec",       // string, required
  version: 1,                    // number, required
  meta: {
    name: string,                // required
    url: string,                 // required
    description: string          // optional
  },
  pageElements: {
    [key: string]: {
      tag: string,               // e.g. "input", "button"
      label: string,             // optional display label
      childOf?: string,          // optional: id matcher value of a parent pageElement
      where: {
        id?: string,
        textIs?: string,
        textContains?: string,
        classIncludes?: string,
        placeholder?: string,
        name?: string,
        type?: string
      }
    }
  },
  tasks: {
    [key: string]: {
      params?: string[],
      steps: Step[]
    }
  },
  tests: Array<{
    name: string,
    steps: Step[]
  }>
}
```

### Step Schema

```js
// Discriminated union by action field
type Step =
  | { action: "click",          target: string }
  | { action: "type",           target: string, value: string }
  | { action: "typePassword",   target: string, value: string }
  | { action: "select",         target: string, value: string }
  | { action: "assertExists",   target: string }
  | { action: "assertNotExists",target: string }
  | { action: "assertHasText",  target: string, value: string }
  | { action: "task",           name: string, params?: Record<string, string> }
  | { action: "navigate",       url: string }
  | { action: "wait",           ms: number }
  | { action: "waitFor",        target: string, gone: boolean }
  | { action: "manual",         description: string }
```

### Storage Schema

```js
// browser.storage.local layout
{
  [hostname: string]: {
    host: string,
    name: string,
    specs: Array<{
      id: string,         // uuid-v4
      filename: string,
      loadedAt: string,   // ISO 8601
      spec: SpecJSON
    }>,
    lastUsed: string      // ISO 8601
  }
}
```

### Background Runtime State

```js
// Lives entirely in background.js memory during a run
{
  running: boolean,
  paused: boolean,
  stopRequested: boolean,
  lockedTabId: number | null,
  currentTestName: string,
  steps: ResolvedStep[],    // fully flattened, resolved steps
  stepIndex: number,
  passCount: number,
  failCount: number,
  pauseResolve: Function | null   // resolve fn of the pause promise
}
```

### Compiler Internal Graph

```js
// resolver.js: dependency node
{
  filePath: string,
  type: "pom" | "test",
  imports: string[],        // absolute paths of imported modules
  exports: string[]         // exported names
}
```

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Spec Validation Rejects Invalid Documents

*For any* JSON document passed to the Spec_Loader, if the document is missing any required top-level field (`format`, `version`, `pageElements`, `tasks`, `tests`) or has `format !== "tomation-spec"` or `version !== 1`, the loader SHALL return a non-empty error and SHALL NOT produce a valid parsed spec.

**Validates: Requirements 1.1, 1.2**

### Property 2: Step Target Resolution — All Targets Must Exist

*For any* valid spec, every `target` field in every step across all tasks and tests SHALL reference a key present in `pageElements`. The loader SHALL reject any spec that contains a step whose `target` is not found in `pageElements`.

**Validates: Requirements 1.3**

### Property 3: Task Reference Resolution — All Task Names Must Exist

*For any* valid spec, every `task` action step's `name` field SHALL reference a key present in the `tasks` map. The loader SHALL reject any spec that contains a `task` step whose `name` is absent from `tasks`.

**Validates: Requirements 1.4**

### Property 4: Template Parameter Resolution Completeness

*For any* task invocation with a `params` map and any step value containing `{{paramName}}` tokens, the background SHALL replace every token before sending the step to the runtime. *For any* resolved step sent to the runtime, the step's `value` field SHALL contain no unresolved `{{...}}` or `$random` tokens.

**Validates: Requirements 4.1, 4.2, 4.3**

### Property 5: Spec Serialization Round-Trip

*For any* valid spec object, serializing it to JSON and then parsing the resulting JSON string back SHALL produce a spec object that is structurally and semantically equivalent to the original.

**Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 10.3**

### Property 6: Compiler Namespacing Consistency

*For any* POM file defining a page named `P` with element key `k`, the compiler SHALL emit exactly one entry `P__k` in `pageElements`. *For any* two POM files defining the same page name `P`, the deduplicator SHALL report a conflict error and SHALL NOT emit a spec.

**Validates: Requirements 13.2, 13.3, 13.7**

### Property 7: Step Flattening Preserves Order and Count

*For any* test whose steps include `task` actions, the background's flattening operation SHALL produce an ordered step list where every child step of every task appears in the same relative order as defined in the task's `steps` array, and the total count of flattened steps equals the sum of all terminal (non-task) steps reachable from the test.

**Validates: Requirements 5.1**

### Property 8: Skipped Steps Are Never Executed

*For any* test run configuration where a subset of steps is unchecked by the user, the background SHALL execute exactly the checked steps and SHALL NOT send any unchecked step to the runtime. The executed step count SHALL equal the number of checked steps.

**Validates: Requirements 6.4, 6.5**

### Property 9: Where Matcher AND Semantics

*For any* element descriptor with multiple `where` keys, the runtime SHALL only return a matching element if and only if the DOM element satisfies ALL matcher conditions simultaneously.

**Validates: Requirements 2.1**

### Property 10: TypePassword Value Masking

*For any* `typePassword` step, regardless of the actual `value` content, the panel's log output SHALL display `"****"` in place of the value. The masking SHALL apply consistently across all log entries for that step.

**Validates: Requirements 3.3**
**Validates: Requirements 3.3**

### Property 11: childOf Scoping — Search Is Restricted to Parent Subtree

*For any* element descriptor that includes a `childOf` field, the runtime SHALL only consider DOM nodes that are descendants of the resolved parent element. *For any* DOM tree where a matching element exists outside the parent subtree but not inside it, the runtime SHALL return `{ ok: false }` — i.e., the element is treated as not found.

**Validates: Requirements 2.2a**

---

## Error Handling

### Spec Loading Errors

- **Missing required fields**: Return `{ ok: false, error: "Missing field: <fieldName>" }` from `validateSpec()`.
- **Invalid format/version**: Return `{ ok: false, error: "Unsupported spec format or version" }`.
- **Broken target references**: Report `"Step references unknown element: <target>"`.
- **Broken task references**: Report `"Step references unknown task: <name>"`.

### Runtime Errors

- **Element not found (timeout)**: Return `{ ok: false, error: "Element not found within 5s: <key>" }`.
- **Parent element not found (childOf, timeout)**: Return `{ ok: false, error: "Parent element not found: <childOf id value>" }`.
- **Action failure** (e.g., `assertHasText` mismatch): Return `{ ok: false, error: "Assertion failed: expected '<value>' in element <key>" }`.
- **Runtime receives unresolved token**: Log a warning; this should never occur given Property 4.

### Background Orchestration Errors

- **Tab closed during run**: Background detects `tabs.onRemoved` and aborts the run with `{ ok: false, error: "Tab closed during test run" }`.
- **Runtime not responding after navigate**: Background times out after 10 seconds waiting for `RUNTIME_READY` and halts the run.
- **Unresolved template param**: Log warning, substitute empty string, continue.

### Compiler Errors

- **No `tomation.config.js`**: Exit with code 1, message `"tomation.config.js not found in current directory"`.
- **Circular import**: Exit with code 1, message `"Circular import detected: A → B → C → A"`.
- **Duplicate key**: Exit with code 1, message `"Duplicate element key 'PageName__key' defined in file1.pom.js and file2.pom.js"`.
- **Parse error**: Exit with code 1, message `"Parse error in <file>:<line>: <detail>"`.

---

## Testing Strategy

### Dual Testing Approach

- **Unit tests**: Verify specific examples, edge cases, and error conditions for individual functions (spec validator, step flattener, compiler pipeline stages, element finder logic).
- **Property-based tests**: Verify universal properties across many generated inputs (spec round-trips, template resolution, flattening order, where-matcher AND logic).

Property-based tests use [**fast-check**](https://github.com/dubzzz/fast-check) (Node.js), chosen because:
- The compiler runs in Node.js where npm packages are available.
- For the runtime/background logic (pure JS functions extracted from extension scripts), fast-check runs in Node.js test harness — no browser required.
- Minimum 100 iterations per property.

Each property test references its design property using the tag comment:
```js
// Feature: tomation, Property N: <property_text>
```

### Unit Test Coverage

- **Spec Loader (`validateSpec`)**: Test each required field missing, wrong format/version, broken target/task refs, invalid `childOf` reference.
- **Background flattener**: Test task expansion with params, `$random` replacement, unchecked step exclusion.
- **Runtime element finder**: Mock DOM queries; test all 7 matcher types, AND combination, timeout path, `childOf` scoping (element inside parent found, element outside parent rejected, parent not found).
- **Runtime actions**: Test each of the 13 supported actions with mock DOM elements.
- **Compiler resolver**: Test topo sort correctness, cycle detection.
- **Compiler deduplicator**: Test conflict detection with same key from two different POMs.
- **Storage manager**: Test CRUD operations, filename deduplication, UUID preservation on replace.

### Integration Test Coverage

- **End-to-end spec load**: Load a real spec.json into the storage layer and verify retrieval.
- **Panel ↔ Background messaging**: Test that `RUN_TEST`, `PAUSE`, `CONTINUE`, `STOP` messages produce the correct background state transitions.
- **Cross-page navigation**: Test that after a `navigate` step, background correctly waits for `RUNTIME_READY`.

### Extension-Specific Test Notes

The extension's background and runtime logic is organized as pure functions that can be imported and tested in Node.js without a browser. DOM interaction is isolated behind a thin adapter layer (the content script) that is tested with `jsdom` mocks.

### Property Test Configuration

- Library: `fast-check` (installed in compiler and test packages)
- Minimum iterations: 100 per property
- Tag format: `// Feature: tomation, Property N: <property_text>`
