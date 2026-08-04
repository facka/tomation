# Requirements Document

## Introduction

Migration of the Tomation browser extension sidebar panel from vanilla ES5 JavaScript (panel.html + panel.js, ~2500 lines) to a Vue 3 application using Composition API, script setup syntax, and TypeScript. The migration is additive — controlled by a build flag (USE_VUE_PANEL) — preserving the original panel files until the Vue version is fully validated. The Vue panel must replicate all existing functionality across three views (Home, Test Plan, Run) while supporting both Chrome MV3 and Firefox MV2 extension targets.

## Glossary

- **Build_System**: The Vite-based build pipeline that compiles Vue 3 source files from `packages/extension/panel-vue/` into a bundled panel output
- **Build_Script**: The existing `build.js` that copies extension files to `dist/chrome` and `dist/firefox` directories
- **Panel_App**: The Vue 3 application serving as the extension sidebar panel
- **Reactive_Store**: A simple Vue 3 reactive state module (no Pinia) managing shared application state
- **Home_View**: The main view displaying loaded spec metadata, test lists, automation lists, search, favourites, and file drag-drop loading
- **TestPlan_View**: The view displaying a recursive step checklist with checkboxes, parameter form, and configuration section for a selected test or automation
- **Run_View**: The view displaying a live execution log with task headers, step statuses, retry/skip buttons, parameter banners, and context popup
- **Global_Stylesheet**: A standalone CSS file extracted from the inline styles in panel.html, providing design tokens and base styles
- **Scoped_Styles**: Component-level CSS using Vue scoped style blocks for component-specific overrides
- **Browser_API**: The cross-browser extension messaging interface (chrome.* or browser.*)

## Requirements

### Requirement 1: Build Pipeline Setup

**User Story:** As a developer, I want a Vite-based build pipeline for the Vue panel so that I can develop with modern tooling while producing extension-compatible output.

#### Acceptance Criteria

1. THE Build_System SHALL compile Vue 3 single-file components with TypeScript from `packages/extension/panel-vue/` into a single HTML file with inlined or co-located JS and CSS suitable for extension panel usage.
2. WHEN the Build_Script runs with the environment variable USE_VUE_PANEL set to a truthy value, THE Build_Script SHALL copy the Vite-built panel output to `dist/chrome` and `dist/firefox` in place of the original `panel.html` and `panel.js`.
3. WHEN the Build_Script runs without the USE_VUE_PANEL environment variable or with a falsy value, THE Build_Script SHALL copy the original `src/panel.html` and `src/panel.js` files to the dist directories.
4. THE Build_System SHALL produce output compatible with Chrome Manifest V3 Content Security Policy restrictions (no inline scripts, no eval).
5. THE Build_System SHALL produce output compatible with Firefox Manifest V2 sidebar panel requirements.
6. THE Build_System SHALL configure Vite to output assets with deterministic filenames (no content hashes) suitable for extension packaging.

### Requirement 2: Shared Logic Extraction

**User Story:** As a developer, I want shared business logic extracted into TypeScript modules so that both the original panel and Vue panel can reuse validated logic.

#### Acceptance Criteria

1. THE Build_System SHALL support TypeScript modules in `packages/extension/panel-vue/` that encapsulate spec validation, search filtering, favourites sorting, and quick-run helper logic.
2. THE Panel_App SHALL use imported TypeScript modules for spec validation instead of duplicating the inline `validateSpec` function.
3. THE Panel_App SHALL use imported TypeScript modules for test/automation name filtering instead of duplicating the `filterTests` function.
4. THE Panel_App SHALL use imported TypeScript modules for favourites sorting instead of duplicating the `sortAutomationsWithFavourites` function.

### Requirement 3: Reactive Store

**User Story:** As a developer, I want a simple reactive store so that all components can share and react to application state changes without prop drilling.

#### Acceptance Criteria

1. THE Reactive_Store SHALL maintain the current spec data, current view, current runnable selection, run state, favourites map, and context store cache as reactive properties.
2. THE Reactive_Store SHALL expose typed getter functions for derived state (filtered test lists, sorted automations, current step plan).
3. THE Reactive_Store SHALL expose action functions for state mutations (load spec, select runnable, update run status, toggle favourite).
4. THE Reactive_Store SHALL persist favourites and active tab selection to extension storage using the Browser_API.
5. THE Reactive_Store SHALL use Vue 3 `reactive` or `ref` primitives without external state management libraries.

### Requirement 4: Home View

**User Story:** As a user, I want the Home view in the Vue panel to provide the same spec loading, test listing, and navigation functionality as the original panel.

#### Acceptance Criteria

1. WHEN no spec is loaded, THE Panel_App SHALL display a landing page with a welcome message, get-started button, drag-drop zone for spec files, playground prompt, and documentation link.
2. WHEN the user drops a `.tomation.json` file onto the drop zone, THE Panel_App SHALL read, parse, and validate the file using the shared spec validation module.
3. IF the dropped file fails validation, THEN THE Panel_App SHALL display the validation error message in the drop zone error area without loading the spec.
4. WHEN a valid spec is loaded, THE Panel_App SHALL display the spec name, description, file info, and tabbed lists of tests and automations.
5. THE Panel_App SHALL provide a search input per tab that filters displayed tests or automations by case-insensitive substring match.
6. WHEN the search filter produces zero results, THE Panel_App SHALL display an empty-state message within the active tab.
7. THE Panel_App SHALL display a favourite toggle button on each automation list item and persist favourite state across sessions via extension storage.
8. THE Panel_App SHALL sort automations with favourited items appearing before non-favourited items while preserving relative order within each group.
9. WHEN the user clicks a test or automation list item, THE Panel_App SHALL navigate to the TestPlan_View for that runnable.
10. THE Panel_App SHALL provide a quick-run button on each list item that starts execution with all steps checked and default parameters.
11. WHEN the extension detects the active tab is on the Tomation Playground domain and no spec is loaded, THE Panel_App SHALL display the playground prompt offering to load bundled example tests.

### Requirement 5: Test Plan View

**User Story:** As a user, I want the Test Plan view to let me configure and selectively run steps of a test or automation.

#### Acceptance Criteria

1. THE Panel_App SHALL display a back button, the runnable name (with source path), and the runnable type indicator in the navigation row.
2. THE Panel_App SHALL render a recursive step checklist with checkboxes representing each step of the selected test or automation, including indented sub-steps for nested task references.
3. THE Panel_App SHALL display step labels using action keywords, element badges with tooltip information, and value/parameter annotations matching the original panel rendering.
4. WHEN the selected runnable is an automation with parameters, THE Panel_App SHALL render a parameter form with typed inputs (text for string, number input for number, date input for date, select for enum) and appropriate validation.
5. IF a required automation parameter is left empty on form submission, THEN THE Panel_App SHALL display a validation error message and prevent run initiation.
6. THE Panel_App SHALL display a configuration section with debug mode checkbox and execution speed dropdown (Fast, Normal, Slow).
7. WHEN the user clicks the Run button, THE Panel_App SHALL initiate execution with the checked steps, entered parameter values, and selected configuration options, then navigate to the Run_View.

### Requirement 6: Run View

**User Story:** As a user, I want the Run view to display live execution progress with task grouping, status indicators, and debug controls.

#### Acceptance Criteria

1. THE Panel_App SHALL display a navigation row with the runnable name and a close button (visible after completion).
2. THE Panel_App SHALL display a controller bar with Pause, Resume, Stop, and Context buttons during execution.
3. THE Panel_App SHALL render a scrollable log container showing step entries with status-based styling (queued, in-progress with spinner, pass, fail, skipped).
4. THE Panel_App SHALL render task header entries with nested depth indentation and aggregate status indicators (in-progress, pass, warning).
5. WHEN an automation run has parameters, THE Panel_App SHALL display a parameter banner at the top of the log showing parameter names and values.
6. WHEN a step fails in debug mode, THE Panel_App SHALL display Retry and Skip action buttons inline in the log for that step.
7. WHEN the user clicks the Context button, THE Panel_App SHALL display a popup overlay showing the current context store key-value pairs in a table format.
8. WHEN execution completes, THE Panel_App SHALL display a run summary with pass/fail/skip counts and a "Back to Home" button.
9. THE Panel_App SHALL display attempt badges on retried steps showing attempt number and pass/fail result.
10. THE Panel_App SHALL auto-scroll the log container to keep the latest entry visible during execution.

### Requirement 7: Styling Architecture

**User Story:** As a developer, I want a clean CSS architecture so that the Vue panel maintains visual parity with the original while enabling component-level style encapsulation.

#### Acceptance Criteria

1. THE Build_System SHALL include a Global_Stylesheet extracted from the original panel.html containing CSS custom properties (design tokens), reset rules, typography, and base element styles.
2. THE Panel_App SHALL import the Global_Stylesheet at the application root level so that all components inherit design tokens and base styles.
3. THE Panel_App SHALL use Vue scoped styles within individual components for component-specific style overrides and additions.
4. THE Panel_App SHALL maintain visual parity with the original panel across all views, buttons, badges, log entries, and form elements.

### Requirement 8: Cross-Browser Compatibility

**User Story:** As a developer, I want the Vue panel to work in both Chrome and Firefox extension contexts so that a single codebase serves both targets.

#### Acceptance Criteria

1. THE Panel_App SHALL detect and use the appropriate Browser_API (chrome.* or browser.*) for extension messaging, storage, and tab queries.
2. THE Panel_App SHALL function as a Chrome MV3 side panel loaded via the `side_panel.default_path` manifest entry.
3. THE Panel_App SHALL function as a Firefox MV2 sidebar loaded via the `sidebar_action.default_panel` manifest entry.
4. THE Panel_App SHALL communicate with the background script using the same message protocol as the original panel (sendMessage / onMessage).

### Requirement 9: Original Panel Preservation

**User Story:** As a developer, I want the original panel files preserved and selectable so that I can validate the Vue panel against the original before switching permanently.

#### Acceptance Criteria

1. THE Build_Script SHALL retain `src/panel.html` and `src/panel.js` in the repository without modification throughout the migration.
2. WHEN the USE_VUE_PANEL flag is toggled, THE Build_Script SHALL produce a fully functional extension build using the selected panel implementation without requiring any other code changes.
3. THE Build_Script SHALL support both panel implementations in the same repository without file conflicts or build errors.

### Requirement 10: Composables

**User Story:** As a developer, I want Vue composables encapsulating reusable UI logic so that components remain focused and testable.

#### Acceptance Criteria

1. THE Panel_App SHALL provide a composable for extension messaging that wraps Browser_API calls with typed request/response interfaces.
2. THE Panel_App SHALL provide a composable for file loading that encapsulates drag-drop event handling, file reading, JSON parsing, and validation orchestration.
3. THE Panel_App SHALL provide a composable for run execution state that manages step status transitions, log entry generation, and controller actions (pause, resume, stop, retry, skip).
4. THE Panel_App SHALL provide a composable for search filtering that accepts a reactive query and returns filtered, computed lists.
