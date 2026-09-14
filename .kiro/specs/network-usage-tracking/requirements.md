# Requirements Document

## Introduction

This feature adds network usage tracking to test and automation runs. While a run executes, the
system captures the XHR/fetch network requests the page under test makes and attributes each
captured request to the step that was executing when the request fired. Captured requests are shown
in the run log, grouped with the step they belong to and rendered with a distinct visual treatment
so they are not mistaken for normal steps. The captured data (URL, HTTP method, query parameters,
request body, response status, and response body) is persisted alongside the run results so it can
be inspected after the run completes.

The feature also adds a DSL assertion surface (an `AssertRequest`-style capability) that lets authors
validate server interactions: matching by URL/endpoint, HTTP method, query parameters, request body
contents, and response status code, as well as asserting that a request was NOT made and asserting
that a request occurred a specific number of times. Assertion outcomes are reported in the run log
like other step results.

Capture is performed through the Chrome DevTools Protocol via `chrome.debugger`, which attaches to
the tab under test.

> **SECURITY RISK NOTE — UNMASKED CAPTURE (please reconsider during review):**
> By explicit decision, this feature captures request and response data **unmasked**. It applies **no
> masking** to sensitive values. This means secrets — including authentication tokens, session
> cookies, API keys, and passwords sent in request/response headers, query parameters, or bodies —
> **will appear in the run log and in any persisted run data**. Anyone with access to the run log or
> stored run artifacts can read those secrets. This is a deliberate tradeoff chosen for full-fidelity
> debugging. Consider whether unmasked capture is acceptable for your environment before adopting this
> feature, and revisit this decision in review if run data may be shared or stored beyond the local
> machine.

> **KNOWN CONSTRAINT — DEBUGGER BANNER:**
> Because capture uses the Chrome DevTools Protocol (`chrome.debugger`), Chrome displays a debugging
> banner (for example "… is being debugged") on the tab under test for the duration of the run. This
> is an inherent, expected side effect of the capture mechanism, not a defect.

## Glossary

- **Runtime**: The step execution engine in `packages/extension/src/runtime.js` that executes steps
  and emits log entries.
- **Background_Worker**: The extension service worker / message hub in
  `packages/extension/src/background.js` that owns the debugger attachment and relays messages.
- **Network_Capture_Service**: The logical component (hosted in the Background_Worker) that attaches
  to the tab under test via the Chrome DevTools Protocol, listens for network events, and produces
  Captured_Request records.
- **Chrome_DevTools_Protocol**: The Chrome debugging interface, accessed through the `chrome.debugger`
  API, used to observe network activity on the tab under test.
- **Debugger_Banner**: The visible notification Chrome displays on a tab while a debugger client is
  attached to it.
- **Tab_Under_Test**: The browser tab in which the run's steps execute and whose network activity is
  captured.
- **XHR_Fetch_Request**: A network request initiated by the page's JavaScript through the
  XMLHttpRequest or Fetch APIs. Static asset requests (images, scripts, stylesheets, fonts, media)
  are out of scope.
- **Captured_Request**: A record produced by the Network_Capture_Service describing one
  XHR_Fetch_Request, containing at least: request URL, HTTP method, query parameters, request body,
  response status code, response body, and the identity of the attributed step.
- **Executing_Step**: The single step the Runtime is executing at the moment an XHR_Fetch_Request
  fires; the step to which the Captured_Request is attributed.
- **Step_Attribution**: The association of a Captured_Request with the Executing_Step.
- **Run_Log**: The panel view that displays task headers, step log entries, and (with this feature)
  network entries, rendered by `LogContainer.vue` and `LogEntry.vue` from the store's
  `state.logEntries`.
- **Network_Log_Entry**: A Run_Log item representing a Captured_Request, visually distinct from a
  step log entry and grouped with its attributed step.
- **DSL**: The authoring surface in `packages/dsl` (`index.js`, `index.d.ts`, `globals.d.ts`) where
  steps are defined as `{ action: ... }` descriptor objects.
- **AssertRequest**: The DSL assertion builder added by this feature for validating captured network
  requests.
- **Request_Matcher**: The set of criteria (URL/endpoint, HTTP method, query parameters, request body
  contents, response status code) used by AssertRequest to select matching Captured_Requests.
- **Run_Data**: The persisted results of a run, stored via `packages/extension/src/storage.js`,
  which (with this feature) includes Captured_Requests.

## Requirements

### Requirement 1: Capture scope limited to XHR/fetch

**User Story:** As a test author, I want only XHR/fetch API calls captured, so that the run log shows
meaningful server interactions without noise from static assets.

#### Acceptance Criteria

1. WHILE a run is executing, THE Network_Capture_Service SHALL capture each XHR_Fetch_Request initiated by the Tab_Under_Test and record it as a Captured_Request within 500 milliseconds of the response completing.
2. WHEN the Tab_Under_Test requests a static asset whose resource type is image, script, stylesheet, font, or media, THE Network_Capture_Service SHALL exclude that request from capture and SHALL create no Captured_Request for it.
3. WHEN an XHR_Fetch_Request is captured, THE Network_Capture_Service SHALL record in the Captured_Request the request URL (up to 8,192 characters), the HTTP method, the query parameters, the request body, the response status code (integer 100 to 599), and the response body.
4. IF a recorded request body or response body exceeds 1,048,576 bytes (1 MB), THEN THE Network_Capture_Service SHALL store the first 1,048,576 bytes in the Captured_Request and SHALL set a truncation indicator on that Captured_Request showing the body was truncated.
5. IF an XHR_Fetch_Request completes without a readable response body, or the body cannot be read, THEN THE Network_Capture_Service SHALL record the Captured_Request with an empty body and an indicator that the body was unavailable, and SHALL retain all other recorded fields.

### Requirement 2: Capture mechanism via Chrome DevTools Protocol

**User Story:** As a test author, I want network capture to observe the real tab traffic, so that
captured requests reflect what the application actually sent and received.

#### Acceptance Criteria

1. WHEN a run starts, THE Network_Capture_Service SHALL attach to the Tab_Under_Test using the Chrome_DevTools_Protocol through the `chrome.debugger` API within 5 seconds.
2. WHILE the Network_Capture_Service is attached to the Tab_Under_Test, THE Network_Capture_Service SHALL collect XHR_Fetch_Request request and response data through the Chrome_DevTools_Protocol, including across in-tab navigations that occur during the run.
3. WHEN a run completes, THE Network_Capture_Service SHALL detach from the Tab_Under_Test.
4. IF the run stops before completion (stopped, failed, or interrupted), THEN THE Network_Capture_Service SHALL detach from the Tab_Under_Test.
5. IF the Network_Capture_Service cannot attach to the Tab_Under_Test within 5 seconds, including when a debugger is already attached to the Tab_Under_Test by another client, THEN THE Background_Worker SHALL record an attachment error entry (identifying the tab and the attachment failure reason) to the Run_Log and continue the run without captured requests.
6. IF the Tab_Under_Test is closed while the Network_Capture_Service is attached, THEN THE Network_Capture_Service SHALL treat the capture as ended, release the attachment without emitting an attachment error, and THE Background_Worker SHALL record a capture-ended entry to the Run_Log while continuing the run with requests captured before closure.
7. IF the Chrome_DevTools_Protocol session is detached by an external cause (for example, another client attaching or a browser-initiated detach) before the run completes, THEN THE Background_Worker SHALL record a detachment entry (identifying the detach reason) to the Run_Log and continue the run, retaining requests captured before the detachment.

### Requirement 3: Debugger banner constraint

**User Story:** As a test author, I want to understand the debugger banner that appears during runs,
so that I recognize it as expected behavior rather than a problem.

#### Acceptance Criteria

1. WHILE the Network_Capture_Service is attached to the Tab_Under_Test, THE Chrome_DevTools_Protocol
   SHALL cause Chrome to display the Debugger_Banner on the Tab_Under_Test.
2. WHEN the Network_Capture_Service detaches from the Tab_Under_Test, THE Chrome_DevTools_Protocol
   SHALL cause Chrome to remove the Debugger_Banner from the Tab_Under_Test.

### Requirement 4: Per-step attribution of captured requests

**User Story:** As a test author, I want each captured request associated with the step that caused
it, so that I can see which server interactions each step triggered.

#### Acceptance Criteria

1. WHEN an XHR_Fetch_Request is initiated, THE Network_Capture_Service SHALL attribute the resulting Captured_Request to the step that is the Executing_Step at the moment of initiation, SHALL lock that Step_Attribution at initiation, and SHALL NOT reassign the Step_Attribution when the response arrives during a different Executing_Step.
2. WHERE the Executing_Step belongs to a task, THE Network_Capture_Service SHALL record the task path of the Executing_Step on the Captured_Request so the request can be grouped with that step in the Run_Log.
3. IF an XHR_Fetch_Request is initiated while no step is executing and at least one step has already executed, THEN THE Network_Capture_Service SHALL attribute the resulting Captured_Request to the most recently executed step.
4. IF an XHR_Fetch_Request is initiated before the first step has begun executing, THEN THE Network_Capture_Service SHALL record the resulting Captured_Request with no Step_Attribution and SHALL group it in the Run_Log as unattributed.
5. WHERE the Executing_Step at the moment of initiation does not belong to a task, THE Network_Capture_Service SHALL record the Captured_Request without a task path and SHALL group it in the Run_Log under that step directly.

### Requirement 5: Run-log display of captured requests

**User Story:** As a test author, I want captured requests shown in the run log next to their step,
so that I can inspect server interactions inline while reading the run.

#### Acceptance Criteria

1. WHEN a Captured_Request is attributed to a step, THE Run_Log SHALL display a corresponding Network_Log_Entry grouped with the attributed step and positioned after that step's log entry.
2. THE Run_Log SHALL render each Network_Log_Entry with a visual treatment distinct from a step log entry so that a Network_Log_Entry is not presented as a step.
3. THE Network_Log_Entry SHALL display the HTTP method, the request URL, and the response status code of the Captured_Request.
4. WHEN a test author activates the expand control of a Network_Log_Entry, THE Run_Log SHALL display the query parameters, the request body, and the response body of the Captured_Request.
5. WHERE a step has one or more Captured_Requests attributed to it, THE Run_Log SHALL display the count of Captured_Requests associated with that step whenever one or more Captured_Requests exist for that step, even if the associated Network_Log_Entries are not currently shown.
6. WHEN the Run_Log first renders a Network_Log_Entry, THE Run_Log SHALL display it in the collapsed state, showing only the HTTP method, request URL, and response status code.
7. WHEN multiple Captured_Requests are attributed to the same step, THE Run_Log SHALL display their Network_Log_Entries in ascending order of the time each Captured_Request was initiated.
8. IF a Captured_Request has no response status code because the response is pending or the request failed, THEN THE Network_Log_Entry SHALL display a non-numeric status indicator conveying the pending or failed state in place of the response status code.
9. WHERE a step has no Captured_Requests attributed to it, THE Run_Log SHALL display no Network_Log_Entry and no count for that step.
10. WHERE the request URL of a Captured_Request exceeds the display width of a collapsed Network_Log_Entry, THE Run_Log SHALL truncate the displayed URL with a visual truncation indicator while retaining the full URL in the expanded state.
11. WHILE the system has not yet determined whether a step has Captured_Requests attributed to it, IF the Run_Log renders that step, THEN THE Run_Log SHALL display a loading placeholder indicator in place of a final count.

### Requirement 6: DSL AssertRequest matcher surface

**User Story:** As a test author, I want a DSL assertion for network requests, so that I can validate
server interactions as part of a test in the same style as existing assertions.

#### Acceptance Criteria

1. THE DSL SHALL provide an AssertRequest builder that produces a step descriptor with an `assertRequest` action and `__step` set to true, consistent with the existing DSL step descriptor model.
2. WHEN a URL criterion is supplied as a plain string, THE AssertRequest builder SHALL configure the Request_Matcher to match a Captured_Request only when the Captured_Request URL equals the supplied string exactly (character-for-character, case-sensitive, including scheme, host, path, and query if present).
3. WHERE a URL criterion is supplied as a pattern (regular expression or glob), THE AssertRequest builder SHALL configure the Request_Matcher to match a Captured_Request when the Captured_Request URL satisfies the supplied pattern, treating a match anywhere in the URL as a match unless the pattern is anchored.
4. WHEN an HTTP method criterion is supplied, THE AssertRequest builder SHALL configure the Request_Matcher to match a Captured_Request when the Captured_Request method equals the supplied method compared case-insensitively, accepting any of GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS, or any other non-empty method token.
5. IF an HTTP method criterion is supplied that is empty or not a valid HTTP method token, THEN THE Runtime SHALL fail the AssertRequest step, without matching any Captured_Request.
6. WHEN a query parameter criterion is supplied as a set of key/value pairs, THE AssertRequest builder SHALL configure the Request_Matcher to match a Captured_Request when, for every supplied pair, the Captured_Request query string contains that key with an equal value (case-sensitive value comparison, subset match), ignoring any additional query parameters present on the Captured_Request.
7. WHEN a request body criterion is supplied, THE AssertRequest builder SHALL configure the Request_Matcher to match a Captured_Request as follows: for a JSON body, the supplied fields SHALL match by structural equality as a subset of the Captured_Request parsed JSON body; for a form-encoded body, the supplied key/value pairs SHALL match as a subset of the Captured_Request parsed form fields; for a raw body, the supplied value SHALL equal the Captured_Request raw body exactly (case-sensitive).
8. IF a request body criterion specifies a JSON or form body but the Captured_Request body cannot be parsed as that type, THEN THE Runtime SHALL treat the Captured_Request as not matching the body criterion.
9. WHEN a response status code criterion is supplied as a single integer in the range 100 to 599, THE AssertRequest builder SHALL configure the Request_Matcher to match a Captured_Request when the Captured_Request response status code equals that integer exactly.
10. WHERE a response status code criterion is supplied as a range (for example a class such as 4xx or an explicit lower and upper bound), THE AssertRequest builder SHALL configure the Request_Matcher to match a Captured_Request when the Captured_Request response status code falls within that inclusive range.
11. WHERE an AssertRequest specifies multiple criteria, THE Runtime SHALL treat a Captured_Request as matching only when the Captured_Request satisfies every specified criterion (logical AND).
12. IF no Captured_Request satisfies every specified criterion, THEN THE Runtime SHALL fail the AssertRequest step and report an error message indicating which criteria were not satisfied.

### Requirement 7: AssertRequest evaluation and existence assertions

**User Story:** As a test author, I want to assert that a matching request did or did not occur, so
that I can confirm expected server interactions and the absence of unexpected ones.

#### Acceptance Criteria

1. WHEN the Runtime evaluates an AssertRequest that expects a matching request, THE Runtime SHALL pass
   the assertion IF at least one Captured_Request from the current run satisfies the Request_Matcher.
2. WHEN the Runtime evaluates an AssertRequest that expects a matching request AND no Captured_Request
   satisfies the Request_Matcher, THEN THE Runtime SHALL fail the assertion.
3. THE AssertRequest builder SHALL provide a way to assert that no Captured_Request satisfies the
   Request_Matcher.
4. WHEN the Runtime evaluates an AssertRequest that asserts no matching request AND at least one
   Captured_Request satisfies the Request_Matcher, THEN THE Runtime SHALL fail the assertion.
5. WHEN the Runtime evaluates an AssertRequest that asserts no matching request AND no Captured_Request
   satisfies the Request_Matcher, THE Runtime SHALL pass the assertion.

### Requirement 8: AssertRequest count assertions

**User Story:** As a test author, I want to assert a request occurred a specific number of times, so
that I can validate exact call counts, such as retries or deduplication.

#### Acceptance Criteria

1. THE AssertRequest builder SHALL provide a way to assert that the number of Captured_Requests
   satisfying the Request_Matcher equals a specified count.
2. WHEN the Runtime evaluates an AssertRequest count assertion AND the number of matching
   Captured_Requests equals the specified count, THE Runtime SHALL pass the assertion.
3. WHEN the Runtime evaluates an AssertRequest count assertion AND the number of matching
   Captured_Requests differs from the specified count, THEN THE Runtime SHALL fail the assertion.

### Requirement 9: Reporting AssertRequest outcomes in the run log

**User Story:** As a test author, I want AssertRequest results shown in the run log, so that I can see
pass/fail outcomes and understand why an assertion failed.

#### Acceptance Criteria

1. WHEN an AssertRequest passes, THE Run_Log SHALL display the AssertRequest step with a passed
   status.
2. WHEN an AssertRequest fails, THE Run_Log SHALL display the AssertRequest step with a failed status.
3. WHEN an AssertRequest fails, THE Run_Log SHALL display a failure message stating the
   Request_Matcher criteria and the observed result, including the number of Captured_Requests that
   satisfied the Request_Matcher.
4. IF the Run_Log display system fails or is unavailable when attempting to display an AssertRequest
   outcome, THEN THE Runtime SHALL halt test execution.

### Requirement 10: Persistence of captured requests

**User Story:** As a test author, I want captured requests stored with the run results, so that I can
inspect server interactions after the run has finished.

#### Acceptance Criteria

1. WHEN a run completes, THE Runtime SHALL persist each Captured_Request as part of the Run_Data
   through `packages/extension/src/storage.js`.
2. THE persisted Captured_Request SHALL include the request URL, the HTTP method, the query
   parameters, the request body, the response status code, the response body, and the Step_Attribution.
3. WHEN a persisted run is reopened in the Run_Log, THE Run_Log SHALL display the persisted
   Captured_Requests grouped with their attributed steps.
4. IF persisting a Captured_Request as part of the Run_Data fails during or at the end of a run, THEN
   THE Runtime SHALL fail the entire run.

### Requirement 11: Unmasked sensitive data capture

**User Story:** As a test author, I want captured request and response data recorded exactly as sent,
so that I have full-fidelity data for debugging server interactions.

#### Acceptance Criteria

1. WHEN a Captured_Request is recorded, THE Network_Capture_Service SHALL store the request and response values byte-for-byte as sent and received, applying no masking, redaction, truncation, substitution, or placeholder characters to authentication tokens, session cookies, API keys, or passwords present in the URL, query parameters, headers, or bodies.
2. WHEN a Captured_Request is recorded, THE Network_Capture_Service SHALL introduce no redaction placeholder sequence into a stored value that was not present in the originally transmitted data.
3. WHEN a Network_Log_Entry is displayed, THE Run_Log SHALL display each captured value character-for-character identical to the stored value, with no masking or truncation.
4. WHEN a Captured_Request is persisted and later reloaded, THE Runtime SHALL persist and restore the captured values byte-for-byte identical to the originally captured values.
