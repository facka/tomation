# Requirements Document

## Introduction

Tomation is a browser extension (Chrome, Firefox, Edge) that enables users to run automated browser scripts from a sidebar panel. Scripts are authored in a readable JS-like DSL, compiled to a JSON spec format by a separate Node.js CLI (`@tomation/compiler`), and executed by the extension's runtime against the live DOM. The system serves three use cases: regression testing, task automation, and manual+automated hybrid testing. The project is organized as an npm monorepo with three packages: `@tomation/dsl`, `@tomation/compiler`, and the browser extension.

## Glossary

- **Spec / spec.json**: A compiled JSON file conforming to the tomation-spec format, containing pageElements, tasks, and tests.
- **DSL**: The JS-like domain-specific language used to author POMs and test files, compiled to spec.json by the CLI.
- **POM (Page Object Model)**: A DSL file describing a page's named elements and reusable tasks, using the `Page()` constructor.
- **pageElements**: A flat map of named element descriptors inside a spec, used by the runtime to locate DOM nodes.
- **Task**: A reusable named sequence of steps that may accept parameters, defined in the spec's `tasks` map.
- **Test**: A named, top-level executable sequence of steps (which may invoke tasks), defined in the spec's `tests` array.
- **Step**: A single executable instruction within a task or test, described as a JSON object with an `action` field.
- **Action**: The type of operation a step performs (e.g., `click`, `type`, `assertHasText`).
- **Project**: A collection of loaded specs associated with a browser hostname, persisted in `browser.storage.local`.
- **Background**: The extension's service worker (`background.js`) that orchestrates all test execution state.
- **Runtime / content script**: The `runtime.js` content script injected into the active tab that performs DOM operations for each step.
- **Panel / Sidebar**: The sidebar UI (`panel.html` / `panel.js`) through which users interact with the extension.
- **Tab lock**: The mechanism by which the background prevents the active tab from changing during a test run.
- **Where matcher**: A set of key-value conditions used to locate a DOM element (e.g., `{ "id": "username-input" }`).
- **childOf**: An optional field on a `pageElements` entry that references another element key by its `id` matcher value. When present, the runtime restricts its DOM search to descendants of the referenced parent element.
- **$random**: A special value token that the background resolves to a random string before execution.
- **{{param}}**: A template placeholder in a step's value field resolved by the background using the task invocation's params.
- **Compiler**: The `@tomation/compiler` Node.js CLI package that resolves, parses, flattens, deduplicates, and emits spec.json.
- **Watch mode**: The compiler's continuous rebuild mode that re-emits spec.json on file changes.
- **WebExtensions API**: The cross-browser extension API used exclusively; shim applied as `const api = typeof browser !== 'undefined' ? browser : chrome`.
- **sidePanel**: Chrome/Edge's persistent sidebar surface; Firefox/Safari fall back to a popup (`browser_action`).
- **Options page**: A dedicated extension page for managing projects and specs across all hostnames.

---

## Requirements

### Requirement 1: JSON Spec Format

**User Story:** As an automation author, I want a well-defined JSON spec format, so that my compiled scripts can be reliably loaded and interpreted by the extension runtime.

#### Acceptance Criteria

1. THE Spec_Loader SHALL accept only JSON documents where `format` equals `"tomation-spec"` and `version` equals `1`.
2. THE Spec_Loader SHALL reject any JSON document missing the `format`, `version`, `pageElements`, `tasks`, or `tests` fields and return a descriptive parse error.
3. WHEN a spec is loaded, THE Spec_Loader SHALL validate that every `target` field in every step references a key present in `pageElements`.
4. WHEN a spec is loaded, THE Spec_Loader SHALL validate that every `task` action's `name` field references a key present in `tasks`.
5. THE Spec_Loader SHALL parse the `meta` object and expose `name`, `url`, and `description` fields to the UI.
6. THE Spec_Loader SHALL accept only `pageElements` entries that have both a `tag` field and a `where` sub-object containing at least one matcher key; entries missing either SHALL be rejected with a descriptive error.
6a. A `pageElements` entry MAY include a `childOf` field whose value is the `id` matcher value of another element defined in `pageElements`; WHEN present, THE Spec_Loader SHALL validate that the referenced `id` value corresponds to an existing entry in `pageElements` that itself has `where.id` defined, and SHALL reject the spec with a descriptive error if no such entry exists.
7. THE Spec_Loader SHALL accept a `tasks` map where each entry has a `steps` array and an optional `params` array of strings.
8. THE Spec_Loader SHALL accept a `tests` array where structural validity is defined by each entry having a `name` string field and a `steps` array field; entries missing either SHALL be rejected with a descriptive error.

---

### Requirement 2: Where Matcher and Element Finding

**User Story:** As an automation author, I want flexible element descriptors, so that the runtime can reliably locate DOM elements across different page structures.

#### Acceptance Criteria

1. WHEN locating an element, THE Runtime SHALL evaluate all matcher keys in the `where` object as AND conditions.
2. THE Runtime SHALL support the following matcher keys: `id`, `textIs`, `textContains`, `classIncludes`, `placeholder`, `name`, `type`.
2a. WHEN an element descriptor includes a `childOf` field, THE Runtime SHALL first locate the parent element using the full element descriptor for the referenced parent (resolved by the background before sending the step), then restrict the target element search to DOM descendants of that parent node; IF the parent element is not found within the polling timeout, THE Runtime SHALL return `{ ok: false, error: "Parent element not found: <childOf id value>" }`.
3. WHEN an element is not immediately present in the DOM, THE Runtime SHALL poll using `requestAnimationFrame` for up to 5 seconds before reporting a timeout failure.
4. IF an element is not found within the 5-second polling window, THEN THE Runtime SHALL return `{ ok: false, error: "Element not found: <target key>" }` to the background.
4a. WHEN an element is successfully located, THE Runtime SHALL return a success confirmation to the background before executing the step action.
5. WHEN an element is found and a step is about to execute, THE Runtime SHALL add the attribute `data-tomation-active` to that element for visual highlighting.
6. WHEN a step completes (regardless of outcome), THE Runtime SHALL remove the `data-tomation-active` attribute from the element.

---

### Requirement 3: Supported Actions

**User Story:** As an automation author, I want a complete set of browser interaction actions, so that I can cover all typical web application interaction patterns.

#### Acceptance Criteria

1. WHEN a step has `"action": "click"`, THE Runtime SHALL dispatch a click event on the resolved target element.
2. WHEN a step has `"action": "type"`, THE Runtime SHALL set the target element's value and dispatch input and change events using the resolved `value` field.
3. WHEN a step has `"action": "typePassword"`, THE Runtime SHALL behave identically to `type` but THE Panel SHALL mask the value with `"****"` in all log output.
4. WHEN a step has `"action": "select"`, THE Runtime SHALL set the target `<select>` element's value to the resolved `value` field and dispatch a change event.
5. WHEN a step has `"action": "assertExists"`, THE Runtime SHALL return `{ ok: false }` if the target element is not found within the polling timeout.
6. WHEN a step has `"action": "assertNotExists"`, THE Runtime SHALL return `{ ok: false }` if the target element IS found within the polling timeout.
7. WHEN a step has `"action": "assertHasText"`, THE Runtime SHALL return `{ ok: false }` if the target element's visible text does not contain the resolved `value` string.
8. WHEN a step has `"action": "task"`, THE Background SHALL expand the referenced task's steps inline, applying the provided `params` map for template resolution, before sending individual steps to the Runtime.
9. WHEN a step has `"action": "navigate"`, THE Background SHALL instruct the tab to navigate to the `url` field value, then wait for a `RUNTIME_READY` message from the newly loaded content script before proceeding.
10. WHEN a step has `"action": "wait"`, THE Background SHALL pause execution for the number of milliseconds specified in the `ms` field before sending the next step.
11. WHEN a step has `"action": "waitFor"` and `gone` is `false`, THE Runtime SHALL poll until the target element appears or the 5-second timeout elapses.
12. WHEN a step has `"action": "waitFor"` and `gone` is `true`, THE Runtime SHALL poll until the target element is absent from the DOM or the 5-second timeout elapses.
13. WHEN a step has `"action": "manual"`, THE Background SHALL emit a `MANUAL_PAUSE` message to the panel, displaying the `description` field, and SHALL halt step execution until the panel sends a `CONTINUE` message.

---

### Requirement 4: Parameter and Value Resolution

**User Story:** As an automation author, I want template parameters and random values resolved before execution, so that my tests can use dynamic data without modifying the spec.

#### Acceptance Criteria

1. WHEN the Background flattens a `task` step, THE Background SHALL replace every `{{paramName}}` occurrence in step `value` fields with the corresponding value from the task invocation's `params` object.
2. WHEN a step's `value` field equals `"$random"`, THE Background SHALL replace it with a randomly generated alphanumeric string before sending the step to the Runtime.
3. THE Background SHALL perform all template and `$random` resolution before sending a step to the Runtime — the Runtime SHALL never receive unresolved placeholder tokens.
4. IF a `{{paramName}}` token has no corresponding key in the task invocation's `params`, THEN THE Background SHALL log a warning and substitute an empty string.

---

### Requirement 5: Test Execution Engine

**User Story:** As a tester, I want the background to orchestrate test execution reliably, so that tests run correctly across page navigations and tab changes.

#### Acceptance Criteria

1. WHEN a test run begins, THE Background SHALL flatten all task references into a single ordered list of executable steps.
2. THE Background SHALL send one step at a time to the Runtime, waiting for the step's response before sending the next step.
3. WHEN the Runtime returns `{ ok: false, error: "..." }`, THE Background SHALL halt the test run, emit a failure log entry, and unlock the active tab.
4. WHEN a test run begins, THE Background SHALL lock the active tab by storing its `tabId` and calling `api.tabs.update(lockedTabId, { active: true })` to prevent tab switching.
5. WHEN a test run ends (completion, failure, or stop), THE Background SHALL release the tab lock.
6. WHILE a test is running and the `navigate` action executes, THE Background SHALL wait for a `RUNTIME_READY` message from the content script before proceeding to the next step.
7. THE Background SHALL maintain all test execution state — no state SHALL be stored in the content script or panel between steps.
8. WHEN the user clicks Stop during a run, THE Background SHALL abort the current step sequence and unlock the tab after the in-flight step completes or times out.
9. WHEN the user clicks Pause during a run, THE Background SHALL suspend step dispatch until the user clicks Continue.
10. WHEN the user clicks Continue after a Pause, THE Background SHALL resume sending steps from where execution was paused.
11. THE Background SHALL emit a `LOG` message to the panel after each step completes, including the step description, action, target, and result status.
12. THE Background SHALL emit a final summary `LOG` message on test completion or stop, indicating total steps, passed steps, and failed steps.

---

### Requirement 6: Test Plan View and Step Selection

**User Story:** As a tester, I want to review and selectively disable steps before running a test, so that I can skip known-failing or irrelevant steps during a session.

#### Acceptance Criteria

1. WHEN a user selects a test from the Home view, THE Panel SHALL display the Test Plan view showing all steps for that test as a checklist.
2. WHEN a test step is a `task` action, THE Panel SHALL expand the task inline showing its child steps with checkboxes, indented one level beneath the task header (maximum 2 levels of nesting).
3. THE Panel SHALL render all steps as checked by default when the Test Plan view is first shown.
4. WHEN the user unchecks a step, THE Panel SHALL mark that step as skipped and THE Background SHALL omit it from the execution sequence.
5. WHEN the user unchecks a `task` step, THE Panel SHALL uncheck all of that task's child steps simultaneously.
6. THE Panel SHALL display a Run button that initiates execution of the remaining checked steps.

---

### Requirement 7: Run View and Live Logging

**User Story:** As a tester, I want to see a live log of test execution with clear status indicators, so that I can monitor progress and diagnose failures.

#### Acceptance Criteria

1. WHEN a test run begins, THE Panel SHALL switch to the Run view displaying a live scrolling log.
2. THE Panel SHALL display each log entry with the step's action, target (if applicable), resolved value (masked for `typePassword`), and a pass/fail status indicator.
3. WHEN a `task` step is executing, THE Panel SHALL display a section header for the task name followed by indented log entries for its child steps (maximum 2 levels, no expand/collapse).
4. THE Panel SHALL display a controller bar with Pause, Continue, and Stop buttons during a test run.
5. WHEN the Pause button is clicked, THE Panel SHALL send a `PAUSE` message to the background and visually disable the Pause button while enabling the Continue button.
6. WHEN the Continue button is clicked, THE Panel SHALL send a `CONTINUE` message to the background and restore the normal running state.
7. WHEN the Stop button is clicked, THE Panel SHALL send a `STOP` message to the background and wait for the background to confirm stop before displaying the summary.
8. WHEN a `manual` step is active, THE Panel SHALL display a prominent banner with the step's `description` text and a Continue button.
9. WHEN the manual Continue button is clicked, THE Panel SHALL send a `CONTINUE` message to the background to resume execution.

---

### Requirement 8: Home View and Project Management

**User Story:** As a user, I want the sidebar to automatically show my project for the current tab, so that I can quickly access and run tests for the site I'm browsing.

#### Acceptance Criteria

1. WHEN the extension sidebar opens, THE Panel SHALL detect the hostname of the currently active tab and, if a project exists for that hostname, load it from `browser.storage.local`; if no project exists, THE Panel SHALL skip the loading action.
2. WHEN the sidebar opens and no project exists for the current tab's hostname, THE Panel SHALL immediately display an option to create a new project for that hostname.
3. WHEN a project exists, THE Panel SHALL display a list of all loaded specs with their filenames, and beneath each spec a list of test names.
4. THE Panel SHALL provide a "Load Spec" control that accepts a `.json` file upload and stores the parsed spec under the current hostname project.
5. WHEN a tab change occurs and no test is running, THE Panel SHALL sync to the new tab's hostname and update the displayed project accordingly.
6. WHEN the loaded spec's `meta.url` host does not match the current tab's hostname, THE Panel SHALL display a prominent warning to the user.

---

### Requirement 9: Options Page

**User Story:** As a user, I want a dedicated options page to manage all my projects and specs, so that I can keep my automation library organized.

#### Acceptance Criteria

1. THE Options_Page SHALL display a list of all projects organized by hostname.
2. THE Options_Page SHALL allow the user to rename any project.
3. THE Options_Page SHALL allow the user to delete any project, with a confirmation prompt.
4. THE Options_Page SHALL allow the user to delete any individual spec from a project, with a confirmation prompt.
5. THE Options_Page SHALL provide an export function that downloads all projects as a single JSON file.
6. THE Options_Page SHALL provide an import function that accepts a previously exported JSON file and merges the projects into storage.
7. WHEN an imported project's hostname already exists, THE Options_Page SHALL display a modal dialog offering the user a choice to merge specs or replace the existing project; THE Options_Page SHALL keep the dialog open and block the import until the user makes a choice.

---

### Requirement 10: Project Storage Model

**User Story:** As a user, I want my projects and specs to persist across browser sessions, so that I don't have to reload my specs every time I open the browser.

#### Acceptance Criteria

1. THE Storage_Manager SHALL persist all project data in `browser.storage.local` keyed by hostname.
2. THE Storage_Manager SHALL store each project as an object with `host`, `name`, `specs`, and `lastUsed` fields.
3. THE Storage_Manager SHALL store each spec entry with a `uuid-v4` `id`, `filename`, `loadedAt` ISO timestamp, and the full parsed `spec` object.
4. WHEN a spec is loaded into a project, THE Storage_Manager SHALL assign a new UUID to it and record the load timestamp.
5. WHEN a spec with the same `filename` already exists in a project, THE Storage_Manager SHALL replace the existing entry keeping its original UUID, and SHALL update the `loadedAt` timestamp; if the timestamp update fails, THE Storage_Manager SHALL still complete the entry replacement.

---

### Requirement 11: Cross-Browser Compatibility

**User Story:** As a user on any major browser, I want the extension to work correctly, so that I can use it regardless of my browser preference.

#### Acceptance Criteria

1. THE Extension SHALL use the shim `const api = typeof browser !== 'undefined' ? browser : chrome` for all WebExtensions API calls.
2. THE Extension SHALL use `sidePanel` for Chrome and Edge, and fall back to `browser_action` popup for Firefox and Safari.
3. THE manifest.json SHALL declare both `side_panel` (Chrome/Edge) and `browser_action` (Firefox) configurations.
4. THE Extension SHALL use only ES5-compatible vanilla JavaScript with no modern features, no build tools, no bundlers, and no npm packages at runtime.
5. THE Extension SHALL never use `eval` or `new Function` in any content script or background script.
6. THE Extension SHALL use only the WebExtensions API for all cross-browser messaging, storage, and tab management.

---

### Requirement 12: Compiler — CLI and Configuration

**User Story:** As an automation author, I want a CLI tool to compile my DSL files into a spec.json, so that I can use a familiar JS-like syntax and benefit from module imports.

#### Acceptance Criteria

1. THE Compiler SHALL provide a `compile` command that reads input files and emits a single `spec.json` output file.
2. THE Compiler SHALL provide a `watch` command that monitors source files for changes and re-emits `spec.json` on each change.
3. THE Compiler SHALL provide a `check` command that validates DSL files and reports errors without emitting output.
4. WHEN a `tomation.config.js` file is present in the working directory, THE Compiler SHALL read `pom` and `tests` directory paths from it and automatically discover all `.pom.js` and `.test.js` files; IF no `tomation.config.js` is found, THE Compiler SHALL fail immediately with a descriptive error.
5. THE Compiler SHALL report all errors with the source file path and line number.

---

### Requirement 13: Compiler — DSL Parsing and POM Structure

**User Story:** As an automation author, I want to write structured page object models in JS syntax, so that my automation code is readable and maintainable.

#### Acceptance Criteria

1. THE Parser SHALL recognize the `Page(name, { elements, tasks })` constructor call as a POM definition.
2. THE Parser SHALL namespace each element key as `<PageName>__<key>` in the output `pageElements` map.
3. THE Parser SHALL namespace each task key as `<PageName>__<key>` in the output `tasks` map.
4. THE Parser SHALL resolve named imports between POM and test files using a topological dependency sort.
5. WHEN a circular import is detected, THE Resolver SHALL report the circular import error first with the full cycle path including file paths and SHALL stop processing; duplicate key errors SHALL only be reported after all imports are resolved without cycles.
6. THE Flattener SHALL merge all resolved POM and test definitions into a single spec.json output.
7. THE Deduplicator SHALL detect duplicate element or task keys across POMs and report a clear conflict error including the conflicting file paths.

---

### Requirement 14: DSL Package

**User Story:** As an automation author, I want TypeScript type definitions for the DSL, so that I get editor auto-complete and type safety when writing POM and test files.

#### Acceptance Criteria

1. THE DSL_Package SHALL export `Page`, `Task`, and `el` as runtime stubs in `index.js`.
2. THE DSL_Package SHALL provide `index.d.ts` with TypeScript interface definitions for `Page`, `Task`, `el`, and all supported action types.
3. THE DSL_Package SHALL provide `globals.d.ts` with ambient declarations for all action globals used in test files (e.g., `click`, `type`, `navigate`).

---

### Requirement 15: Playground

**User Story:** As a new user or developer, I want pre-built playground scenarios to explore the extension's capabilities, so that I can learn the tool without setting up a project first.

#### Acceptance Criteria

1. THE Extension SHALL include at least three playground scenarios: `login`, `todo`, and `navigation`.
2. EACH playground scenario SHALL include a pre-compiled `spec.json` that can be directly loaded into the extension.
3. THE playground specs SHALL exercise a representative set of supported actions, including `type`, `click`, `assertHasText`, and `navigate`.
