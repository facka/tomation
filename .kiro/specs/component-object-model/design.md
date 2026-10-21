# Design — Component Object Model (COM) + Component-Aware Log Collapsing

## Overview

Tomation already has a Page Object Model (POM) layer: `.pom.ts` files export element locators (`is.TAG.where(...).as('Label')`) and `Task(...)` bundles of steps. Tasks compile to a single `{ action: 'task', name, params }` step and are expanded by the runtime (`expandTaskStep`) into child steps that each carry a `taskPath` ancestry array. The run log (`LogContainer.vue`) already renders a header per `taskPath` level with an aggregate status.

This feature adds two things, delivered as one spec in two milestones:

- **Milestone A — Component-aware log collapsing.** Collapse *only* component-originated task groups in the run log. Plain POM tasks render as they do today. Component groups are collapsed by default, expandable by the user, show the live current step while running, show header-only on success, and auto-expand on failure. Collapsing is purely presentational; the runtime and in-page element highlighting are unchanged.
- **Milestone B — Component Object Model (COM).** A reusable UI component abstraction defined via a factory `Component(({ el }) => { ... })` that receives a root placeholder. Its internal locators use the ordinary element DSL (`is.TAG.where(...).as(...)`) and opt into root-scoping **per locator** by chaining the existing `.childOf(el)` against that root placeholder; a locator that does not chain `.childOf(el)` stays document-scoped (the portal/overlay case, e.g. a dropdown list rendered outside the root subtree). The component exposes `Task`-like actions over those locators and is instantiated by passing an explicit root element with `.in(root)`. One definition (e.g. a searchable select that opens, types a query, clicks the first result) is reused across many fields on a page without root-scoped locator collisions.

Guiding architectural commitment: **components compile down to the existing task-step representation and expand through the existing runtime path.** The only new runtime data is a *component marker* on the `taskPath` node. Milestone A consumes that marker; step execution, data-token resolution, and DOM highlighting are unchanged in spirit.

### Guiding principles

- **Additive and non-regressive.** Existing POMs, tasks, tests, automations, and the inline-test-data `{{data.*}}` flow behave identically. Plain tasks must never collapse.
- **Reuse the task pipeline.** Component actions become `{ action: 'task', ... }` steps; no new runtime execution primitive.
- **Presentational collapsing.** The runtime emits every internal step as today; panel-vue decides what to show.

### Scope boundaries

- In scope: the component DSL primitive, explicit-root composition, root-relative locator resolution, the component marker through compiler to runtime to panel, and component-aware log collapsing in the live run log.
- Out of scope: changing how plain tasks render; changing runtime execution order; changing DOM highlighting; a visual component builder.
- Collapsing applies to BOTH the live run log (`RunView.vue` / `LogContainer.vue`) and the Test Plan step preview (`TestPlanView.vue`); both carry the component marker and render component groups collapsed-by-default.

## Architecture

### Layers and the change per layer (verified against the codebase)

| Layer | File(s) | Current behavior | Change |
| --- | --- | --- | --- |
| DSL — elements | `packages/dsl/index.js`, `index.d.ts`, `globals.d.ts` | `is.TAG.where().childOf().navigate().as()` to `{ tag, label, where, childOf?, navigate?, __el: true }`. `Task(fn)` to `{ __task: true, fn, as(label) }`. `.childOf()` targets a static same-file element by `where.id` or element key. Actions take a target element descriptor. | Add a `Component(({ el }) => ...)` factory primitive that supplies a Root_Placeholder `el`; extend `.childOf()` to accept `el` (a deferred per-instance root) and mark the resulting descriptor so the compiler emits a `scopeRoot` rather than a static `childOf`; add `.in(root)` instantiation. |
| Compiler — parse | `packages/compiler/src/parser.js` | Extracts element/task defs by walking the method chain. `childOf` references a parent by `where.id` or element key. | Parse the `Component(({ el }) => ...)` factory, the `.childOf(el)` chains (distinguishing the `el` root-placeholder target from a static id/key target), the `.in(root)` instantiation, and component-action invocations; emit a component marker. |
| Compiler — flatten | `packages/compiler/src/flattener.js` | Merges POM results into `pageElements`, `tasks { steps, params? }`, `tests`, `automations`. Attaches `{{data.*}}` templates via `extractReferencedTemplateNames`. | Flatten component actions into task-shaped entries carrying a component marker; emit `scopeRoot` **only** on descriptors that chained `.childOf(el)`, leaving non-opted locators document-scoped and unchanged. |
| Compiler — validate | `packages/compiler/src/validator.js` | Validates `childOf` targets exist (by `where.id` or key). | Validate that a `.childOf(el)` chain references the factory's root placeholder and that `.in(root)` receives a real element descriptor; static same-file `childOf` validation is unaffected. |
| Runtime | `packages/extension/src/background.js`, `runtime.js` | `expandStep`/`expandTaskStep` flatten task steps into children carrying `taskPath` = array of `{ name, label, params }`. Params resolved via `resolveValue`. STEP_PLAN / STEP_STARTING carry `taskPath`. `runtime.js` does `childOf`-bounded search and highlighting. | Carry the component marker on each `taskPath` node through expansion and STEP messages. Resolve `scopeRoot` locators by reusing the existing `childOf`-bounded subtree search against the instance root; locators without `scopeRoot` resolve against the document root as today. No execution-order change. |
| Panel — log | `panel-vue/.../LogContainer.vue`, `LogEntry.vue`, `logic/stepLabel.ts`, `store/index.ts`, `types/{store,messages}.ts`, `App.vue` | Builds render items: a `task-header` per `taskPath` level (status via `computeTaskHeaderStatus`) then log entries. | Mark component headers; render component groups collapsed-by-default with collapse/expand + live-current-step + success-header-only + fail-auto-expand. |

### End-to-end data flow

```
Component(({ el }) => ...) with .childOf(el) opt-in + SearchSelect.in(root) + .choose(value)   (DSL)
  -> parser.js: component factory def; internal locators (some chaining .childOf(el),
       some document-scoped); .in(root) instantiation; component-action invocation
  -> flattener.js: pageElements — descriptors that chained .childOf(el) carry a per-instance
       scopeRoot, the rest are emitted unchanged (document-scoped) — plus a task-shaped
       component action carrying { isComponent, componentName }; data templates attached when
       action params reference {{data.*}} (reuse extractReferencedTemplateNames)
  -> background.js expandTaskStep: child steps with taskPath nodes carrying the marker;
       params resolved via resolveValue (data/context tokens unchanged)
  -> STEP_PLAN / STEP_STARTING (taskPath incl. marker) -> App.vue -> store (LogEntry.taskPath)
  -> LogContainer.vue: component headers collapsed-by-default; runtime.js resolves scopeRoot
       locators within the instance root via the existing childOf-bounded search, resolves
       non-scopeRoot locators document-wide, and highlights elements unchanged
```

### Root scoping (central technical problem)

Today `childOf` references a parent **by `where.id` or element key**, validated statically. A reusable component cannot hard-code its root because the root differs per instance and is supplied at composition time. The design solves this by reusing the existing `.childOf` DSL method and the existing bounded search — with no new matching code — plus a deferred root placeholder:

- The factory receives a **Root_Placeholder** `el` (`Component(({ el }) => { ... })`): a deferred stand-in for the root element, resolved **per instance** when `.in(root)` is called.
- Root-scoping is **explicit and opt-in per locator**. An internal locator opts in by chaining the existing `.childOf(el)` against that placeholder (`is.BUTTON.where(...).childOf(el).as('...')`). A locator that does NOT chain `.childOf(el)` stays document-scoped and resolves against the document root exactly as an ordinary POM element does today — this is the portal/overlay case (e.g. a dropdown list rendered outside the root subtree).
- The DSL's `.childOf()` therefore now accepts `el` (the factory's root placeholder) as a deferred, per-instance target in addition to the existing static same-file targets, and marks the resulting descriptor so the compiler produces a `scopeRoot` rather than a static `childOf`.
- The compiler turns each `.childOf(el)` chain into a **per-instance `scopeRoot`** reference, resolved to that instance's Root_Element at `.in(root)` time. `scopeRoot` is kept distinct from a static same-file `childOf` (which references a concrete element by id or key), so existing static `childOf` validation is unaffected. A locator without `.childOf(el)` is emitted with no `scopeRoot`.
- The runtime already supports bounded search within a parent node (`runtime.js` `childOf`-bounded candidate collection). A `scopeRoot` locator reuses that bounded search against the instance's resolved root, so multiple instances on one page each resolve their root-scoped internals under their own root with no collisions. Only opted-in locators are bounded; locators without `scopeRoot` resolve document-wide.

## Components and Interfaces

### Component DSL (finalized)

Authoring model:
- Define a component once with a factory `Component(({ el }) => { ... })` that receives a Root_Placeholder `el`.
- Internal locators use the ordinary element DSL (`is.TAG.where(...).as(...)`). A locator opts into root-scoping **per locator** by chaining the existing `.childOf(el)`; a locator that does not chain `.childOf(el)` stays document-scoped (the portal/overlay case).
- Expose `Task`-like actions over those locators; return the locators and actions from the factory.
- Instantiate per usage by passing an explicit root element: `const country = SearchSelect.in(countryField)` where `countryField` is an ordinary POM element descriptor.
- Use in a test/automation: `country.choose('Argentina')`, including data tokens: `country.choose(user.country)`.

Canonical example:

```ts
import { Component, Task, Type, Click, AssertExists, is } from '@tomationjs/dsl'

const SearchSelect = Component(({ el }) => {
  const trigger = is.BUTTON.where({ classIncludes: 'select-trigger' }).childOf(el).as('Open Select')
  const searchBox = is.INPUT.where({ placeholder: 'Search...' }).childOf(el).as('Search Field')
  const firstResult = is.LI.where({ isNthElement: 1 }).as('First Result') // no .childOf(el) -> document-scoped (portal)

  const choose = Task((params: { query: string }) => {
    Click(trigger)
    Type(params.query).in(searchBox)
    Click(firstResult)
    AssertExists(trigger)
  }).as('Choose Option')

  return { trigger, searchBox, firstResult, choose }
})

export default { SearchSelect }
```

Here `trigger` and `searchBox` chain `.childOf(el)`, so the compiler emits a per-instance `scopeRoot` for them; `firstResult` does not, so it is emitted document-scoped (the dropdown list renders in a portal outside the root subtree). Instantiating with `const country = SearchSelect.in(countryField)` resolves `el` to the `countryField` descriptor for that instance, and `country.choose('Argentina')` (or `country.choose(user.country)` with a data token) invokes the action.

Realization (decided): components live in a dedicated `components` directory as `*.com.ts` files, resolved via a new `components` field in `tomation.config.ts`. This mirrors how `pom`, `tests`, and `automations` directories are configured and keeps components discoverable and reusable across pages. A component file exports a named component built from a `Component(({ el }) => ...)` factory and `Task`-like actions; it is instantiated elsewhere with `.in(root)`.

### Component marker propagation (the thread tying A and B)

1. **DSL:** component instantiation/actions tag themselves as component-originated.
2. **Compiler flatten:** the component action becomes a task-shaped step; its entry carries `isComponent` + `componentName`.
3. **Runtime `expandTaskStep`:** when building the child `taskPath` node, copy the marker onto the node.
4. **STEP messages:** `taskPath` nodes already flow through STEP_PLAN / STEP_STARTING; the marker rides along.
5. **Panel store/types:** extend the `taskPath` node type to include the marker (`types/store.ts`, `types/messages.ts`).
6. **LogContainer:** emit a collapsible component header for a marked node.

### Log collapsing behavior (Milestone A)

In `LogContainer.vue`'s `renderItems`:
- A `task-header` whose node is marked `isComponent` becomes a **collapsible component header** with local expand/collapse state (initially collapsed).
- **Collapsed + running:** header plus a single current-step line (the active child under that header's `pathKey`).
- **Collapsed + success (finished):** header only (pass status), no current-step line.
- **Collapsed + any child failed:** force-expand down to the failing child; keep expanded.
- **Expanded (user or auto):** render all child entries as today.
- **Nested:** collapse state is per component header; a collapsed outer component hides inner headers (they live under its `pathKey`); an inner failure auto-expands the chain down to the failure.
- **Non-component task headers:** unchanged (always expanded).

Highlighting is unchanged: the runtime still sends the same per-step messages that drive the in-page highlight; collapsing only affects which rows the panel draws.

## Data Models

- **Element descriptor (DSL to compiler):** existing `{ tag, label, where, childOf?, navigate?, __el: true }` gains an additive, optional `scopeRoot` reference, present **only** when the locator chained `.childOf(el)` against the Root_Placeholder (distinct from static id/key-based `childOf`). Locators that did not chain `.childOf(el)` carry no `scopeRoot`.
- **Component definition (compiler output):** a named entry capturing the internal locators — which may be root-scoped (via `.childOf(el)`) or document-scoped — and action step bundles (actions keyed like tasks).
- **Flattened component action (step):** a `{ action: 'task', name, params }` step annotated with `isComponent: true` and `componentName: string`.
- **`taskPath` node (runtime to panel):** extended from `{ name, label, params }` to `{ name, label, params, isComponent?: boolean, componentName?: string }`. Added in `types/messages.ts` and `types/store.ts`.
- **Panel render item:** `task-header` render items gain `isComponent` / `componentName`; collapse/expand state is local, keyed by `pathKey`.
- **Config:** a `components` directory field in `tomation.config.ts`, alongside `pom`, `tests`, `automations`, `data`.

## Error Handling

Follow the compiler's established **Warn_And_Skip** convention (as used by inline-test-data): record a `{ message, filePath, line }` warning, apply a best-effort resolution, emit output, and continue.

- Component instantiated without a root, or with a non-element root: warning; fall back to document-scoped resolution; continue.
- Component action referencing an unknown internal locator: warning; emit the step so the author sees it; continue.
- Unknown component name used in a test: warning; skip the action; continue.
- Root reference unresolvable at runtime: the failure surfaces **immediately** through the existing locator-not-found path for the affected step, with **no retry or wait-for-element** behavior; the normal failure path then auto-expands the component group in the log.
- No component condition is fatal to compilation.

## Correctness Properties

Validated with fast-check (`node:test`, min 100 iterations, tagged `// Feature: component-object-model, Property <n>: <text>`), matching the project convention.

### Property 1: Component action flattens to a marked task step
A component action always flattens to a task-shaped step marked `isComponent` with its `componentName`.

**Validates: Requirements 3.1, 3.2, 5.1**

### Property 2: Marker survives expansion onto taskPath
The component marker survives `expandTaskStep` onto every child step's `taskPath` node.

**Validates: Requirements 5.2**

### Property 3: Instances resolve independent roots
N instances of the same component bound to N distinct roots emit N independent `scopeRoot` references for their `.childOf(el)` locators, each bounding its search to its own root subtree (no cross-instance collision).

**Validates: Requirements 2.4, 4.1, 4.2**

### Property 4: Component params resolve like task params
Component action params carrying `{{data.*}}` or `{{ctx.*}}` tokens resolve identically to plain task params.

**Validates: Requirements 3.3, 5.3**

### Property 5: Component-free files are byte-identical
A component-free file compiles byte-identically to pre-feature output (golden).

**Validates: Requirements 8.1, 8.2**

### Property 6: Plain tasks never collapse
Plain (non-component) task nodes never carry the component marker and therefore never collapse.

**Validates: Requirements 6.2, 8.4**

### Property 7: Collapse state matches child statuses
Collapsed+running shows exactly one current-step line; collapsed+success shows none; any child failure forces expansion.

**Validates: Requirements 7.1, 7.2, 7.3, 7.4**

### Property 8: scopeRoot bounds the subtree; no-scopeRoot resolves document-wide
A locator carrying a `scopeRoot` restricts matches to the subtree of the passed root (outside is not matched; inside is), while a locator WITHOUT a `scopeRoot` is NOT subtree-bounded and resolves against the document root.

**Validates: Requirements 2.3, 4.1, 4.2, 4.3, 4.4**

## Testing Strategy

- **Compiler unit tests:** parse a component definition; root binding via `.in(root)`; root-scoped locator emission; the component marker on the flattened action; `{{data.*}}` attachment to component actions; a golden backward-compat test for component-free files.
- **Runtime tests:** marker survives expansion onto `taskPath`; multiple instances resolve independently; execution order and highlighting unchanged (shape-equivalence where possible).
- **Panel tests:** component headers collapse by default; expand on click; live current step while running; header-only on success; auto-expand on failure; nested-collapse precedence; plain tasks still render expanded.
- **Property tests:** the 8 properties above.
- **Verification constraints:** per workspace rules, the task author will NOT run tests or watch modes. Verification uses single-shot compiles only (e.g. `npm run compile:playground`); the user runs tests manually.

## Resolved Decisions

1. **Component layer realization:** a dedicated `components` directory holding `*.com.ts` files, with a corresponding `components` field in `tomation.config.ts` (alongside `pom`, `tests`, `automations`, `data`). Components are NOT a primitive inside POM files.
2. **Root binding spelling:** explicit `.in(root)` — e.g. `const country = SearchSelect.in(countryField)`.
3. **Collapsing scope:** applies to BOTH the live run log (`RunView.vue` / `LogContainer.vue`) AND the Test Plan step preview (`TestPlanView.vue`). Both paths must carry the component marker and render component groups collapsed-by-default. The live-current-step line is a run-log concept; the Test Plan preview collapses component groups to a header (there is no "running" state before a run, so it shows the collapsed header with its child steps hidden until expanded).
4. **Root-scoping descriptor field:** `scopeRoot` is emitted **only** for internal locators that opted in via `.childOf(el)` against the Root_Placeholder; it is the compiled form of that chain, resolved per-instance to the element passed at `.in(root)`. It is kept separate from the static id/key-based `childOf` so current `childOf` validation is unaffected; locators without `.childOf(el)` carry no `scopeRoot` and are document-scoped. Validation: a `.childOf(el)` chain must reference the factory's root placeholder, and `.in(root)` must receive a real element descriptor (not a static HTML id).
5. **Root-scoping is explicit/opt-in per locator:** root-scoping is expressed per locator by chaining `.childOf(el)`, rather than implicitly stamped on all internal locators. This reuses the existing `.childOf` DSL method and the existing runtime bounded search with no new matching code; un-scoped locators fall through to ordinary document-scoped resolution (the portal/overlay case).
6. **Nested-component collapse precedence on failure:** no special precedence rules beyond the base behavior — a failure auto-expands the chain of enclosing component groups down to the failing step; otherwise each component group collapses independently.
