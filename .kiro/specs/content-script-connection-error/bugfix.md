# Bugfix Requirements Document

## Introduction

When the background script attempts to send a message to a content script on a tab where the content script is not loaded, Chrome throws an unhandled promise rejection: `"Could not establish connection. Receiving end does not exist."` This crashes silently without any user-facing feedback. The fix should catch this error gracefully and inform the user through the side panel UI, explaining why the connection failed and how to resolve it (e.g., reload the page).

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a test run sends a step to a tab where the content script is not loaded (e.g., page not reloaded after extension install) THEN the system throws an unhandled promise rejection with "Could not establish connection. Receiving end does not exist."

1.2 WHEN a test run sends an upload step to a tab where the content script is not loaded THEN the system throws an unhandled promise rejection with "Could not establish connection. Receiving end does not exist."

1.3 WHEN the connection error occurs THEN the system provides no user-facing feedback in the side panel about what went wrong or how to fix it

### Expected Behavior (Correct)

2.1 WHEN a test run sends a step to a tab where the content script is not loaded THEN the system SHALL catch the connection error, halt the run gracefully, and send an error message to the side panel indicating the content script is not available on the active tab

2.2 WHEN a test run sends an upload step to a tab where the content script is not loaded THEN the system SHALL catch the connection error, halt the run gracefully, and send an error message to the side panel indicating the content script is not available on the active tab

2.3 WHEN the connection error is reported to the side panel THEN the system SHALL display a user-friendly message explaining that the page needs to be reloaded for the extension to work, with actionable guidance (e.g., "Reload the page and try again")

### Unchanged Behavior (Regression Prevention)

3.1 WHEN the content script is loaded and responsive on the active tab THEN the system SHALL CONTINUE TO send steps and receive results normally without any additional error handling overhead

3.2 WHEN a step fails for a reason other than a missing content script (e.g., element not found) THEN the system SHALL CONTINUE TO report the failure through the existing LOG and RUN_COMPLETE flow

3.3 WHEN the side panel is not open and safeSendMessage is used for runtime.sendMessage THEN the system SHALL CONTINUE TO log the error to the console without crashing
