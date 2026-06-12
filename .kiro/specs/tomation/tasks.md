# Implementation Plan: Tomation Browser Extension

## Overview

This plan implements the tomation monorepo incrementally, starting with the shared spec validation logic, then the compiler pipeline, and finally the browser extension UI and runtime. Each task builds on the previous, wiring components together progressively.

The implementation language is **JavaScript (Node.js for compiler/tests, ES5-compatible vanilla JS for the extension)** with fast-check for property-based testing.

---

## Tasks

- [x] 1. Initialize monorepo structure
  - Create root `package.json` with npm workspaces pointing to `packages/dsl`, `packages/compiler`, `packages/extension`
  - Create directory skeletons for all three packages with their respective `package.json` files
  - Add fast-check as a dev dependency in `packages/compiler` for property-based testing
  - Set up a minimal test runner (Node's built-in `node:test` or Jest) in the compiler package
  - _Requirements: (all — foundational)_

---

- [x] 2. Implement spec validation (`validateSpec`)
  - [x] 2.1 Create `packages/compiler/src/validator.js` with a `validateSpec(obj)` function
    - Check `format === "tomation-spec"` and `version === 1`
    - Check presence of all required top-level fields: `format`, `version`, `pageElements`, `tasks`, `tests`
    - Validate every `pageElements` entry has `tag` and a `where` object with at least one key
    - Validate every `pageElements` entry with a `childOf` field: the referenced `id` value must correspond to an existing `pageElements` entry that has `where.id` defined; reject with a descriptive error if not
    - Validate every `tasks` entry has a `steps` array
    - Validate every `tests` entry has a `name` string and `steps` array
    - Validate every step `target` references a key in `pageElements`
    - Validate every `task` action `name` references a key in `tasks`
    - Return `{ ok: true, spec }` on success or `{ ok: false, error: "..." }` on failure
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.6a, 1.7, 1.8_

  - [x] 2.2 Write property tests for spec validation
    - **Property 1: Spec Validation Rejects Invalid Documents** — generate random JSON objects with missing/wrong format or version; verify all rejected
    - **Property 2: Step Target Resolution** — generate valid specs then inject unknown target keys; verify all rejected
    - **Property 3: Task Reference Resolution** — generate valid specs then inject unknown task action names; verify all rejected
    - **Property 5: Spec Serialization Round-Trip** — generate valid spec objects, serialize to JSON, parse back, verify structural equivalence
    - `// Feature: tomation, Property 1-3, 5`
    - _Requirements: 1.1–1.8_

- [x] 3. Checkpoint — validator tests pass
  - Ensure all tests pass, ask the user if questions arise.

---

- [x] 4. Implement the `@tomation/dsl` package
  - [x] 4.1 Create `packages/dsl/index.js` with stub exports for `Page`, `Task`, and `el`
    - `Page(name, definition)` → returns `{ __pom: true, name, definition }`
    - `Task(steps)` → returns `{ __task: true, steps }`
    - `el(descriptor)` → returns `{ __el: true, ...descriptor }`
    - _Requirements: 14.1_

  - [x] 4.2 Create `packages/dsl/index.d.ts` with TypeScript interfaces
    - Define `WhereDescriptor`, `ElementDescriptor`, `Step` (discriminated union over all 13 action types), `TaskDefinition`, `PageDefinition`
    - Export typed `Page`, `Task`, `el` function signatures
    - _Requirements: 14.2_

  - [x] 4.3 Create `packages/dsl/globals.d.ts` with ambient declarations
    - Declare global functions for all action types: `click`, `type`, `typePassword`, `select`, `assertExists`, `assertNotExists`, `assertHasText`, `task`, `navigate`, `wait`, `waitFor`, `manual`
    - _Requirements: 14.3_

---

- [x] 5. Implement the compiler — resolver and import graph
  - [x] 5.1 Create `packages/compiler/src/resolver.js`
    - Read `tomation.config.js` from CWD; fail immediately with clear error if not found
    - Discover all `.pom.js` files under the configured `pom` directory
    - Discover all `.test.js` files under the configured `tests` directory
    - Parse `import` statements in each file to build a dependency graph
    - Implement topological sort using Kahn's algorithm
    - Detect cycles: if a cycle is found, report error with the full cycle path (A → B → C → A) and stop processing
    - Return ordered list of file paths for processing
    - _Requirements: 12.4, 13.4, 13.5_

  - [x] 5.2 Write property tests for resolver
    - **Property 6 (partial): Topological sort** — generate random DAGs and verify output is a valid topological order
    - Verify cycle detection reports the cycle path correctly for generated cyclic graphs
    - `// Feature: tomation, Property 6`
    - _Requirements: 12.4, 13.4, 13.5_

---

- [x] 6. Implement the compiler — parser and POM extractor
  - [x] 6.1 Create `packages/compiler/src/parser.js`
    - Use Node.js `fs.readFileSync` + lightweight AST parsing (via `acorn` or regex-based for `Page()` calls) to extract `Page(name, { elements, tasks })` calls
    - Return a structured AST representation for each file
    - Report parse errors with file path and line number
    - _Requirements: 12.5, 13.1_

  - [x] 6.2 Create `packages/compiler/src/pom.js`
    - Extract elements from parsed AST, applying `PageName__key` namespacing to element keys
    - Extract tasks from parsed AST, applying `PageName__key` namespacing to task keys
    - Preserve source file path and line number metadata for error reporting
    - _Requirements: 13.2, 13.3_

  - [x] 6.3 Write property tests for namespacing
    - **Property 6: Compiler Namespacing Consistency** — generate POM definitions with arbitrary page names and keys; verify every output key is exactly `PageName__key`
    - Verify no key collisions within a single POM's output
    - `// Feature: tomation, Property 6`
    - _Requirements: 13.2, 13.3_

---

- [x] 7. Implement the compiler — flattener, deduplicator, and emitter
  - [x] 7.1 Create `packages/compiler/src/deduplicator.js`
    - Accept a merged map of all namespaced element and task keys with their source file metadata
    - Detect any key defined in more than one source POM file
    - On conflict, report error: `"Duplicate element key 'X' defined in file1 and file2"` — stop processing (do not emit)
    - _Requirements: 13.7_

  - [x] 7.2 Create `packages/compiler/src/flattener.js`
    - Accept the ordered list of parsed POM and test definitions
    - Merge all `pageElements` objects into a single flat map
    - Merge all `tasks` objects into a single flat map
    - Collect all test arrays into a single `tests` array
    - Populate `meta` from the first test file's metadata comment or a default
    - Return a spec-shaped object ready for validation and emission
    - _Requirements: 13.6_

  - [x] 7.3 Create `packages/compiler/src/emitter.js`
    - Accept a validated spec object and an output path
    - Write `spec.json` with `JSON.stringify` (formatted, 2-space indent)
    - _Requirements: 12.1_

  - [x] 7.4 Write property tests for flattener
    - **Property 5: Spec Serialization Round-Trip** — generate spec objects; serialize via emitter; parse back; verify structural equivalence
    - `// Feature: tomation, Property 5`
    - _Requirements: 13.6, 12.1_

---

- [x] 8. Implement the compiler CLI entry point
  - [x] 8.1 Create `packages/compiler/bin/tomation.js`
    - Parse CLI arguments: `compile`, `watch`, `check` subcommands
    - `compile`: run full pipeline and emit `spec.json`
    - `check`: run pipeline through validation, report errors, exit 0 (valid) or 1 (invalid), no file write
    - `watch`: run `compile` then watch source files with `fs.watch`; re-run pipeline on any change, print rebuild output
    - All errors report file path + line number; exit code 1 on any error
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_

- [x] 9. Checkpoint — compiler pipeline end-to-end
  - Use the `examples/my-app-tests/` fixture to run `node bin/tomation.js compile` and verify `spec.json` is emitted correctly.
  - Ensure all tests pass, ask the user if questions arise.

---

- [x] 10. Implement extension storage layer
  - [x] 10.1 Create `packages/extension/src/storage.js`
    - Implement `getProject(hostname)` → returns project object or null
    - Implement `saveProject(hostname, project)` → persists to `browser.storage.local`
    - Implement `addSpec(hostname, filename, spec)` → assign new UUID-v4 `id` and `loadedAt` ISO timestamp; if same `filename` exists, replace entry keeping original UUID and updating `loadedAt`
    - Implement `deleteSpec(hostname, specId)` → removes spec entry
    - Implement `deleteProject(hostname)` → removes entire hostname key
    - Implement `renameProject(hostname, newName)` → updates project `name` field
    - Implement `getAllProjects()` → returns all hostname-keyed project objects
    - Implement `exportAll()` → returns JSON-serializable dump of all storage
    - Implement `importAll(data)` → merges imported projects; on hostname conflict, call provided callback to get user choice (`merge` or `replace`)
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7_

  - [ ]* 10.2 Write property tests for storage
    - **Property 5 (storage): Round-trip storage** — generate arbitrary project/spec data; store via `saveProject`/`addSpec`; retrieve via `getProject`; verify structural equivalence
    - **Property (UUID preservation)**: Generate spec pairs with same filename; verify UUID preserved after `addSpec` replacement
    - Mock `browser.storage.local` with an in-memory object
    - `// Feature: tomation, Property 5`
    - _Requirements: 10.1–10.5_

---

- [x] 11. Implement extension manifest and cross-browser shim
  - [x] 11.1 Create `packages/extension/manifest.json`
    - MV3 structure for Chrome/Edge: declare `side_panel`, `action`, `background` (service worker), `content_scripts` (runtime.js), `permissions` (`storage`, `tabs`, `sidePanel`)
    - Include `browser_action` with `default_popup: "src/panel.html"` for Firefox compatibility
    - _Requirements: 11.2, 11.3_

  - [x] 11.2 Create a shared `api` shim at the top of each extension script
    - `var api = typeof browser !== 'undefined' ? browser : chrome;`
    - Use `api` for all WebExtensions calls throughout background.js, runtime.js, panel.js, options.js, storage.js
    - _Requirements: 11.1, 11.4_

---

- [ ] 12. Implement the content script — runtime.js
  - [x] 12.1 Implement element finder
    - `findElement(descriptor, parentNode?)` → returns a Promise that resolves to the DOM element or rejects after 5 seconds
    - Poll using `requestAnimationFrame`; evaluate all `where` keys as AND conditions
    - Support all 7 matcher types: `id`, `textIs`, `textContains`, `classIncludes`, `placeholder`, `name`, `type`
    - WHEN `parentDescriptor` is present in the step message, first locate the parent element using its full descriptor, then scope the child search to `parent.querySelectorAll` descendants; return `{ ok: false, error: "Parent element not found: <id>" }` if parent is not found within timeout
    - _Requirements: 2.1, 2.2, 2.2a, 2.3, 2.4_

  - [x] 12.2 Implement element highlighter
    - `highlightElement(el)` → adds `data-tomation-active` attribute
    - `unhighlightElement(el)` → removes `data-tomation-active` attribute
    - Call `highlightElement` before executing each step's action; call `unhighlightElement` after (in a finally block)
    - _Requirements: 2.5, 2.6_

  - [ ] 12.3 Implement action handlers for all 13 action types
    - `executeAction(step, element)` dispatches to the correct handler based on `step.action`
    - `click`: dispatch MouseEvent
    - `type`: set element.value, dispatch `input` + `change` events
    - `typePassword`: same as `type`
    - `select`: set element.value on `<select>`, dispatch `change`
    - `assertExists`: always resolves ok (element was found by finder)
    - `assertNotExists`: returns ok:false (element should not have been found)
    - `assertHasText`: check `element.textContent.includes(step.value)`
    - `waitFor`: poll until element appears (gone=false) or disappears (gone=true)
    - All others (`navigate`, `wait`, `task`, `manual`) are handled in background, not runtime
    - _Requirements: 3.1–3.7, 3.11, 3.12_

  - [ ] 12.4 Implement message listener in runtime.js
    - Listen for `EXECUTE_STEP` messages via `api.runtime.onMessage`
    - On receive: find element (if step requires one), highlight, execute action, unhighlight, send back `STEP_RESULT`
    - On script load: send `RUNTIME_READY` to background
    - _Requirements: 5.2, 5.6_

  - [ ]* 12.5 Write property tests for runtime logic (using jsdom)
    - **Property 9: Where Matcher AND Semantics** — generate DOM trees and multi-key where descriptors; verify only elements satisfying all conditions returned
    - **Property 11: childOf Scoping** — generate DOM trees with matching elements inside and outside a parent subtree; verify element inside parent is found, element outside is not found even when it matches the `where` descriptor
    - **Property 2 (type action): type sets value** — generate arbitrary non-empty strings; verify element.value equals input after `type`
    - **Property 3 (typePassword masking)**: generate password strings; verify log-facing value is masked
    - **Property 7 (assertHasText)**: generate text/value pairs; verify ok:true iff value is substring of text
    - **Properties 2.5/2.6 (highlight/unhighlight)**: verify attribute lifecycle
    - `// Feature: tomation, Property 2, 3, 7, 9, 10, 11`
    - _Requirements: 2.1, 2.2a, 2.5, 2.6, 3.2, 3.3, 3.7_

- [ ] 13. Checkpoint — runtime unit tests pass
  - Ensure all tests pass, ask the user if questions arise.

---

- [ ] 14. Implement the background script — step resolution and flattening
  - [ ] 14.1 Create `packages/extension/src/background.js` — step flattener
    - `flattenSteps(testSteps, tasksMap, checkedIndexes)` → returns ordered array of resolved steps with task actions expanded inline
    - For each `task` action: recursively expand the task's steps, substituting `{{param}}` tokens from the invocation's params
    - Skip steps whose index is in the unchecked set
    - Resolve `$random` values to random alphanumeric strings (8 chars default)
    - Ensure no `{{...}}` or `$random` tokens remain in the output; log warning and substitute `""` for missing params
    - When building the `EXECUTE_STEP` message for a step with a target: attach the full `elementDescriptor` from `pageElements[target]`; if the descriptor has a `childOf` field, also resolve the parent entry from `pageElements` and attach it as `parentDescriptor`
    - _Requirements: 3.8, 4.1, 4.2, 4.3, 4.4, 5.1, 6.4_

  - [ ]* 14.2 Write property tests for step flattener
    - **Property 4: Template Parameter Resolution Completeness** — generate task definitions with params and `{{token}}` values; verify no unresolved tokens in output
    - **Property 7: Step Flattening Preserves Order and Count** — generate nested task structures; verify output order and step count
    - **Property 8: Skipped Steps Are Never Executed** — generate step lists with random unchecked subsets; verify executed list equals checked steps only
    - `// Feature: tomation, Property 4, 7, 8`
    - _Requirements: 4.1–4.4, 5.1, 6.4_

---

- [ ] 15. Implement the background script — test run orchestration
  - [ ] 15.1 Implement run state machine in `background.js`
    - Initialize run state: `{ running, paused, stopRequested, lockedTabId, steps, stepIndex, passCount, failCount, pauseResolve }`
    - `startRun(tabId, test, spec, checkedSteps)`: flatten steps, lock tab, begin step loop
    - Step loop: while steps remain and not stopped, await `sendStepToRuntime(step)`; on ok:false halt with failure log; emit LOG per step
    - `lockTab(tabId)`: store tabId, call `api.tabs.update(tabId, { active: true })`
    - `unlockTab()`: clear lockedTabId; restore any tab listeners
    - On completion/failure/stop: unlock tab, emit `RUN_COMPLETE` or `RUN_STOPPED` with summary
    - _Requirements: 5.2, 5.3, 5.4, 5.5, 5.7, 5.11, 5.12_

  - [ ] 15.2 Implement pause/continue/stop controls in background
    - `pause()`: set `paused = true`; create a Promise and store its resolve function in `pauseResolve`; step loop awaits this promise before each step
    - `continue()`: if `pauseResolve` exists, call it and clear `pauseResolve`; set `paused = false`
    - `stop()`: set `stopRequested = true`; if paused, also call `continue()` to unblock; step loop checks `stopRequested` and exits
    - _Requirements: 5.8, 5.9, 5.10_

  - [ ] 15.3 Implement navigate step handling and cross-page continuity
    - When a `navigate` step is encountered: call `api.tabs.update(lockedTabId, { url })`, then await a Promise that resolves when `RUNTIME_READY` is received from that tab
    - Timeout after 10 seconds; if no RUNTIME_READY received, halt run with error
    - _Requirements: 3.9, 5.6_

  - [ ] 15.4 Implement manual step handling
    - When a `manual` step is encountered: emit `MANUAL_PAUSE` to panel with `description`
    - Await `CONTINUE` message from panel (same pause/resolve mechanism as pause control)
    - _Requirements: 3.13_

  - [ ] 15.5 Implement message router in background
    - Listen for `RUN_TEST`, `PAUSE`, `CONTINUE`, `STOP` from panel
    - Route to appropriate functions; send `STATE_SYNC` to panel on connection
    - Listen for `STEP_RESULT` and `RUNTIME_READY` from content scripts
    - _Requirements: 5.2, 5.8–5.10_

  - [ ]* 15.6 Write property/integration tests for background orchestration
    - **Property 5 (tab lock)**: For any test run outcome (pass, fail, stop), verify tab is unlocked after — mock `api.tabs.update` and verify call sequence
    - **Property 8 (LOG count)**: For any sequence of N steps, verify N LOG messages emitted
    - `// Feature: tomation, Property 5, 8`
    - _Requirements: 5.4, 5.5, 5.11_

- [ ] 16. Checkpoint — background orchestration tests pass
  - Ensure all tests pass, ask the user if questions arise.

---

- [ ] 17. Implement the panel UI — Home view
  - [ ] 17.1 Create `packages/extension/src/panel.html`
    - Scaffold four view containers (home, test-plan, run, error) toggled by CSS display
    - Include `panel.js` as a `<script>` tag
    - Basic CSS: sidebar-appropriate layout, project/test list styles, controller bar styles, manual banner styles, log styles
    - _Requirements: 8.1–8.6_

  - [ ] 17.2 Implement Home view in `panel.js`
    - On load: query active tab for hostname via `api.tabs.query`
    - Call `storage.getProject(hostname)`; if null, show create-project form; if found, render spec + test list
    - Render each spec's filename as a section header; beneath each, render test names as clickable items
    - Clicking a test name navigates to Test Plan view for that test
    - Show "Load Spec" file input button; on file select, parse JSON, run `validateSpec`, call `storage.addSpec`, re-render
    - Show `meta.url` warning banner if spec's URL host ≠ current tab hostname
    - Listen for `api.tabs.onActivated` and `api.tabs.onUpdated`; if no test running, sync to new hostname
    - _Requirements: 8.1–8.6_

  - [ ]* 17.3 Write property tests for home view rendering
    - **Property (project rendering)**: For any project with N specs and M total tests, verify render produces N spec sections and M test items
    - **Property (meta.url mismatch warning)**: For any spec with meta.url host ≠ current hostname, verify warning element is visible
    - `// Feature: tomation, Property (8.3, 8.6)`
    - _Requirements: 8.3, 8.6_

---

- [ ] 18. Implement the panel UI — Test Plan view
  - [ ] 18.1 Implement Test Plan view in `panel.js`
    - Show test name as heading; render all steps as a checklist
    - For `task` action steps, expand the task inline showing child steps indented (max 2 levels), with the task name as a non-interactive header and child steps as checkboxes
    - All checkboxes start checked
    - Unchecking a task's checkbox also unchecks all its child checkboxes
    - "Run" button collects the set of checked step indices and sends `RUN_TEST` message to background
    - _Requirements: 6.1–6.6_

  - [ ]* 18.2 Write property tests for Test Plan view logic
    - **Property 6.3 (all checked by default)**: For any test with N steps, initial checked state has all N checked
    - **Property 6.5 (task uncheck cascades)**: For any task with N children, unchecking task results in all N children unchecked
    - `// Feature: tomation, Property (6.3, 6.5)`
    - _Requirements: 6.3, 6.4, 6.5_

---

- [ ] 19. Implement the panel UI — Run view
  - [ ] 19.1 Implement Run view in `panel.js`
    - Switch to run view when `RUN_TEST` is sent
    - Display live scrolling log; each `LOG` message appended as a row with action, target, value (masked for typePassword), and pass/fail indicator
    - For task section headers, render a labeled group header row; child step logs are indented beneath it (max 2 levels, no expand/collapse)
    - Show controller bar with Pause, Continue (initially disabled), Stop buttons
    - Pause: send `PAUSE`, disable Pause button, enable Continue button
    - Continue: send `CONTINUE`, restore button states
    - Stop: send `STOP`, wait for `RUN_STOPPED` message before rendering summary
    - On `MANUAL_PAUSE`: show prominent banner with `description` text and a "Continue" button; clicking it sends `CONTINUE` and hides banner
    - On `RUN_COMPLETE` / `RUN_STOPPED`: render summary row with total/passed/failed counts; show "Back to Home" button
    - _Requirements: 7.1–7.9_

  - [ ]* 19.2 Write property tests for typePassword masking
    - **Property 10: TypePassword Value Masking** — generate arbitrary password strings; simulate LOG message with typePassword action; verify rendered value is `"****"` regardless of actual value
    - `// Feature: tomation, Property 10`
    - _Requirements: 3.3_

---

- [ ] 20. Implement the Options page
  - [ ] 20.1 Create `packages/extension/src/options.html` and `options.js`
    - Render all projects grouped by hostname using `storage.getAllProjects()`
    - Each project shows a rename button (inline text input on click) and a delete button (with confirmation prompt)
    - Each spec within a project shows a delete button (with confirmation prompt)
    - "Export All" button: calls `storage.exportAll()`, triggers JSON file download via `<a download>`
    - "Import" button: file input accepting JSON; calls `storage.importAll(data, conflictCallback)` where `conflictCallback` shows a modal dialog blocking until user selects merge or replace
    - _Requirements: 9.1–9.7_

- [ ] 21. Checkpoint — full extension UI wired together
  - Load the extension in Chrome (unpacked) and Firefox; verify sidebar opens, spec loads, test plan renders, run view executes against a playground page.
  - Ensure all tests pass, ask the user if questions arise.

---

- [ ] 22. Create playground scenarios
  - [ ] 22.1 Create `packages/extension/playground/login/` with `index.html` (simple login form) and `spec.json`
    - `spec.json` exercises: `type`, `typePassword`, `click`, `assertHasText`
    - _Requirements: 15.1, 15.2, 15.3_

  - [ ] 22.2 Create `packages/extension/playground/todo/` with `index.html` (todo list) and `spec.json`
    - `spec.json` exercises: `type`, `click`, `assertExists`, `assertNotExists`, `assertHasText`
    - _Requirements: 15.1, 15.2, 15.3_

  - [ ] 22.3 Create `packages/extension/playground/navigation/` with multiple HTML pages and `spec.json`
    - `spec.json` exercises: `navigate`, `wait`, `assertHasText`, `manual`
    - _Requirements: 15.1, 15.2, 15.3_

---

- [ ] 23. Final checkpoint — all tests pass
  - Run full test suite across compiler and extension logic packages.
  - Verify all three playground specs load and execute successfully against their respective HTML pages.
  - Ensure all tests pass, ask the user if questions arise.

---

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP iteration
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation throughout the build
- Property tests use fast-check with minimum 100 iterations per property
- Unit tests use Node's built-in `node:test` runner or Jest — no browser required for logic tests
- DOM-dependent runtime tests use jsdom for headless validation
- The extension uses ES5-compatible vanilla JS (no bundler, no modern syntax) — all scripts are plain `<script>` includes or content script injections

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1"] },
    { "wave": 2, "tasks": ["2", "4", "5"] },
    { "wave": 3, "tasks": ["3", "6"] },
    { "wave": 4, "tasks": ["7"] },
    { "wave": 5, "tasks": ["8"] },
    { "wave": 6, "tasks": ["9", "10"] },
    { "wave": 7, "tasks": ["11"] },
    { "wave": 8, "tasks": ["12"] },
    { "wave": 9, "tasks": ["13", "14"] },
    { "wave": 10, "tasks": ["15"] },
    { "wave": 11, "tasks": ["16", "17", "18", "19", "20"] },
    { "wave": 12, "tasks": ["21"] },
    { "wave": 13, "tasks": ["22"] },
    { "wave": 14, "tasks": ["23"] }
  ]
}
```
