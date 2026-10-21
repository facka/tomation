# Requirements Document

Component Object Model (COM) + Component-Aware Log Collapsing

## Introduction

Tomation lets authors build readable UI tests from a Page Object Model (POM): `.pom.ts` files export element locators and `Task(...)` bundles of reusable steps. Some UI widgets (a searchable select, a date picker, a modal) require a multi-step interaction to operate — for example, selecting a value means opening the control, typing a search query, and clicking the first result. This logic is often repeated across many instances of the same widget on a page, and across pages. A plain `Task` cannot cleanly express this because its element locators are fixed, so each instance needs a near-duplicate task.

This feature adds a **Component Object Model (COM)**: a reusable, root-scoped UI component abstraction. A Component is defined once in a dedicated `*.com.ts` file via a factory that receives a root placeholder (`el`), destructured as `Component(({ el }) => { ... })`. Its internal locators use the ordinary element DSL (`is.TAG.where(...).as(...)`) and opt into root-scoping per locator by chaining the existing `.childOf(el)` against that root placeholder; a locator that does not chain `.childOf(el)` resolves against the document exactly as an ordinary POM element does today (covering widgets whose overlay or list renders outside the root subtree, such as a portal). The Component exposes `Task`-like actions over those locators. It is instantiated by passing an explicit root element with `.in(root)`, so the same Component can appear many times on one page without root-scoped locator collisions. Components compile down to the existing task-step representation, so the Runtime, data-token resolution, and the run log reuse the existing machinery; the only new data is a marker identifying a step group as component-originated.

The feature also improves the Panel. Because a Component's internal steps are implementation detail rather than test intent, the Panel **collapses component step groups by default** in both the Test Plan preview and the live run log. Users can expand them. While a component group runs, the live run log shows the current step beneath the component header; on success the collapsed group shows only its header; on failure it auto-expands to reveal the failing step. Only component-originated groups collapse — plain POM tasks render exactly as they do today. Collapsing is purely presentational: the Runtime still executes and emits every internal step, and in-page element highlighting is unchanged.

## Glossary

- **DSL**: The TypeScript-first authoring surface for Tomation tests, automations, tasks, data, and components.
- **Compiler**: The build-time tool (`packages/compiler`) that parses DSL files, strips TypeScript types, and emits a portable JSON spec.
- **Runtime**: The browser-extension execution engine (`packages/extension/src/background.js`, `runtime.js`) that runs the compiled spec, resolves locators and data, and drives the page.
- **Panel**: The Vue 3 side-panel UI that renders the Test Plan view and the Run view/log.
- **POM**: Page Object Model — a `.pom.ts` file exporting element locators and `Task` definitions scoped to a page.
- **Task**: A named, parameterized bundle of steps defined via `Task(fn).as(label)`; compiles to a single `{ action: 'task', name, params }` step.
- **Component**: A reusable UI abstraction defined in a `*.com.ts` file via a factory `Component(({ el }) => { ... })` that receives a Root_Placeholder, holding internal locators (optionally root-scoped via `.childOf(el)`) and `Task`-like actions.
- **Component_File**: A `*.com.ts` file in the configured `components` directory that defines one or more Components through the `Component(({ el }) => { ... })` factory.
- **Component_Instance**: A Component bound to a specific root element via `.in(root)`, resolving the Root_Placeholder to that Root_Element for its root-scoped internal locators.
- **Root_Placeholder**: The deferred root token (`el`) passed into the Component factory (`Component(({ el }) => { ... })`); a stand-in for the Root_Element that is resolved per Component_Instance when `.in(root)` is called, and that an internal locator targets by chaining `.childOf(el)`.
- **Root_Element**: The element descriptor passed to `.in(root)`; a Component_Instance resolves its root-scoped internal locators (those that chained `.childOf(el)`) within this element's subtree.
- **Component_Action**: A `Task`-like action exposed by a Component (e.g. `choose(query)`), invoked on a Component_Instance.
- **Scope_Root**: The compiled per-instance root reference (field `scopeRoot`) produced WHEN an internal locator chains `.childOf(el)` against the Root_Placeholder; resolved to the Component_Instance's Root_Element at `.in(root)` time and kept distinct from a static same-file `childOf` that references a concrete element by id or key. It is present ONLY on locators that opted in via `.childOf(el)`, not on every internal locator.
- **Component_Marker**: The annotation (`isComponent` + `componentName`) stamped on a flattened Component_Action and carried on each `taskPath` node, used by the Panel to identify collapsible component groups.
- **Task_Path**: The ancestry array the Runtime attaches to each expanded step (`{ name, label, params, isComponent?, componentName? }`), used by the Panel to group steps under headers.
- **Test_Plan_View**: The Panel view that lists tests and their steps before a run.
- **Run_Log**: The Panel view that shows step-by-step execution results of a run.
- **Component_Group**: The set of log/preview rows whose Task_Path includes a Component_Marker node — the unit that collapses.
- **Warn_And_Skip**: The Compiler convention of recording a `{ message, filePath, line }` warning, applying a best-effort resolution, emitting output, and continuing (no fatal error).

## Requirements

### Requirement 1: Define a Component in a `*.com.ts` file

**User Story:** As a test author, I want to define a reusable UI component in a dedicated component file, so that multi-step widget interactions live in one place and can be reused across pages.

#### Acceptance Criteria

1. THE Compiler SHALL resolve Component_Files from a `components` directory configured by a `components` field in `tomation.config.ts`, alongside the existing `pom`, `tests`, `automations`, and `data` fields.
2. WHEN the Compiler parses a Component_File that defines a Component via a `Component(({ el }) => { ... })` factory receiving a Root_Placeholder, with internal locators declared using the ordinary element DSL (`is.TAG.where(...).as(...)`, optionally chaining `.childOf(el)`) and one or more Component_Actions, THE Compiler SHALL produce a Component definition capturing those internal locators, their opt-in root-scoping, and action step bundles.
3. WHERE a Component_Action references the Component's internal locators, THE Compiler SHALL allow it to contain the same step kinds a `Task` allows (e.g. `Click`, `Type`, `Select`, assertions).
4. WHERE a `components` directory is not configured or contains no Component_Files, THE Compiler SHALL compile the project exactly as it does today with no Component definitions.

### Requirement 2: Instantiate a Component with an explicit root via `.in(root)`

**User Story:** As a test author, I want to bind a component to a specific root element with `.in(root)`, so that the same component can be used for many widgets on one page without their internal elements colliding.

#### Acceptance Criteria

1. WHEN an author writes `const <inst> = <Component>.in(<rootElement>)`, THE Compiler SHALL create a Component_Instance whose root-scoped internal locators resolve within the Root_Element.
2. WHERE a Component_Instance's internal locator chained `.childOf(el)` against the Root_Placeholder, THE Compiler SHALL resolve that `childOf` to the Component_Instance's Root_Element as a per-instance Scope_Root (`scopeRoot`) reference, kept distinct from a static id/element `childOf` reference.
3. WHERE a Component_Instance's internal locator did NOT chain `.childOf(el)`, THE Compiler SHALL emit that locator unchanged as document-scoped with no Scope_Root.
4. WHEN two or more Component_Instances of the same Component are bound to different Root_Elements in the same file, THE Compiler SHALL emit independent Scope_Root references for their `.childOf(el)` locators so that each instance resolves its root-scoped internals under its own root with no collision.
5. IF `.in()` is called with no argument or with an argument that is not an element descriptor, THEN THE Compiler SHALL apply Warn_And_Skip: record a warning identifying the file and line, fall back to document-scoped resolution, and continue.

### Requirement 3: Invoke Component Actions in tests and automations

**User Story:** As a test author, I want to call a component's action in my test, so that I can perform the whole multi-step interaction with a single readable call.

#### Acceptance Criteria

1. WHEN a test or automation invokes a Component_Action on a Component_Instance (e.g. `country.choose('Argentina')`), THE Compiler SHALL emit a step shaped like a task invocation (`{ action: 'task', name, params }`).
2. THE Compiler SHALL annotate the emitted Component_Action step with a Component_Marker consisting of `isComponent: true` and the `componentName`.
3. WHERE a Component_Action argument references inline or shared data (a `{{data.*}}` token) or context (`{{ctx.*}}`), THE Compiler SHALL carry the token into the emitted step's params unchanged, as it does for ordinary Task params.
4. IF a test invokes an action on an unknown Component or an unknown Component_Action, THEN THE Compiler SHALL apply Warn_And_Skip: record a warning identifying the file and line, skip the action, and continue.

### Requirement 4: Root-relative locator resolution at run time

**User Story:** As a test author, I want a component's internal elements to be found inside the bound root element, so that multiple instances of the same component on a page do not interfere with each other.

#### Acceptance Criteria

1. WHEN the Runtime resolves an internal Component locator that carries a Scope_Root, THE Runtime SHALL restrict the search to the subtree of the resolved Root_Element by reusing the existing `childOf`-bounded subtree search.
2. WHEN the Runtime resolves an internal locator that carries a Scope_Root, THE Runtime SHALL NOT match an element outside the Root_Element subtree.
3. WHERE a Scope_Root-bounded locator matches an element inside the Root_Element subtree, THE Runtime SHALL resolve and act on that element using the existing locator semantics.
4. WHEN the Runtime resolves an internal locator that carries no Scope_Root, THE Runtime SHALL resolve the locator against the document root using the existing ordinary-locator semantics.
5. IF the Root_Element cannot be resolved at run time, THEN THE Runtime SHALL surface the failure immediately through the existing locator-not-found path for the affected step, without any retry or wait-for-element behavior.

### Requirement 5: Compile Components to the existing task representation

**User Story:** As a maintainer, I want components to reuse the task execution path, so that the runtime, data resolution, and highlighting need no new execution model.

#### Acceptance Criteria

1. THE Compiler SHALL represent a Component_Action as a task-shaped entry so that the Runtime's existing task-expansion path expands it into its child steps.
2. WHEN the Runtime expands a Component_Action step, THE Runtime SHALL carry the Component_Marker onto each child step's Task_Path node (`{ name, label, params, isComponent, componentName }`).
3. THE Runtime SHALL resolve Component_Action params using the existing value-resolution path so that data and context tokens resolve identically to ordinary Task params.
4. THE Runtime SHALL preserve the existing step execution order and the existing in-page element highlighting when running Component_Actions.

### Requirement 6: Collapse component step groups in the Panel

**User Story:** As a test author, I want component internals collapsed by default, so that the log and plan show test intent rather than widget implementation detail.

#### Acceptance Criteria

1. WHEN the Panel renders a step group whose Task_Path node carries a Component_Marker, THE Panel SHALL render it as a collapsible Component_Group that is collapsed by default, in both the Test_Plan_View and the Run_Log.
2. WHEN the Panel renders a step group that does NOT carry a Component_Marker, THE Panel SHALL render it exactly as it does today (not collapsed).
3. WHEN a user activates a collapsed Component_Group, THE Panel SHALL expand it to reveal its child steps.
4. WHEN a user collapses an expanded Component_Group, THE Panel SHALL hide its child steps and show only the Component_Group header.

### Requirement 7: Run-log behavior while a Component runs, succeeds, or fails

**User Story:** As a test author watching a run, I want a collapsed component to still show live progress and to reveal details when something goes wrong, so that I keep context without losing diagnosability.

#### Acceptance Criteria

1. WHILE a Component_Group is actively running and collapsed in the Run_Log, THE Panel SHALL display the current step beneath the Component_Group header.
2. WHEN a collapsed Component_Group completes successfully in the Run_Log, THE Panel SHALL display only the Component_Group header with a success status and SHALL NOT display a leftover current-step line.
3. WHEN any child step of a Component_Group fails, THE Panel SHALL auto-expand the Component_Group to reveal the failing step.
4. WHERE Component_Groups are nested and an inner step fails, THE Panel SHALL auto-expand the chain of enclosing Component_Groups down to the failing step.
5. THE Panel SHALL keep the in-page element highlighting behavior unchanged at all times, independent of a Component_Group's collapsed or expanded state and of whether that state changes.

### Requirement 8: Backward compatibility

**User Story:** As an existing Tomation user, I want projects without components to behave exactly as before, so that adopting this feature is risk-free.

#### Acceptance Criteria

1. WHEN the Compiler compiles a project that defines no Components, THE Compiler SHALL produce output byte-identical to the output it produced before this feature.
2. THE Compiler SHALL continue to compile existing POM `Task` definitions, tests, automations, and the inline/shared data flow with no change in behavior.
3. WHEN the Panel renders a run or plan that contains no Component_Markers, THE Panel SHALL render exactly as it does today.
4. THE feature SHALL NOT change how plain POM `Task` step groups are displayed (they remain non-collapsible).

### Requirement 9: Diagnostics follow Warn_And_Skip

**User Story:** As a test author, I want component problems to warn rather than break my build, so that a single mistake does not block compiling the rest of my suite.

#### Acceptance Criteria

1. WHERE a Component problem is detected at compile time (missing root, non-element root, unknown internal locator, unknown Component or action), THE Compiler SHALL apply Warn_And_Skip and SHALL NOT fail compilation.
2. WHEN the Compiler records a Component warning, THE Compiler SHALL include a message, the file path, and the line.
3. WHERE the Compiler applies Warn_And_Skip for a Component problem, THE Compiler SHALL emit best-effort output (e.g. fall back to document-scoped resolution, or skip the offending action) as part of that Warn_And_Skip handling so the author can see and correct it, and SHALL NOT emit best-effort output for a Component problem outside Warn_And_Skip handling.

### Requirement 10: Documentation and example

**User Story:** As a new user, I want component usage documented and demonstrated, so that I can learn the pattern from a working example.

#### Acceptance Criteria

1. THE documentation SHALL describe defining a Component in a `*.com.ts` file, instantiating it with `.in(root)`, root-relative locators, invoking Component_Actions, and the component log-collapsing behavior, in both `examples/playground/docs.html` and `tomation-ai.md`.
2. THE playground SHALL include an example Component (e.g. a searchable select) reused across multiple form fields, wired into `examples/playground-tests` and compiled with a single-shot `npm run compile:playground`.
