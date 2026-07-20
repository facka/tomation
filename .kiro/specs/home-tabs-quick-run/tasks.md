# Implementation Plan: Home Tabs & Quick Run

## Overview

Refactor the Tomation extension's home view into a tabbed interface with "Tests" and "Automations" tabs, add Quick Run buttons for immediate execution, and implement automation favouriting. All changes target `panel.html`, `panel.js`, and `storage.js` (ES5 style, inline CSS, no build step).

## Tasks

- [x] 1. Add storage functions for favourites and tab persistence
  - [ ] 1.1 Add `saveFavourites`, `loadFavourites`, and `deleteFavourites` functions to storage.js
    - Add `saveFavourites(hostname, favourites)` that persists object under key `automation_favourites_{hostname}`
    - Add `loadFavourites(hostname)` that returns Promise resolving to the favourites object or `{}`
    - Add `deleteFavourites(hostname)` that removes the `automation_favourites_{hostname}` key from storage
    - Follow existing pattern: silent-fail with `console.error` on catch
    - Export all three functions in `module.exports`
    - _Requirements: 4.2, 4.5, 4.6_

  - [ ] 1.2 Add `saveActiveTab` and `loadActiveTab` functions to storage.js
    - Add `saveActiveTab(tabName)` that writes `tabName` to `chrome.storage.local` under key `home_active_tab`
    - Add `loadActiveTab()` that returns Promise resolving to `'tests'` or `'automations'` (default `'tests'`)
    - Silent-fail pattern consistent with other storage functions
    - Export both functions in `module.exports`
    - _Requirements: 1.4_

  - [ ] 1.3 Add `deleteFavourites` function to storage.js and call it on project deletion
    - Add `deleteFavourites(hostname)` that removes key `automation_favourites_{hostname}` via `api.storage.local.remove`
    - Silent-fail with `console.error` on catch
    - Export in `module.exports`
    - In panel.js, call `deleteFavourites(hostname)` wherever `deleteProject(hostname)` is invoked
    - _Requirements: 4.6_

- [x] 2. Add tab bar HTML structure and CSS to panel.html
  - [x] 2.1 Add tab bar markup and tab content containers inside `#home-loaded`
    - Add `.tab-bar` div with two `.tab-btn` buttons (`data-tab="tests"` and `data-tab="automations"`)
    - Add `#tab-content-tests` and `#tab-content-automations` containers with `.tab-content` class
    - Add `.tab-search-input` in each tab content container with appropriate placeholder text
    - _Requirements: 1.1, 1.7_

  - [x] 2.2 Add inline CSS styles for tabs, Quick Run buttons, and favourite toggles
    - `.tab-bar` — flex row, border-bottom, gap
    - `.tab-btn` — ghost button style; `.tab-btn.active` — accent underline
    - `.tab-content` — hidden by default; `.tab-content.active` — displayed
    - `.tab-search-input` — same styling as existing `#search-input`
    - `.quick-run-btn` — small play button, right-aligned in row
    - `.favourite-btn` — star icon button, left side of automation row
    - _Requirements: 1.1, 2.1, 3.1, 4.1_

- [x] 3. Implement tab switching logic in panel.js
  - [x] 3.1 Add `switchTab` function and tab button event listeners
    - Implement `switchTab(tabName)` that toggles `.active` class on tab buttons and content containers
    - Call `saveActiveTab(tabName)` to persist selection
    - Attach click listeners to `.tab-btn` elements that call `switchTab`
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 4. Refactor renderHomeView into tab-based rendering
  - [x] 4.1 Refactor `renderHomeView` to call `renderTestsTab` and `renderAutomationsTab`
    - Extract test-rendering logic into `renderTestsTab(specs)` targeting `#tab-content-tests`
    - Extract automation-rendering logic into `renderAutomationsTab(specs, favourites)` targeting `#tab-content-automations`
    - Load favourites via `loadFavourites(currentHostname)` before rendering automations
    - Restore last active tab via `loadActiveTab()` and call `switchTab`
    - Add empty state messages when no tests or no automations exist
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.6, 4.3, 4.4, 4.5_

  - [x] 4.2 Add Quick Run button HTML to each test and automation row
    - Append `<button class="quick-run-btn" title="Quick Run">▶</button>` to each row
    - Add favourite toggle `<button class="favourite-btn" ...>☆</button>` to automation rows
    - Set `data-favourite` attribute based on loaded favourites
    - Display filled star `★` for favourited, empty `☆` for non-favourited
    - _Requirements: 2.1, 3.1, 4.1_

  - [x] 4.3 Implement `sortAutomationsWithFavourites` function
    - Takes `automations` array and `favourites` object
    - Returns new array with favourites first, preserving relative order within each group
    - Call this in `renderAutomationsTab` before rendering items
    - _Requirements: 4.3, 4.4_

- [x] 5. Checkpoint - Ensure tab rendering works
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement Quick Run functionality
  - [x] 6.1 Add `buildAllStepsChecked` and `buildDefaultParams` helper functions
    - `buildAllStepsChecked(steps)` returns `[0, 1, 2, ..., steps.length - 1]`
    - `buildDefaultParams(params)` returns object with empty string for string, 0 for number, today's date for date, first option for enum
    - `hasRequiredParamsWithoutValues(params, savedValues)` returns true if any non-optional param has no saved value
    - _Requirements: 2.2, 3.5, 3.6_

  - [x] 6.2 Implement `quickRunTest` function
    - Build `checkedSteps` via `buildAllStepsChecked`
    - Build debug config: `{ allowContinueOnFailure: true, allowRetryOnFailure: true, executionSpeed: savedSpeed || 'NORMAL' }`
    - Send `RUN_TEST` message via `api.runtime.sendMessage`
    - Call `switchToRunView()` to transition to run view
    - _Requirements: 2.2, 2.3, 2.4, 2.5_

  - [x] 6.3 Implement `quickRunAutomation` function
    - Load saved params via `loadParamValues(automationName)`
    - If `hasRequiredParamsWithoutValues` returns true, navigate to plan view instead
    - Otherwise merge saved values with defaults from `buildDefaultParams`
    - Build `checkedSteps` and debug config
    - Send `RUN_AUTOMATION` message and call `switchToRunView()`
    - _Requirements: 3.2, 3.3, 3.4, 3.5, 3.6_

  - [x] 6.4 Implement `onQuickRunClick` event handler and wire it up
    - Call `e.stopPropagation()` to prevent row click from firing
    - Determine runnable type from `data-runnable-type` attribute
    - Delegate to `quickRunTest` or `quickRunAutomation`
    - Attach click listener to all `.quick-run-btn` elements during render
    - _Requirements: 5.3_

- [x] 7. Implement favourite toggle functionality
  - [x] 7.1 Implement `onFavouriteClick` handler and wire it up
    - Call `e.stopPropagation()` to prevent row click propagation
    - Toggle favourite state in local favourites object
    - Call `saveFavourites(currentHostname, favourites)` to persist scoped to current project
    - Re-render automations tab to reflect new sort order
    - Update star icon (☆ ↔ ★) and `data-favourite` attribute
    - Attach click listener to all `.favourite-btn` elements during render
    - _Requirements: 4.1, 4.2, 4.3, 5.4_

- [ ] 8. Update search filter to scope per-tab
  - [ ] 8.1 Refactor `applySearchFilter` to work within active tab content only
    - Attach `input` event listener to each `.tab-search-input`
    - Filter only items within the active tab's content container
    - When switching tabs, re-apply filter from that tab's search input value
    - _Requirements: 1.7_

- [ ] 9. Final checkpoint - Verify integration
  - Ensure all tests pass, ask the user if questions arise.

- [ ]* 9.1 Write property test for tab filtering exhaustiveness (Property 1)
    - **Property 1: Tab filtering is exhaustive and exclusive**
    - Generate arbitrary arrays of test/automation objects; verify tab split is exhaustive and exclusive
    - **Validates: Requirements 1.2, 1.3**

- [ ]* 9.2 Write property test for favourite sort stability (Property 2)
    - **Property 2: Favourite sort preserves relative order**
    - Generate arbitrary automation lists and favourite subsets; verify sort stability invariant
    - **Validates: Requirements 4.3, 4.4**

- [ ]* 9.3 Write property test for Quick Run test message (Property 3)
    - **Property 3: Quick Run test message is equivalent to all-checked plan run**
    - Generate tests with random step counts; verify Quick Run message shape
    - **Validates: Requirements 2.2, 2.3**

- [ ]* 9.4 Write property test for Quick Run automation default params (Property 4)
    - **Property 4: Quick Run automation default params**
    - Generate automations with random param type combinations; verify default values
    - **Validates: Requirements 3.5**

- [ ]* 9.5 Write property test for required params fallback (Property 5)
    - **Property 5: Quick Run automation with required params and no saved values falls back to plan view**
    - Generate automations with required params; verify fallback behavior
    - **Validates: Requirements 3.6**

- [ ]* 9.6 Write property test for favourite persistence round trip (Property 7)
    - **Property 7: Favourite persistence round trip**
    - Generate random automation name sets and hostnames; verify save/load round trip is scoped per hostname with storage mock
    - **Validates: Requirements 4.2, 4.5, 4.6**

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties using fast-check
- All code must be ES5 (var, function declarations, no arrow functions)
- panel.html uses inline CSS (no build step)
- background.js requires NO changes
- storage.js follows existing Promise-based API pattern with silent-fail error handling

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "2.1", "2.2"] },
    { "id": 1, "tasks": ["3.1"] },
    { "id": 2, "tasks": ["4.1", "4.3"] },
    { "id": 3, "tasks": ["4.2", "6.1"] },
    { "id": 4, "tasks": ["6.2", "6.3", "7.1"] },
    { "id": 5, "tasks": ["6.4", "8.1"] },
    { "id": 6, "tasks": ["9.1", "9.2", "9.3", "9.4", "9.5", "9.6"] }
  ]
}
```
