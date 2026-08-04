# Implementation Plan: Vue 3 Panel Migration

## Overview

Migrate the Tomation extension sidebar panel from vanilla ES5 (panel.html + panel.js) to a Vue 3 application with Composition API, TypeScript, and Vite. The migration follows a phased approach: project setup → shared logic extraction → reactive store/composables → view components → build integration → cleanup. All code lives in `packages/extension/panel-vue/`.

## Tasks

- [ ] 1. Set up Vue 3 project structure and build pipeline
  - [ ] 1.1 Initialize panel-vue package with Vite, Vue 3, and TypeScript
    - Create `packages/extension/panel-vue/package.json` with vue, vite, @vitejs/plugin-vue, vite-plugin-singlefile, typescript, vue-tsc dependencies
    - Create `tsconfig.json` with strict mode, path aliases (`@/` → `./src/`), and Vue SFC support
    - Create `vite.config.ts` with vue plugin, viteSingleFile plugin, deterministic filenames (no content hashes), and `@` alias
    - Create `env.d.ts` with Vite and Vue type shims
    - Create `index.html` as minimal Vite entry with `<div id="app">` and `<script type="module" src="/src/main.ts">`
    - _Requirements: 1.1, 1.4, 1.5, 1.6_

  - [ ] 1.2 Create application entry point and root component shell
    - Create `src/main.ts` that imports `global.css`, creates the Vue app from `App.vue`, and mounts to `#app`
    - Create `src/App.vue` as root component with a reactive `currentView` switch using `v-if` for HomeView, TestPlanView, RunView placeholders
    - _Requirements: 1.1, 7.2_

  - [ ] 1.3 Extract global stylesheet from panel.html
    - Create `src/styles/global.css` with CSS custom properties (design tokens), reset rules, base typography, shared utility classes (`.btn`, `.btn-primary`, `.btn-ghost`, `.btn-sm`, `.view`, `.nav-row`, `.action-bar`)
    - Extract styles directly from the `<style>` block in `packages/extension/src/panel.html`
    - _Requirements: 7.1, 7.2, 7.4_

- [ ] 2. Define TypeScript types and interfaces
  - [ ] 2.1 Create type definitions for spec data models
    - Create `src/types/spec.ts` with interfaces: PageElement, Step, Param, TestEntry, AutomationEntry, SpecMeta, Spec, SpecEntry, Project
    - _Requirements: 2.1, 3.1_

  - [ ] 2.2 Create type definitions for store state and actions
    - Create `src/types/store.ts` with types: ViewName, RunnableType, StepStatus, TaskHeaderStatus, Runnable, RunConfig, LogEntry, StoreState, StoreActions, StoreGetters
    - _Requirements: 3.1, 3.2, 3.3_

  - [ ] 2.3 Create type definitions for message protocol
    - Create `src/types/messages.ts` with discriminated union types: PanelMessage (outgoing), BackgroundMessage (incoming), StepPlanEntry
    - Match exact message shapes used by existing background.js
    - _Requirements: 8.4_

- [ ] 3. Implement shared logic modules
  - [ ] 3.1 Port validateSpec to TypeScript
    - Create `src/logic/validateSpec.ts` that validates a JSON object against the spec format (format field, version, pageElements, tests, automations)
    - Return `{ ok: true, spec }` or `{ ok: false, error }` matching original ES5 behaviour
    - _Requirements: 2.2_

  - [ ]* 3.2 Write property test for validateSpec equivalence
    - **Property 4: Spec validation equivalence**
    - **Validates: Requirements 2.2**

  - [ ] 3.3 Port filterTests to TypeScript
    - Create `src/logic/filterTests.ts` implementing case-insensitive substring name filtering
    - _Requirements: 2.3, 4.5_

  - [ ]* 3.4 Write property test for filterTests equivalence
    - **Property 5: Search filter equivalence**
    - **Validates: Requirements 2.3, 4.5, 10.4**

  - [ ] 3.5 Port sortAutomationsWithFavourites to TypeScript
    - Create `src/logic/sortFavourites.ts` implementing stable partition sort (favourited first, relative order preserved)
    - _Requirements: 2.4, 4.8_

  - [ ]* 3.6 Write property test for sortFavourites equivalence
    - **Property 6: Favourites sort equivalence**
    - **Validates: Requirements 2.4, 4.8**

  - [ ] 3.7 Implement quickRunHelpers module
    - Create `src/logic/quickRunHelpers.ts` with `buildAllStepsChecked(steps)`, `buildDefaultParams(params)`, and `hasRequiredParamsWithoutValues(params, values)`
    - _Requirements: 4.10_

  - [ ]* 3.8 Write property test for quickRunHelpers
    - **Property 9: Quick-run helper correctness**
    - **Validates: Requirements 4.10**

  - [ ] 3.9 Implement browserApi module
    - Create `src/logic/browserApi.ts` with `api` export (browser or chrome) and `isPlaygroundUrl(url)` function
    - _Requirements: 8.1_

  - [ ]* 3.10 Write property test for isPlaygroundUrl
    - **Property 10: Playground URL detection**
    - **Validates: Requirements 4.11**

  - [ ] 3.11 Implement stepLabel module
    - Create `src/logic/stepLabel.ts` with `buildStepLabel(step, pageElements)` and `resolveTargetLabel(target, pageElements)` for rendering step display text
    - _Requirements: 5.3_

- [ ] 4. Checkpoint - Verify logic modules
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Implement reactive store
  - [ ] 5.1 Create the reactive store with state, getters, and actions
    - Create `src/store/index.ts` using Vue `reactive()` for StoreState and `computed()` for getters (filteredTests, filteredAutomations, sortedAutomations, isPlaygroundDetected, showPlaygroundPrompt)
    - Implement all StoreActions: setView, loadSpec, setProject, setHostname, selectRunnable, clearRunnable, toggleFavourite, startRun, setStepPlan, setStepStatus, setRunComplete, setPaused, stopRun, updateContext, setContextStore, setActiveTab, setSearchQuery
    - Persist favourites and activeTab to extension storage via Browser_API
    - Export `useStore()` composable function
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [ ]* 5.2 Write property test for store persistence round-trip
    - **Property 7: Store persistence round-trip**
    - **Validates: Requirements 3.4, 4.7**

- [ ] 6. Implement composables
  - [ ] 6.1 Implement useMessaging composable
    - Create `src/composables/useMessaging.ts` wrapping Browser_API for `send(message)`, `onMessage(handler)`, and `getActiveTabUrl()`
    - Use typed PanelMessage and BackgroundMessage interfaces
    - _Requirements: 10.1, 8.1, 8.4_

  - [ ] 6.2 Implement useFileLoader composable
    - Create `src/composables/useFileLoader.ts` with refs for error, isDragOver, and functions: handleFile, handleDrop, handleDragEnter, handleDragLeave
    - Orchestrate FileReader → JSON.parse → validateSpec → store.loadSpec
    - _Requirements: 10.2, 4.2, 4.3_

  - [ ]* 6.3 Write property test for file validation error display
    - **Property 8: File validation error display**
    - **Validates: Requirements 4.2, 4.3**

  - [ ] 6.4 Implement useRunExecution composable
    - Create `src/composables/useRunExecution.ts` with computed refs (isRunning, isPaused, logEntries, summary) and actions (pause, resume, stop, retry, skip)
    - Wire actions to messaging.send() and store mutations
    - _Requirements: 10.3, 6.2, 6.6_

  - [ ]* 6.5 Write property test for run execution state transitions
    - **Property 18: Run execution state transitions**
    - **Validates: Requirements 10.3**

  - [ ] 6.6 Implement useSearch composable
    - Create `src/composables/useSearch.ts` as a generic composable accepting a reactive items ref, exposing query, filtered, and isEmpty computed refs
    - _Requirements: 10.4, 4.5, 4.6_

- [ ] 7. Checkpoint - Verify store and composables
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 8. Implement Home View components
  - [ ] 8.1 Implement LandingPage and DropZone components
    - Create `src/components/LandingPage.vue` with welcome message, get-started button, drag-drop zone, playground prompt, and documentation link
    - Create `src/components/DropZone.vue` with drag-drop event handling (useFileLoader), file validation feedback, and error display area
    - _Requirements: 4.1, 4.2, 4.3, 4.11_

  - [ ] 8.2 Implement LoadedHeader, TabBar, and list components
    - Create `src/components/LoadedHeader.vue` displaying spec name, description, file info, and reload button
    - Create `src/components/TabBar.vue` with tests/automations tab switcher
    - Create `src/components/TestList.vue` with search input and filtered test items
    - Create `src/components/AutomationList.vue` with search input, filtered automation items, and favourite toggle
    - Create `src/components/RunnableItem.vue` with name, quick-run button, and click-to-navigate handler
    - _Requirements: 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10_

  - [ ] 8.3 Implement HomeView as container component
    - Create `src/components/HomeView.vue` that conditionally renders LandingPage (no spec) or loaded state (LoadedHeader + TabBar + lists)
    - Wire navigation: clicking a runnable item calls store.selectRunnable() and store.setView('test-plan')
    - _Requirements: 4.1, 4.9_

- [ ] 9. Implement Test Plan View components
  - [ ] 9.1 Implement StepChecklist component
    - Create `src/components/StepChecklist.vue` as a recursive checkbox tree rendering steps with indentation, action keywords, element badges with tooltips, and value/parameter annotations
    - Support nested sub-steps for task references
    - _Requirements: 5.2, 5.3_

  - [ ] 9.2 Implement ParamForm and ConfigSection components
    - Create `src/components/ParamForm.vue` rendering typed inputs (text, number, date, select) per param definition with required field validation
    - Create `src/components/ConfigSection.vue` with debug mode checkbox and execution speed dropdown (Fast, Normal, Slow)
    - _Requirements: 5.4, 5.5, 5.6_

  - [ ]* 9.3 Write property test for parameter form type mapping
    - **Property 11: Parameter form type mapping**
    - **Validates: Requirements 5.4**

  - [ ]* 9.4 Write property test for required parameter validation
    - **Property 12: Required parameter validation**
    - **Validates: Requirements 5.5**

  - [ ] 9.5 Implement TestPlanView as container component
    - Create `src/components/TestPlanView.vue` with back button, runnable name/type indicator, StepChecklist, ParamForm (conditional), ConfigSection, and Run button
    - On Run click: validate params, build checked steps list, call store.startRun() and messaging.send() with RUN_TEST or RUN_AUTOMATION, navigate to Run view
    - _Requirements: 5.1, 5.7_

- [ ] 10. Implement Run View components
  - [ ] 10.1 Implement LogEntry, TaskHeader, and LogContainer components
    - Create `src/components/LogEntry.vue` with status-based CSS classes (queued, in-progress with spinner, pass, fail, skipped), action label, target, value, error text, retry/skip buttons (debug mode), and attempt badges
    - Create `src/components/TaskHeader.vue` with nested depth indentation and aggregate status indicator
    - Create `src/components/LogContainer.vue` as scrollable container with auto-scroll behaviour, rendering param banner, task headers, and log entries
    - _Requirements: 6.3, 6.4, 6.5, 6.6, 6.9, 6.10_

  - [ ]* 10.2 Write property test for step status to CSS class mapping
    - **Property 13: Step status to CSS class mapping**
    - **Validates: Requirements 6.3**

  - [ ]* 10.3 Write property test for task header aggregate status
    - **Property 14: Task header aggregate status**
    - **Validates: Requirements 6.4**

  - [ ] 10.4 Implement ControllerBar, ContextPopup, and RunSummary components
    - Create `src/components/ControllerBar.vue` with Pause, Resume, Stop, Context buttons bound to useRunExecution actions
    - Create `src/components/ContextPopup.vue` as overlay table rendering all context store key-value pairs
    - Create `src/components/RunSummary.vue` with pass/fail/skip counts and Back to Home button
    - _Requirements: 6.2, 6.7, 6.8_

  - [ ]* 10.5 Write property test for context popup completeness
    - **Property 15: Context popup completeness**
    - **Validates: Requirements 6.7**

  - [ ] 10.6 Implement RunView as container component
    - Create `src/components/RunView.vue` with nav row (runnable name + close button), ControllerBar, LogContainer, ContextPopup (overlay), and RunSummary (post-completion)
    - _Requirements: 6.1, 6.2, 6.8_

- [ ] 11. Checkpoint - Verify all view components render
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 12. Wire message dispatch and cross-browser support
  - [ ] 12.1 Implement message dispatch in App.vue
    - Wire `useMessaging().onMessage()` in App.vue `onMounted` to dispatch all BackgroundMessage types to appropriate store actions (STEP_PLAN, STEP_STARTING, LOG, UPDATE_LOG_ENTRY, STEP_FAILED_AWAITING_ACTION, RUN_COMPLETE, RUN_STOPPED, STATE_SYNC, TAB_URL_UPDATE, BUNDLED_SPEC_LOADED, CONTEXT_STATE)
    - Handle MANUAL_PAUSE message with description display
    - _Requirements: 8.4, 10.1_

  - [ ]* 12.2 Write property test for message protocol compatibility
    - **Property 17: Message protocol compatibility**
    - **Validates: Requirements 8.4**

  - [ ]* 12.3 Write property test for browser API detection
    - **Property 16: Browser API detection**
    - **Validates: Requirements 8.1**

- [ ] 13. Integrate with build system
  - [ ] 13.1 Modify build.js to support USE_VUE_PANEL flag
    - Update `packages/extension/build.js` to check `process.env.USE_VUE_PANEL` and conditionally copy `panel-vue/dist/index.html` as `src/panel.html` to dist directories, excluding original panel.html and panel.js from the copy list when the flag is truthy
    - Ensure original files remain untouched in the repo
    - _Requirements: 1.2, 1.3, 9.1, 9.2, 9.3_

  - [ ]* 13.2 Write property test for build flag behaviour
    - **Property 1: Build flag selects correct panel output**
    - **Validates: Requirements 1.2, 1.3, 9.2**

- [ ] 14. Final checkpoint - Full integration validation
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The build pipeline uses `vite-plugin-singlefile` to produce a single HTML file compatible with both Chrome MV3 and Firefox MV2 extension contexts
- All logic modules are pure TypeScript functions that can be tested without Vue component mounting
- The `USE_VUE_PANEL` flag ensures zero-risk rollout — toggle off to revert to original panel instantly

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "2.1", "2.2", "2.3"] },
    { "id": 2, "tasks": ["3.1", "3.3", "3.5", "3.7", "3.9", "3.11"] },
    { "id": 3, "tasks": ["3.2", "3.4", "3.6", "3.8", "3.10"] },
    { "id": 4, "tasks": ["5.1"] },
    { "id": 5, "tasks": ["5.2", "6.1", "6.6"] },
    { "id": 6, "tasks": ["6.2", "6.4"] },
    { "id": 7, "tasks": ["6.3", "6.5"] },
    { "id": 8, "tasks": ["8.1", "8.2"] },
    { "id": 9, "tasks": ["8.3", "9.1", "9.2"] },
    { "id": 10, "tasks": ["9.3", "9.4", "9.5"] },
    { "id": 11, "tasks": ["10.1", "10.4"] },
    { "id": 12, "tasks": ["10.2", "10.3", "10.5", "10.6"] },
    { "id": 13, "tasks": ["12.1"] },
    { "id": 14, "tasks": ["12.2", "12.3", "13.1"] },
    { "id": 15, "tasks": ["13.2"] }
  ]
}
```
