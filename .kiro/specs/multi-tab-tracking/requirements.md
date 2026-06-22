# Requirements Document

## Introduction

Multi-tab tracking enables automatic tab following during test execution in the Tomation browser extension. When a test action (e.g., Click) opens a new browser tab whose hostname matches any URL in the spec's `meta.urls` array, the test execution seamlessly continues in the new tab without any explicit DSL action from the test author. This feature maintains a tab stack so that if the active tab closes, execution falls back to the previous tab. The feature is implemented entirely in the extension background script with no compiler or DSL changes.

## Glossary

- **Tab_Tracker**: The module within the background script responsible for detecting new tabs, matching hostnames, managing the tab stack, and switching execution context.
- **Tab_Stack**: An ordered stack data structure that records the history of tabs used during a test run, enabling fallback when the active tab closes.
- **Locked_Tab**: The browser tab currently receiving test step messages, identified by `runState.lockedTabId`.
- **Meta_URLs**: The array of URL strings from the spec's `meta.urls` field, representing allowed hostnames for the test execution scope.
- **RUNTIME_READY**: A message sent by the content script to the background script when the content script has loaded and is ready to receive step messages.
- **Matching_Tab**: A newly created browser tab whose hostname matches at least one hostname extracted from Meta_URLs.
- **Non_Matching_Tab**: A newly created browser tab whose hostname does not match any hostname in Meta_URLs.

## Requirements

### Requirement 1: New Tab Detection During Test Execution

**User Story:** As a test author, I want the extension to detect when a test action opens a new browser tab, so that my test can continue executing across tabs without manual intervention.

#### Acceptance Criteria

1. WHILE a test run is active, THE Tab_Tracker SHALL listen for newly created browser tabs using the `chrome.tabs.onCreated` event
2. WHEN a new tab is created during a test run, THE Tab_Tracker SHALL extract the hostname from the new tab's URL once it has loaded
3. WHILE no test run is active, THE Tab_Tracker SHALL NOT listen for tab creation events

### Requirement 2: Hostname Matching Against Meta URLs

**User Story:** As a test author, I want only tabs that navigate to domains in my test scope to be considered for tab switching, so that unrelated browser activity does not interfere with my test.

#### Acceptance Criteria

1. WHEN a new tab is detected, THE Tab_Tracker SHALL extract hostnames from all entries in Meta_URLs for comparison
2. WHEN the new tab's hostname matches at least one hostname from Meta_URLs, THE Tab_Tracker SHALL classify the tab as a Matching_Tab
3. WHEN the new tab's hostname does not match any hostname from Meta_URLs, THE Tab_Tracker SHALL classify the tab as a Non_Matching_Tab
4. THE Tab_Tracker SHALL compare hostnames in a case-insensitive manner

### Requirement 3: Tab Switching on Match

**User Story:** As a test author, I want execution to switch to a matching new tab automatically, so that tests involving OAuth flows, target="_blank" links, or multi-domain navigation work without extra DSL steps.

#### Acceptance Criteria

1. WHEN a Matching_Tab is detected, THE Tab_Tracker SHALL wait for a RUNTIME_READY message from that tab before switching execution
2. WHEN RUNTIME_READY is received from a Matching_Tab, THE Tab_Tracker SHALL push the current Locked_Tab onto the Tab_Stack
3. WHEN RUNTIME_READY is received from a Matching_Tab, THE Tab_Tracker SHALL call `lockTab` with the new tab's ID to update `runState.lockedTabId`
4. WHEN RUNTIME_READY is received from a Matching_Tab, THE Tab_Tracker SHALL pause step execution until the switch is complete

### Requirement 4: Tab Switch Timeout

**User Story:** As a test author, I want execution to continue on the original tab if a new tab fails to become ready, so that my test does not hang indefinitely.

#### Acceptance Criteria

1. WHEN a Matching_Tab does not send RUNTIME_READY within 10 seconds, THE Tab_Tracker SHALL stop waiting for that tab
2. WHEN the timeout elapses, THE Tab_Tracker SHALL continue execution on the current Locked_Tab without switching
3. WHEN the timeout elapses, THE Tab_Tracker SHALL log a warning message indicating the timeout occurred

### Requirement 5: Tab Stack Management

**User Story:** As a test author, I want the extension to maintain a history of tabs used during my test run, so that execution can resume on the previous tab when the current tab closes.

#### Acceptance Criteria

1. WHEN a test run starts, THE Tab_Tracker SHALL initialize the Tab_Stack with the initial Locked_Tab as the first entry
2. THE Tab_Stack SHALL maintain tab entries in the order they were activated (most recent on top)
3. WHEN a test run ends, THE Tab_Tracker SHALL clear the Tab_Stack

### Requirement 6: Active Tab Close Handling

**User Story:** As a test author, I want execution to fall back to the previous tab when the active tab closes, so that popup windows and temporary tabs do not break my test.

#### Acceptance Criteria

1. WHILE a test run is active, THE Tab_Tracker SHALL listen for tab close events using `chrome.tabs.onRemoved`
2. WHEN the Locked_Tab is closed, THE Tab_Tracker SHALL pop the closed tab from the Tab_Stack
3. WHEN the Locked_Tab is closed and the Tab_Stack is not empty, THE Tab_Tracker SHALL call `lockTab` with the tab ID at the top of the Tab_Stack
4. IF the Locked_Tab is closed and the Tab_Stack is empty, THEN THE Tab_Tracker SHALL stop the test run and emit a failure summary

### Requirement 7: Non-Matching Tab Handling

**User Story:** As a test author, I want tabs that do not belong to my test scope to be ignored, so that browser activity outside my test domains does not interfere with execution.

#### Acceptance Criteria

1. WHEN a Non_Matching_Tab is detected, THE Tab_Tracker SHALL NOT modify the Locked_Tab
2. WHEN a Non_Matching_Tab is detected, THE Tab_Tracker SHALL NOT push any entry onto the Tab_Stack
3. WHEN a Non_Matching_Tab is detected, THE Tab_Tracker SHALL NOT pause or delay step execution

### Requirement 8: Transparency to Test Authors

**User Story:** As a test author, I want multi-tab tracking to work without any changes to my test DSL or test files, so that I can benefit from the feature with zero migration effort.

#### Acceptance Criteria

1. THE Tab_Tracker SHALL operate entirely within the extension background script without requiring DSL changes
2. THE Tab_Tracker SHALL NOT introduce new step actions or keywords into the test language
3. THE Tab_Tracker SHALL NOT require changes to existing spec files or test definitions to enable multi-tab behavior
