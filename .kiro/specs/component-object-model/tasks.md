# Implementation Plan: Component Object Model (COM) + Component-Aware Log Collapsing

## Overview

This feature adds two things in one spec, across two milestones, by reusing the existing task pipeline end to end. The guiding commitment is that **components compile down to the existing task-step representation and expand through the existing runtime path** — the only genuinely new runtime data is a per-`taskPath`-node *component marker* (`isComponent` + `componentName`).

**Milestone B (COM — the foundation)** lands first because it produces the marker that everything else keys on. It touches the DSL (`packages/dsl/index.js`, `index.d.ts`, `globals.d.ts`) to add the `Component(({ el }) => ...)` factory, deferred `.childOf(el)` root-placeholder targeting, and `.in(root)` instantiation; the Compiler (`packages/compiler/src/parser.js`, `flattener.js`, `validator.js`) to parse the factory/instances/actions, emit a `scopeRoot` **only** on locators that chained `.childOf(el)`, and stamp the marker on the flattened task-shaped action; and the Runtime (`packages/extension/src/background.js` `expandTaskStep`, `packages/extension/src/runtime.js`) to carry the marker onto each child `taskPath` node and resolve `scopeRoot` locators via the existing `childOf`-bounded subtree search.

**Milestone A (component-aware log collapsing)** consumes the marker in the Panel (`panel-vue/src/types/{messages,store}.ts`, `store/index.ts`, `logic/stepLabel.ts`, `components/LogContainer.vue`, `TaskHeader.vue`, `LogEntry.vue`, `App.vue`, `TestPlanView.vue`, `RunView.vue`): component headers render collapsed-by-default, show the live current step while running, header-only on success, and auto-expand on failure, in both the Run Log and the Test Plan preview. Plain POM tasks render exactly as today.

The marker is the shared thread, so the ordering is: DSL primitive → compiler parse/flatten/validate (emits marker + `scopeRoot`) → runtime (propagates marker + resolves `scopeRoot`) → panel types/store (carry marker) → panel collapsing UI (consumes marker) → the 8 property tests → playground example + docs.

**Implementation language:** this is an existing codebase. Compiler and Runtime code is ES5 (`var`, function declarations, no arrow functions); DSL runtime is `index.js` (JS) with `index.d.ts` / `globals.d.ts` type definitions; the Panel is Vue 3 + TypeScript. Match each layer's existing style — no language choice is needed because the design names concrete files per layer.

**Verification (workspace rules):** the implementing agent MUST NOT run tests, `node --test`, `node -c`, watch modes, or dev servers. Test tasks CREATE tests; the user runs them manually. Build verification is single-shot only (`npm run compile:playground`).

## Tasks

- [x] 1. DSL primitive: `Component` factory, deferred `.childOf(el)`, and `.in(root)`
  - [x] 1.1 Add the `Component(({ el }) => ...)` factory and `.in(root)` to `packages/dsl/index.js`
    - Add a `Component(factoryFn)` export that invokes the factory with a destructurable `{ el }` Root_Placeholder (a tagged deferred token distinguishable from a concrete element descriptor), captures the returned internal locators and `Task`-like actions, and returns a component value exposing `.in(root)`
    - `.in(root)` returns a Component_Instance that binds the Root_Placeholder to the passed `root` element descriptor and exposes each Component_Action as an invokable that emits a task-shaped invocation tagged component-originated (so the compiler can stamp `isComponent` + `componentName`)
    - Extend the element DSL `.childOf()` so that when its argument is the Root_Placeholder `el`, the resulting descriptor is marked as deferred-root-scoped (to compile to `scopeRoot`) rather than a static same-file `childOf`; a locator that never chains `.childOf(el)` is left unchanged (document-scoped)
    - ES5 only (`var`, function declarations, no arrow functions)
    - _Requirements: 1.2, 2.1, 2.2, 2.3, 3.1, 3.2_

  - [x] 1.2 Add `Component`, `.in(root)`, and deferred `.childOf(el)` types to `packages/dsl/index.d.ts` and `packages/dsl/globals.d.ts`
    - Type `Component<T>(factory: (ctx: { el: RootPlaceholder }) => T): ComponentDefinition<T>` with `ComponentDefinition<T>.in(root: ElementDescriptor): ComponentInstance<T>` preserving the actions' callable signatures
    - Overload `.childOf()` to additionally accept the `RootPlaceholder` token; expose `Component` as a global in `globals.d.ts` alongside the existing primitives
    - _Requirements: 1.2, 2.1, 3.1_

  - [ ]* 1.3 Write unit tests for the DSL factory/instance shapes in `packages/dsl/index.test.js`
    - `Component(({ el }) => ...)` returns a definition with `.in(root)`; `.in(root)` exposes the actions; a locator chaining `.childOf(el)` is marked deferred-root-scoped while a locator without it is unchanged; an action invocation produces a component-tagged task-shaped value
    - _Requirements: 1.2, 2.1, 2.2, 2.3, 3.1, 3.2_

- [x] 2. Compiler parse: component factory, instances, and action invocations in `packages/compiler/src/parser.js`
  - [x] 2.1 Parse the `Component(({ el }) => { ... })` factory into a component definition
    - Detect the `Component(...)` call, read the destructured `{ el }` Root_Placeholder name, and walk the factory body to collect internal locators (via the existing element-chain walk) and `Task`-like Component_Actions (reusing the existing task step-extraction path so actions allow the same step kinds as `Task` — `Click`, `Type`, `Select`, assertions)
    - For each internal locator, distinguish a `.childOf(<el>)` chain that targets the Root_Placeholder (mark it deferred-root-scoped) from a static same-file `childOf` (by `where.id` or element key, left untouched) and from no `childOf` (document-scoped); ES5 only
    - _Requirements: 1.2, 1.3, 2.2, 2.3_

  - [x] 2.2 Parse `.in(root)` instantiation and component-action invocations
    - Parse `const <inst> = <Component>.in(<rootElement>)` into a Component_Instance binding the Root_Placeholder to the `<rootElement>` descriptor; parse `<inst>.<action>(<args>)` in test/automation bodies into an invocation carrying the component name, action name, and resolved args (reuse `extractTaskInvocationParams` so `{{data.*}}`/`{{ctx.*}}` tokens pass through unchanged)
    - When two or more instances of the same component bind different roots in one file, keep each instance's root binding independent so per-instance `scopeRoot` references do not collide
    - _Requirements: 2.1, 2.4, 3.1, 3.3_

  - [ ]* 2.3 Write unit tests for component parsing in `packages/compiler/src/parser.test.js`
    - Factory yields a definition with internal locators (opted-in vs document-scoped) and actions; `.in(root)` binds the root; `inst.action(arg)` parses to a component invocation; two instances bind distinct roots; a `{{data.*}}` arg survives into the invocation params
    - _Requirements: 1.2, 1.3, 2.1, 2.2, 2.3, 2.4, 3.1, 3.3_

- [x] 3. Compiler flatten: emit `scopeRoot` and the component marker in `packages/compiler/src/flattener.js`
  - [x] 3.1 Emit `scopeRoot` only on opted-in internal locators
    - When flattening a Component_Instance's internal locators into `pageElements`, emit a per-instance `scopeRoot` reference (resolved to that instance's Root_Element) ONLY on descriptors that chained `.childOf(el)`; emit locators that did not chain `.childOf(el)` unchanged and document-scoped (no `scopeRoot`)
    - Keep `scopeRoot` distinct from a static same-file `childOf` so existing static `childOf` emission is unaffected; emit independent `scopeRoot` references for multiple instances of the same component
    - _Requirements: 2.2, 2.3, 2.4, 4.1, 4.4_

  - [x] 3.2 Flatten a Component_Action into a task-shaped step carrying the marker
    - Represent each invoked Component_Action as a `{ action: 'task', name, params }` entry annotated with `isComponent: true` and `componentName`; attach `{{data.*}}` templates to the action's params by reusing `extractReferencedTemplateNames` exactly as for ordinary tasks
    - _Requirements: 3.1, 3.2, 3.3, 5.1_

  - [ ]* 3.3 Write unit tests for flatten output in `packages/compiler/src/flattener.test.js`
    - Opted-in locator carries `scopeRoot`, non-opted does not; two instances get independent `scopeRoot`s; the flattened action is task-shaped with `isComponent`/`componentName`; a data-token arg attaches its template keyed by Data_Name
    - _Requirements: 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 4.1, 4.4, 5.1_

- [x] 4. Compiler validate + Warn_And_Skip diagnostics in `packages/compiler/src/validator.js` and `packages/compiler/src/parser.js`
  - [x] 4.1 Validate component constructs with Warn_And_Skip, leaving static `childOf` validation unaffected
    - Validate that a `.childOf(el)` chain references the factory's Root_Placeholder and that `.in(root)` receives a real element descriptor (not a static HTML id); leave existing static same-file `childOf` target validation (by `where.id` or key) unchanged
    - On a component problem (missing root, non-element root, unknown internal locator, unknown component or action), apply Warn_And_Skip: push a single `{ message, filePath, line }` warning, apply the best-effort fallback (missing/non-element root → document-scoped resolution; unknown locator → emit the step anyway; unknown component/action → skip the action), continue, and NEVER fail compilation
    - Emit best-effort output ONLY as part of Warn_And_Skip handling (not for component problems outside that path)
    - _Requirements: 2.5, 3.4, 9.1, 9.2, 9.3_

  - [ ]* 4.2 Write unit tests for component validation/diagnostics in `packages/compiler/src/validator.test.js`
    - `.in()` with no/non-element arg warns once (file+line) and falls back to document-scoped; unknown internal locator warns and still emits the step; unknown component/action warns and skips; static `childOf` validation output unchanged; no component problem is fatal
    - _Requirements: 2.5, 3.4, 9.1, 9.2, 9.3_

- [ ] 5. Checkpoint — DSL + compiler layer
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Runtime: carry the marker on `taskPath` and resolve `scopeRoot` locators
  - [x] 6.1 Propagate the component marker onto each child `taskPath` node in `expandTaskStep` (`packages/extension/src/background.js`)
    - When `expandTaskStep` builds the `childPath` node (`{ name, label, params }`), also copy `isComponent` and `componentName` from the task-shaped step onto that node so every expanded child step's `taskPath` node carries the marker; it then rides through STEP_PLAN / STEP_STARTING unchanged
    - Preserve the existing step execution order and `resolveValue`-based param resolution (data/context tokens unchanged); ES5 only
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [x] 6.2 Resolve `scopeRoot` locators via the existing `childOf`-bounded subtree search in `packages/extension/src/runtime.js`
    - When a locator carries `scopeRoot`, resolve the instance Root_Element and reuse the existing `childOf`-bounded candidate collection to restrict matches to that root's subtree (never match outside it); a locator with no `scopeRoot` resolves against the document root via the existing ordinary-locator path
    - If the Root_Element cannot be resolved, surface the failure immediately through the existing locator-not-found path for that step, with NO retry or wait-for-element; keep in-page highlighting unchanged; ES5 only
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 5.4_

  - [ ]* 6.3 Write runtime tests for marker propagation and scoped resolution in `packages/extension/src/background.test.js` and `packages/extension/src/runtime.test.js`
    - Marker survives `expandTaskStep` onto every child `taskPath` node; two instances resolve within their own roots without collision; a `scopeRoot` locator does not match an element outside its root while a no-`scopeRoot` locator resolves document-wide; execution order and highlighting message shape unchanged; unresolvable root fails immediately with no retry
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 5.2, 5.3, 5.4_

- [ ] 7. Checkpoint — runtime layer
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Panel types + store: carry the marker through to render items
  - [x] 8.1 Extend the `taskPath` node type with the marker in `panel-vue/src/types/messages.ts` and `panel-vue/src/types/store.ts`
    - Extend the `taskPath` node shape from `{ name, label, params }` to `{ name, label, params, isComponent?: boolean, componentName?: string }` in both the message type (STEP_PLAN / STEP_STARTING) and the store `LogEntry.taskPath` type
    - _Requirements: 5.2, 6.1_

  - [x] 8.2 Preserve the marker when ingesting STEP messages in `panel-vue/src/store/index.ts`
    - Ensure the store action that records STEP_PLAN / STEP_STARTING into `LogEntry.taskPath` preserves `isComponent` / `componentName` on each node; no behavior change when the marker is absent
    - _Requirements: 5.2, 6.1, 8.3_

  - [ ]* 8.3 Write unit tests for store marker preservation in the panel store test file
    - A STEP message whose `taskPath` carries the marker produces a `LogEntry` whose `taskPath` node retains `isComponent`/`componentName`; a marker-free message yields marker-free nodes
    - _Requirements: 5.2, 6.1, 8.3_

- [x] 9. Panel UI: collapsible component groups in the Run Log and Test Plan
  - [x] 9.1 Mark component headers when building render items in `panel-vue/src/components/LogContainer.vue` (and `logic/stepLabel.ts` if header labels are built there)
    - In `renderItems`, tag a `task-header` whose `taskPath` node is `isComponent` with `isComponent` / `componentName`; leave non-component task headers unchanged (always expanded); carry collapse/expand state locally keyed by `pathKey`, initialized collapsed for component headers
    - _Requirements: 6.1, 6.2, 8.4_

  - [x] 9.2 Render collapse/expand with run-state behavior in `LogContainer.vue` and `panel-vue/src/components/TaskHeader.vue` / `LogEntry.vue`
    - Collapsed component header: clicking toggles expand/collapse (expand reveals child steps; collapse hides them, header only); while running + collapsed, show exactly one current-step line (the active child under that header's `pathKey`); on success + collapsed, show header only with pass status and no leftover current-step line
    - On any child failure, force-expand down to the failing child and keep expanded; for nested component groups, auto-expand the chain of enclosing component groups down to the failing step; keep in-page highlighting behavior unchanged regardless of collapse state
    - Plain (non-component) task headers render exactly as today
    - _Requirements: 6.3, 6.4, 7.1, 7.2, 7.3, 7.4, 7.5, 8.4_

  - [x] 9.3 Wire the marker-aware render through both views in `panel-vue/src/components/RunView.vue`, `TestPlanView.vue`, and `App.vue`
    - Ensure the Test Plan preview collapses component groups to a header (child steps hidden until expanded; no running state before a run) and the Run Log uses the live-current-step behavior; ensure `App.vue` passes the marker-bearing `taskPath` through to both; a run/plan with no markers renders exactly as today
    - _Requirements: 6.1, 6.2, 7.1, 7.2, 8.3, 8.4_

  - [ ]* 9.4 Write panel unit tests for collapsing behavior
    - Component headers collapse by default; expand on click; collapsed+running shows one current-step line; collapsed+success shows header only; any child failure auto-expands; nested inner failure expands the enclosing chain; plain tasks still render expanded; marker-free plan/run unchanged
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 7.1, 7.2, 7.3, 7.4, 8.3, 8.4_

- [ ] 10. Checkpoint — panel layer
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 11. Property tests — compiler/runtime (fast-check, node:test, min 100 iterations each)
  - [ ]* 11.1 Property 1 — component action flattens to a marked task step
    - **Property 1: A component action always flattens to a task-shaped step marked `isComponent` with its `componentName`.**
    - **Validates: Requirements 3.1, 3.2, 5.1**
    - Tag `// Feature: component-object-model, Property 1: Component action flattens to a marked task step`; min 100 iterations; in `packages/compiler/src/flattener.property.test.js`
  - [ ]* 11.2 Property 2 — marker survives expansion onto taskPath
    - **Property 2: The component marker survives `expandTaskStep` onto every child step's `taskPath` node.**
    - **Validates: Requirements 5.2**
    - Tag `// Feature: component-object-model, Property 2: Marker survives expansion onto taskPath`; min 100 iterations; in `packages/extension/src/background.property.test.js`
  - [ ]* 11.3 Property 3 — instances resolve independent roots
    - **Property 3: N instances of the same component bound to N distinct roots emit N independent `scopeRoot` references for their `.childOf(el)` locators, each bounding its search to its own root subtree (no cross-instance collision).**
    - **Validates: Requirements 2.4, 4.1, 4.2**
    - Tag `// Feature: component-object-model, Property 3: Instances resolve independent roots`; min 100 iterations; in `packages/compiler/src/flattener.property.test.js`
  - [ ]* 11.4 Property 4 — component params resolve like task params
    - **Property 4: Component action params carrying `{{data.*}}` or `{{ctx.*}}` tokens resolve identically to plain task params.**
    - **Validates: Requirements 3.3, 5.3**
    - Tag `// Feature: component-object-model, Property 4: Component params resolve like task params`; min 100 iterations; in `packages/extension/src/background.property.test.js`
  - [ ]* 11.5 Property 5 — component-free files are byte-identical
    - **Property 5: A component-free file compiles byte-identically to pre-feature output (golden).**
    - **Validates: Requirements 8.1, 8.2**
    - Tag `// Feature: component-object-model, Property 5: Component-free files are byte-identical`; min 100 iterations; golden comparison against the committed pre-feature baseline; in `packages/compiler/src/flattener.property.test.js`
  - [ ]* 11.6 Property 8 — scopeRoot bounds the subtree; no-scopeRoot resolves document-wide
    - **Property 8: A locator carrying a `scopeRoot` restricts matches to the subtree of the passed root (outside is not matched; inside is), while a locator WITHOUT a `scopeRoot` is NOT subtree-bounded and resolves against the document root.**
    - **Validates: Requirements 2.3, 4.1, 4.2, 4.3, 4.4**
    - Tag `// Feature: component-object-model, Property 8: scopeRoot bounds the subtree; no-scopeRoot resolves document-wide`; min 100 iterations; in `packages/extension/src/runtime.property.test.js`

- [ ] 12. Property tests — panel (fast-check, node:test, min 100 iterations each)
  - [ ]* 12.1 Property 6 — plain tasks never collapse
    - **Property 6: Plain (non-component) task nodes never carry the component marker and therefore never collapse.**
    - **Validates: Requirements 6.2, 8.4**
    - Tag `// Feature: component-object-model, Property 6: Plain tasks never collapse`; min 100 iterations; in a panel-vue property test file
  - [ ]* 12.2 Property 7 — collapse state matches child statuses
    - **Property 7: Collapsed+running shows exactly one current-step line; collapsed+success shows none; any child failure forces expansion.**
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4**
    - Tag `// Feature: component-object-model, Property 7: Collapse state matches child statuses`; min 100 iterations; in a panel-vue property test file

- [ ] 13. Checkpoint — all property tests created
  - Ensure all tests pass, ask the user if questions arise.

- [x] 14. Config + playground example
  - [x] 14.1 Add the `components` directory field to the config and resolver
    - Add a `components` field to `tomation.config.ts` resolution alongside `pom`, `tests`, `automations`, `data`; have the compiler resolve `*.com.ts` Component_Files from it; when `components` is absent or empty, compile exactly as today with no component definitions, leaving existing POM `Task` definitions, tests, automations, and the inline/shared data flow unchanged
    - _Requirements: 1.1, 1.4, 8.1, 8.2_
  - [x] 14.2 Add a searchable-select component and reuse it across multiple fields in `examples/playground-tests`
    - Add a `*.com.ts` Component (searchable select: open, type query, click first result) with `.childOf(el)` on the in-root locators and a document-scoped locator for the portal list; instantiate it with `.in(root)` on two or more form fields and invoke its action from a test (including a `{{data.*}}` arg), wiring files into the existing playground spec/config (`examples/playground-tests/tomation.config.ts`, `pom`, `tests`)
    - _Requirements: 1.1, 2.1, 2.4, 3.1, 3.3, 10.2_
  - [x] 14.3 Recompile the playground spec (single-shot)
    - Run `npm run compile:playground` once and confirm the component example compiles: the action is task-shaped with `isComponent`/`componentName`, opted-in locators carry `scopeRoot`, the portal locator does not, and data tokens attach — do not run tests or watch modes
    - _Requirements: 1.1, 2.2, 2.3, 3.1, 3.2, 10.2_

- [x] 15. Documentation
  - [x] 15.1 Document the Component Object Model in `examples/playground/docs.html`
    - Describe defining a Component in a `*.com.ts` file, instantiating with `.in(root)`, per-locator root scoping via `.childOf(el)` (and the document-scoped portal case), invoking Component_Actions, and the component log-collapsing behavior
    - _Requirements: 10.1_
  - [x] 15.2 Document the Component Object Model in `tomation-ai.md`
    - Mirror the docs.html content: `*.com.ts` definition, `.in(root)`, root-relative vs document-scoped locators, action invocation, and log collapsing
    - _Requirements: 10.1_

- [ ] 16. Final checkpoint — ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional (unit, property, and verification tests) and can be skipped for a faster MVP. Per the workspace convention the **user runs tests manually** — these tasks CREATE tests; the agent must NOT run `node --test`, `npm test`, `node -c`, watch modes, or dev servers.
- Compiler and Runtime code is ES5 (`var`, function declarations, no arrow functions). DSL type definitions (`index.d.ts`, `globals.d.ts`) and the Vue 3 + TypeScript Panel are the exception and follow their existing style.
- The marker (`isComponent` + `componentName`) is the single new runtime datum and the thread tying Milestone B to Milestone A: compiler stamps it (task 3.2), runtime carries it on `taskPath` (task 6.1), panel types/store preserve it (task 8), and the panel UI consumes it (task 9).
- `scopeRoot` is emitted ONLY for internal locators that chained `.childOf(el)`; non-opted locators stay document-scoped with no `scopeRoot`, and static same-file `childOf` validation/emission is unaffected.
- All component problems follow Warn_And_Skip: record a `{ message, filePath, line }` warning, apply a best-effort fallback (document-scoped resolution, emit-the-step, or skip-the-action), emit output, and continue. No component condition is fatal to compilation (Requirement 9).
- Backward compatibility is guarded by the golden Property 5: a component-free project compiles byte-identically to pre-feature output.
- Property tests use `fast-check` with `node:test`, a minimum of 100 iterations each, and a `// Feature: component-object-model, Property <n>: <text>` tag, matching the project convention.
- Build/compile verification uses single-shot commands only (`npm run compile:playground`).

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "14.1"] },
    { "id": 1, "tasks": ["1.2", "2.1"] },
    { "id": 2, "tasks": ["1.3", "2.2"] },
    { "id": 3, "tasks": ["2.3", "3.1", "4.1"] },
    { "id": 4, "tasks": ["3.2", "4.2"] },
    { "id": 5, "tasks": ["3.3", "6.1", "6.2"] },
    { "id": 6, "tasks": ["6.3", "8.1"] },
    { "id": 7, "tasks": ["8.2", "9.1"] },
    { "id": 8, "tasks": ["8.3", "9.2"] },
    { "id": 9, "tasks": ["9.3"] },
    { "id": 10, "tasks": ["9.4", "11.1", "11.2", "11.3", "11.4", "11.5", "11.6", "12.1", "12.2"] },
    { "id": 11, "tasks": ["14.2"] },
    { "id": 12, "tasks": ["14.3"] },
    { "id": 13, "tasks": ["15.1", "15.2"] }
  ]
}
```
