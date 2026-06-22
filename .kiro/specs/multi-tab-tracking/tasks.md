# Implementation Plan: Multi-Tab Tracking

## Overview

Implement automatic tab-following during test execution in the Tomation extension background script. The implementation adds a Tab_Tracker module with tab stack management, hostname matching, Chrome event listeners, and integration into the existing `runStepLoop` and `startRun`/`finishRun` lifecycle. All changes are confined to `packages/extension/src/background.js` with tests in `packages/extension/src/tab-tracker.test.js`.

## Tasks

- [ ] 1. Add pure utility functions and state extensions
  - [ ] 1.1 Implement `extractHostname` and `isMatchingHostname` pure functions
    - Add `extractHostname(url)` that returns the lowercase hostname from a URL string, or empty string for invalid URLs
    - Add `isMatchingHostname(hostname, metaUrls)` that returns true if the lowercase hostname matches any hostname extracted from the metaUrls array (case-insensitive comparison)
    - Add these functions to `packages/extension/src/background.js` before the Tab_Tracker lifecycle functions
    - _Requirements: 1.2, 2.1, 2.2, 2.3, 2.4_

  - [ ]* 1.2 Write property test for hostname extraction (Property 1)
    - **Property 1: Hostname extraction correctness**
    - Generate random valid URL strings and invalid strings, verify `extractHostname` returns correct lowercase hostname or empty string
    - Test file: `packages/extension/src/tab-tracker.test.js`
    - **Validates: Requirements 1.2, 2.1**

  - [ ]* 1.3 Write property test for hostname matching (Property 2)
    - **Property 2: Hostname matching classification**
    - Generate random hostname/metaUrls pairs, verify `isMatchingHostname` classification matches set membership with case-insensitive comparison
    - Test file: `packages/extension/src/tab-tracker.test.js`
    - **Validates: Requirements 2.2, 2.3, 2.4**

- [ ] 2. Implement tab stack state and lifecycle management
  - [ ] 2.1 Extend `runState` and `resetRunState` with tab tracking fields
    - Add `tabStack: []`, `pendingTabSwitch: null`, and `metaHostnames: null` to `runState`
    - Update `resetRunState()` to clear these fields
    - _Requirements: 5.1, 5.3_

  - [ ] 2.2 Implement `initTabTracker` and `teardownTabTracker` functions
    - `initTabTracker()` registers `chrome.tabs.onCreated` and `chrome.tabs.onRemoved` listeners, initializes `tabStack` with the initial locked tab, and computes `metaHostnames` from `runState.spec.meta.urls`
    - `teardownTabTracker()` removes listeners, clears `tabStack`, `metaHostnames`, and `pendingTabSwitch`
    - _Requirements: 1.1, 1.3, 5.1, 5.3_

  - [ ]* 2.3 Write property test for stack initialization (Property 4)
    - **Property 4: Stack initialization**
    - Generate random tab IDs, simulate run initialization, verify stack contains exactly the initial tab
    - Test file: `packages/extension/src/tab-tracker.test.js`
    - **Validates: Requirements 5.1**

- [ ] 3. Implement tab creation handler and tab switching
  - [ ] 3.1 Implement `handleTabCreated` function
    - Check `runState.running` first — return immediately if false
    - Extract hostname from the new tab's URL using `extractHostname`
    - Check hostname against `runState.metaHostnames` using `isMatchingHostname`
    - If non-matching, return immediately (no state change)
    - If matching and no `pendingTabSwitch` is active, set `pendingTabSwitch` state and wait for RUNTIME_READY from that tab with a 10-second timeout
    - If matching but `pendingTabSwitch` already active, ignore (only first match triggers a switch)
    - _Requirements: 1.1, 1.2, 2.2, 2.3, 3.1, 3.4, 4.1, 7.1, 7.2, 7.3_

  - [ ] 3.2 Implement `switchToTab` function
    - Push current `runState.lockedTabId` onto `tabStack`
    - Call `lockTab(tabId)` with the new tab's ID
    - Resolve the `pendingTabSwitch` promise so step loop can resume
    - Clear the timeout
    - _Requirements: 3.2, 3.3, 5.2_

  - [ ]* 3.3 Write property test for tab switch state update (Property 3)
    - **Property 3: Tab switch state update**
    - Generate random initial state (lockedTabId + tabStack), perform `switchToTab`, verify stack grows by one and previous tab is on top
    - Test file: `packages/extension/src/tab-tracker.test.js`
    - **Validates: Requirements 3.2, 3.3, 5.2**

  - [ ]* 3.4 Write property test for non-matching tab invariance (Property 6)
    - **Property 6: Non-matching tab invariance**
    - Generate non-matching hostnames and random state, simulate `handleTabCreated`, verify zero state changes to `lockedTabId`, `tabStack`, and step execution state
    - Test file: `packages/extension/src/tab-tracker.test.js`
    - **Validates: Requirements 7.1, 7.2, 7.3**

- [ ] 4. Implement tab removal handler and fallback logic
  - [ ] 4.1 Implement `handleTabRemoved` function
    - Check if `tabId === runState.lockedTabId`
    - If not the locked tab, return immediately
    - If the locked tab: pop it from `tabStack`
    - If stack is non-empty, call `lockTab` with new top of stack
    - If stack is empty, stop the run with failure summary ("Active tab closed and no fallback tab available")
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [ ] 4.2 Implement `fallbackToPreviousTab` function
    - Pop the closed tab from the stack
    - If stack non-empty, lock the new top tab and resume
    - If stack empty, call `finishRun` with failure
    - _Requirements: 6.2, 6.3, 6.4_

  - [ ]* 4.3 Write property test for tab close fallback (Property 5)
    - **Property 5: Tab close fallback**
    - Generate random non-empty stacks, simulate tab close, verify stack shrinks by one and `lockedTabId` updates to new top
    - Test file: `packages/extension/src/tab-tracker.test.js`
    - **Validates: Requirements 6.2, 6.3**

- [ ] 5. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Integrate tab tracker into run lifecycle and step loop
  - [ ] 6.1 Integrate `initTabTracker` into `startRun`
    - After `resetRunState()` and before `runStepLoop()`, call `initTabTracker()` to set up listeners and initialize tab stack with the locked tab
    - _Requirements: 1.1, 5.1_

  - [ ] 6.2 Integrate `teardownTabTracker` into run completion
    - Call `teardownTabTracker()` wherever the run ends (success, failure, stop requested) to remove listeners and clear state
    - _Requirements: 1.3, 5.3_

  - [ ] 6.3 Modify `runStepLoop` to await pending tab switch
    - Before dispatching each step, check if `pendingTabSwitch` is active
    - If active, await the pending switch promise before sending the next step to the runtime
    - _Requirements: 3.4_

  - [ ] 6.4 Extend RUNTIME_READY handler for tab switch resolution
    - In the existing `handleMessage` function, when a RUNTIME_READY message arrives and `pendingTabSwitch` is active and the sender tab matches the expected tab, call `switchToTab` to complete the switch
    - _Requirements: 3.1, 3.2, 3.3_

- [ ] 7. Implement timeout handling for tab switch
  - [ ] 7.1 Add 10-second timeout to pending tab switch
    - When `pendingTabSwitch` is set, start a `setTimeout` of 10000ms
    - On timeout: clear `pendingTabSwitch`, log a warning via `console.warn`, and resolve the step-loop wait so execution continues on the current tab
    - _Requirements: 4.1, 4.2, 4.3_

  - [ ]* 7.2 Write unit tests for timeout and edge cases
    - Test that timeout fires after 10s and execution continues on current tab
    - Test that RUNTIME_READY from wrong tab does not resolve the switch
    - Test that multiple rapid matching tabs only trigger one switch
    - Test empty `meta.urls` results in no tab tracking
    - Test file: `packages/extension/src/tab-tracker.test.js`
    - _Requirements: 4.1, 4.2, 4.3_

- [ ] 8. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- All code changes are in `packages/extension/src/background.js`
- All tests are in `packages/extension/src/tab-tracker.test.js`
- The project uses Node.js built-in test runner and `fast-check` for property-based tests

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "2.2", "2.3"] },
    { "id": 2, "tasks": ["3.1", "3.2", "4.1", "4.2"] },
    { "id": 3, "tasks": ["3.3", "3.4", "4.3"] },
    { "id": 4, "tasks": ["6.1", "6.2", "6.3", "6.4", "7.1"] },
    { "id": 5, "tasks": ["7.2"] }
  ]
}
```
