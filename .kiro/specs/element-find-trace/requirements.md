# Requirements Document

## Introduction

When a Tomation step fails because an element cannot be located, the developer currently sees only a single opaque error string (for example, `Element not found: button with conditions {"textIs":"Submit"}`). That string does not explain what the finder actually attempted: whether the tag matched any candidates, which `where` matcher filtered them out, whether the parent resolved, whether the finder timed out waiting for async rendering, or which label/navigate/XPath strategy failed.

This feature introduces a **find trace**: a structured, ordered record of the work the element finder performed while trying to locate an element. On failure, the finder builds the trace, attaches it to the failure result, propagates it through the existing message protocol (STEP_RESULT → LOG), stores it in the panel store, and renders it in the side panel as a collapsible "Why did this fail?" disclosure beneath the failed step's error line.

To keep the success path fast, the detailed per-candidate breakdown is built once — after the 5-second poll timeout fires — rather than on every animation frame.

## Glossary

- **Tomation_Finder**: The element-resolution subsystem in the content-script runtime (`packages/extension/src/runtime.js`) responsible for locating a DOM element from a step's element descriptor. Comprises `findElementWithParent`, `findElement`, `matchesWhere`, `matchClosestLabel`, and `applyNavigateSteps`.
- **Background_Service**: The extension background script (`packages/extension/src/background.js`) that relays STEP_RESULT responses from the content script to LOG messages for the panel.
- **Panel_Store**: The panel state module (`packages/extension/panel-vue/src/store/index.ts`) that receives LOG messages and records per-step log entries via `setStepStatus`.
- **Run_Log_View**: The side-panel component that renders each step's result row (`packages/extension/panel-vue/src/components/LogEntry.vue`).
- **Find_Trace**: A structured, ordered data record describing the steps the Tomation_Finder took to locate an element during a single resolution attempt, including scope, candidate counts, per-matcher outcomes, parent resolution outcome, timeout-versus-absent determination, closestLabel strategy outcome, navigate hop outcomes, and XPath expression and result. The Find_Trace is attached to a failure result.
- **Element_Descriptor**: The object describing the element to locate, containing `tag` and `where`, or `xpath`, and optionally `navigate` hops. Delivered on the EXECUTE_STEP message.
- **Parent_Descriptor**: An optional Element_Descriptor describing a `childOf` parent element that scopes the child search.
- **Candidate**: A DOM element returned by `root.querySelectorAll(tag)` (for the tag+where strategy) that the Tomation_Finder evaluates against the `where` conditions. Candidate count is the number of such elements found in the search scope.
- **Where_Matcher**: A single key/value condition within a descriptor's `where` object (for example `textIs`, `classIncludes`, `closestLabel`). All Where_Matchers in a `where` object are combined as AND conditions; an element matches only when every Where_Matcher passes. Supported keys: `id`, `textIs`, `textContains`, `classIncludes`, `placeholder`, `name`, `type`, `value`, `ariaLabel`, `role`, `title`, `hrefContains`, `isDisabled`, `dataAttr`, `nthChild`, `closestLabel`.
- **Near_Miss_Candidate**: Among all Candidates evaluated in the failing scope, the single Candidate that satisfied the greatest number of Where_Matchers before failing at least one. Represents the element that came closest to matching and is the focus of the per-matcher breakdown. When no Candidate satisfies any Where_Matcher, the Near_Miss_Candidate is undefined.

## Requirements

### Requirement 1: Capture a find trace on element-not-found failure

**User Story:** As a Tomation test developer, I want the finder to record a structured trace of its resolution steps whenever an element cannot be found, so that I can understand why the element was not located instead of reading a single opaque error string.

#### Acceptance Criteria

1. WHEN the Tomation_Finder fails to locate an element for a step, THE Tomation_Finder SHALL produce a Find_Trace describing the resolution attempt.
2. WHEN the Tomation_Finder produces a Find_Trace, THE Tomation_Finder SHALL attach the Find_Trace to the failure result returned for the step such that the Find_Trace is retrievable from that failure result.
3. THE Find_Trace SHALL record the search scope for the failing resolution as one of exactly two values: whole-document, or parent-scoped; and WHEN the scope is parent-scoped, THE Tomation_Finder SHALL include an identifier of the parent scope in the Find_Trace.
4. THE Find_Trace SHALL record an ordered sequence of the resolution steps the Tomation_Finder performed, where each entry records the resolution strategy attempted and its outcome as either matched or not-matched.
5. WHEN the Tomation_Finder locates an element successfully, THE Tomation_Finder SHALL return the success result without a Find_Trace.
6. THE Find_Trace SHALL preserve the existing human-readable failure error string in addition to the structured trace data.
7. IF the Tomation_Finder performed no resolution steps before failing, THEN THE Tomation_Finder SHALL produce a Find_Trace whose ordered sequence of resolution steps is empty.
### Requirement 2: Record tag and where-matcher breakdown for the tag+where strategy

**User Story:** As a Tomation test developer, I want the trace to show how many candidates the tag matched and which where matcher filtered them out, so that I can distinguish "no candidates at all" from "candidates present but none matched" and see the exact failing condition.

#### Acceptance Criteria

1. WHEN a tag+where resolution fails, THE Tomation_Finder SHALL record in the Find_Trace the resolved `tag` and the Candidate count found in the search scope.
2. IF the Candidate count is zero, THEN THE Tomation_Finder SHALL record in the Find_Trace that no elements matched the `tag`.
3. WHEN the Candidate count is greater than zero, THE Tomation_Finder SHALL select as the Near_Miss_Candidate the Candidate satisfying the greatest number of Where_Matchers, and SHALL record in the Find_Trace, for that Near_Miss_Candidate, each Where_Matcher and whether it passed or failed.
4. WHEN a Where_Matcher fails on the Near_Miss_Candidate, THE Tomation_Finder SHALL record the expected value from the descriptor and the actual value observed on the Near_Miss_Candidate for that Where_Matcher, truncating each recorded value to a maximum of 256 characters.
5. WHEN recording the actual value for a `textIs` or `textContains` Where_Matcher, THE Tomation_Finder SHALL record the value such that leading and trailing whitespace are preserved and distinguishable from a value without that whitespace.
6. WHERE the descriptor contains multiple Where_Matchers, THE Tomation_Finder SHALL record which Where_Matchers passed and which Where_Matcher failed on the Near_Miss_Candidate.
7. IF the actual value for a failing Where_Matcher on the Near_Miss_Candidate cannot be observed, THEN THE Tomation_Finder SHALL record in the Find_Trace that the actual value was unavailable rather than omitting the Where_Matcher.
### Requirement 3: Distinguish timeout from genuine absence

**User Story:** As a Tomation test developer, I want to know whether the element never appeared during the wait window versus was never present at all, so that I can tell timing/async-rendering problems apart from wrong locators.

#### Acceptance Criteria

1. IF a resolution fails after the 5-second (5000-millisecond) poll window elapses AND the final failure-time pass observes no Candidate that satisfies all Where_Matchers AND zero Candidates were found in every poll frame across the entire wait window, THEN THE Tomation_Finder SHALL record in the Find_Trace an absence outcome classified as "absent-full-window" indicating the element was absent for the full wait window.
2. IF a resolution fails after the 5-second (5000-millisecond) poll window elapses AND the final failure-time pass observes no Candidate that satisfies all Where_Matchers AND at least one Candidate was found in one or more poll frames, THEN THE Tomation_Finder SHALL record in the Find_Trace an absence outcome classified as "present-unmatched" indicating Candidates were present but none matched the conditions, including the count of Candidates found in the final poll frame.
3. IF a resolution fails after the 5-second (5000-millisecond) poll window elapses AND the final failure-time pass observes at least one Candidate that satisfies ALL Where_Matchers, THEN THE Tomation_Finder SHALL record in the Find_Trace an absence outcome classified as "appeared-after-timeout" indicating a matching element appeared after the wait window elapsed.
4. WHEN the Find_Trace records "appeared-after-timeout", THE Tomation_Finder SHALL still return the element-not-found failure result for the step.
5. WHEN a resolution fails, THE Tomation_Finder SHALL record in the Find_Trace the elapsed wait duration in milliseconds, as an integer between 0 and 5000 inclusive, measured from resolution start to the poll frame in which failure was determined.
6. IF a resolution fails, THEN THE Tomation_Finder SHALL record exactly one absence outcome classification per resolution in the Find_Trace, selected from the set {"absent-full-window", "present-unmatched", "appeared-after-timeout"}.
### Requirement 4: Record parent (childOf) resolution outcome

**User Story:** As a Tomation test developer, I want the trace to show whether the parent element resolved and whether the child was searched inside it, so that I can tell a failed parent apart from a child that is missing from a resolved parent.

#### Acceptance Criteria

1. WHERE the step provides a Parent_Descriptor, THE Tomation_Finder SHALL record in the Find_Trace the parent resolution outcome as either resolved or not-resolved.
2. IF the parent element is not resolved, THEN THE Tomation_Finder SHALL record in the Find_Trace that the failure occurred while resolving the parent and SHALL identify the parent by its descriptor.
3. WHEN the parent element is resolved but the child is not found within the parent subtree, THE Tomation_Finder SHALL record in the Find_Trace that the parent resolved and that the child search was scoped to the parent subtree.
4. WHEN the parent element is resolved, THE Tomation_Finder SHALL record in the Find_Trace a non-empty identifier for the resolved parent element sufficient to distinguish it from other elements on the page.
5. IF the Parent_Descriptor matches more than one element, THEN THE Tomation_Finder SHALL record in the Find_Trace the count of matched parent elements and SHALL identify the parent element used to scope the child search.
### Requirement 5: Record closestLabel strategy outcome

**User Story:** As a Tomation test developer, I want the trace to show which closestLabel strategy ran and failed, so that I can understand why a label-based match did not resolve.

#### Acceptance Criteria

1. WHERE a Where_Matcher of type `closestLabel` is evaluated on the Near_Miss_Candidate and fails, THE Tomation_Finder SHALL record in the Find_Trace the name of each closestLabel strategy that was attempted and, for each, its outcome as either matched or not-matched.
2. THE Tomation_Finder SHALL record in the Find_Trace the label tag and the label text expected by the `closestLabel` Where_Matcher, truncating recorded label text to a maximum of 256 characters.
3. IF the `closestLabel` Where_Matcher has no expected label text, THEN THE Tomation_Finder SHALL record in the Find_Trace an indication that the expected label text was absent.
4. WHEN the `closestLabel` evaluation runs inside a parent-scoped subtree, THE Tomation_Finder SHALL record in the Find_Trace that the label search was bounded to the parent subtree.
5. WHEN the `closestLabel` evaluation runs unbounded, THE Tomation_Finder SHALL record in the Find_Trace, for the `for`-attribute strategy, the ancestor-walk strategy, and the `aria-labelledby` strategy, each strategy's outcome as either matched or not-matched.
### Requirement 6: Record navigate hop outcome

**User Story:** As a Tomation test developer, I want the trace to show which navigate hop failed, so that I can fix the DOM traversal that broke.

#### Acceptance Criteria

1. WHERE the Element_Descriptor contains one or more `navigate` hops, WHEN a hop resolves to zero elements, THE Tomation_Finder SHALL record in the Find_Trace the zero-based index of the first failing hop within the hop sequence.
2. WHEN a navigate hop fails to resolve, THE Tomation_Finder SHALL record in the Find_Trace both the hop type and the zero-based index of that failing hop.
3. WHEN navigate hops are applied, THE Tomation_Finder SHALL record in the Find_Trace whether the anchor element was resolved to exactly one element before the hops were applied.
4. IF the anchor element fails to resolve to exactly one element before navigate hops are applied, THEN THE Tomation_Finder SHALL record in the Find_Trace an anchor-resolution-failure indication, SHALL record that no navigate hops were attempted, and SHALL leave the Find_Trace hop records for that descriptor otherwise unchanged.
### Requirement 7: Record XPath resolution outcome

**User Story:** As a Tomation test developer, I want the trace to show the evaluated XPath expression and whether it returned a node, so that I can debug XPath-based locators.

#### Acceptance Criteria

1. WHERE the Element_Descriptor contains an `xpath` value, WHEN the Tomation_Finder attempts resolution, THE Tomation_Finder SHALL record in the Find_Trace the exact evaluated XPath expression string.
2. WHEN an XPath resolution returns exactly one node, THE Tomation_Finder SHALL record in the Find_Trace that the XPath evaluation returned a node and the elapsed resolution time in milliseconds.
3. WHEN an XPath resolution returns more than one node, THE Tomation_Finder SHALL record in the Find_Trace the count of matched nodes.
4. IF an XPath resolution returns no node before the configured wait duration elapses, THEN THE Tomation_Finder SHALL record in the Find_Trace that the XPath evaluation returned no node, the configured wait duration in milliseconds, and the elapsed time in milliseconds.
5. IF the `xpath` value is a malformed XPath expression that cannot be evaluated, THEN THE Tomation_Finder SHALL record in the Find_Trace that the expression is invalid and SHALL record the evaluated XPath expression string.
### Requirement 8: Build the detailed trace once at the moment of failure

**User Story:** As a Tomation maintainer, I want the detailed per-candidate breakdown built only after the timeout fires, so that the success path and each poll frame stay fast and low-overhead.

#### Acceptance Criteria

1. WHILE the Tomation_Finder is polling for a Candidate within the wait window, THE Tomation_Finder SHALL NOT build the per-Where_Matcher breakdown for any Candidate.
2. WHEN the wait window elapses without a successful match, THE Tomation_Finder SHALL perform exactly one final pass over all Candidates in the failing scope to build the per-Where_Matcher breakdown.
3. IF the wait window elapses without a successful match and the failing scope contains zero Candidates, THEN THE Tomation_Finder SHALL complete the final pass producing an empty per-Where_Matcher breakdown and no Near_Miss_Candidate.
4. WHEN the Tomation_Finder locates an element within the wait window, THE Tomation_Finder SHALL complete resolution without performing the per-Where_Matcher breakdown pass and without designating a Near_Miss_Candidate.
5. WHEN the Tomation_Finder performs the single final pass, THE Tomation_Finder SHALL designate at most one Candidate as the Near_Miss_Candidate, selecting the Candidate satisfying the greatest number of Where_Matchers.
### Requirement 9: Propagate the find trace through the message protocol

**User Story:** As a Tomation test developer, I want the trace to travel from the content script to the panel, so that the side panel can display it.

#### Acceptance Criteria

1. WHEN the Tomation_Finder attaches a Find_Trace to a failure result, THE Tomation_Finder SHALL include that same Find_Trace, unchanged, on the STEP_RESULT response it sends to the Background_Service.
2. WHEN the Background_Service forwards a failed STEP_RESULT that carries a Find_Trace as a LOG message, THE Background_Service SHALL include the same Find_Trace, unchanged, on the LOG message.
3. IF the Background_Service forwards a STEP_RESULT that carries no Find_Trace (success results and non-element steps), THEN THE Background_Service SHALL emit the LOG message with the Find_Trace field absent.
4. THE STEP_RESULT response and the LOG message SHALL each define the Find_Trace as an optional field so that success results and non-element steps omit it while failure results include it.
5. WHEN the Panel_Store receives a LOG message that carries a Find_Trace, THE Panel_Store SHALL store that Find_Trace on the log entry corresponding to the same step result that produced the LOG message.
6. IF the Panel_Store receives a LOG message that carries a Find_Trace but no existing log entry corresponds to that step result, THEN THE Panel_Store SHALL discard the Find_Trace, retain all existing log entries unchanged, and raise no error to the user.
7. THE LogEntry record in the Panel_Store SHALL define the Find_Trace as an optional field so that entries without a trace remain unaffected.
### Requirement 10: Render the find trace in the side panel

**User Story:** As a Tomation test developer, I want a collapsible "Why did this fail?" disclosure under the failed step, so that I can inspect the passed conditions, the failing condition, and candidate counts without leaving the run log.

#### Acceptance Criteria

1. WHERE a failed log entry in the Run_Log_View carries a Find_Trace, THE Run_Log_View SHALL render a "Why did this fail?" disclosure beneath the step's error line, initially collapsed.
2. WHILE the disclosure is collapsed, THE Run_Log_View SHALL keep the existing error line as the only visible failure text for the step.
3. WHEN the developer expands the disclosure, THE Run_Log_View SHALL display the search scope and the Candidate count.
4. WHEN the developer expands the disclosure, THE Run_Log_View SHALL display the Where_Matchers that passed and the Where_Matcher that failed with its expected and actual values.
5. WHERE the passed Where_Matchers exceed 50 entries, THE Run_Log_View SHALL display the first 50 passed Where_Matchers and a count of the remaining passed Where_Matchers.
6. WHEN the developer collapses an expanded disclosure, THE Run_Log_View SHALL return to displaying only the error line for the step.
7. WHERE the Find_Trace records a parent resolution outcome, THE Run_Log_View SHALL display whether the parent resolved and whether the child search was scoped to the parent subtree.
8. WHERE the Find_Trace records a timeout-versus-absent determination, THE Run_Log_View SHALL display whether the element was absent for the wait window or present but unmatched.
9. WHERE the Find_Trace records a closestLabel, navigate, or XPath outcome, THE Run_Log_View SHALL display the corresponding strategy, hop, or expression detail.
10. WHERE a failed log entry does not carry a Find_Trace, THE Run_Log_View SHALL render the step's error line unchanged.
### Requirement 11: Cover element-dependent actions within scope

**User Story:** As a Tomation test developer, I want the find trace for every action that requires locating an element, so that debugging works consistently across step types.

#### Acceptance Criteria

1. WHEN an element-not-found failure occurs for a `click`, `type`, `typePassword`, `select`, `assertExists`, `assertHasText`, `waitFor`, `upload`, `saveText`, `saveAttribute`, `saveValue`, or `pressKey`-with-target step, THE Tomation_Finder SHALL produce a Find_Trace for that failure.
2. WHEN a step that fails to locate an element uses a Parent_Descriptor, a `navigate` hop sequence, an `xpath` value, or a `closestLabel` Where_Matcher, THE Tomation_Finder SHALL produce a Find_Trace covering that resolution mode.
3. WHEN the Tomation_Finder produces a Find_Trace for a failed element-dependent step, THE Find_Trace SHALL identify the action of the step it was produced for.
4. WHERE a step does not require locating an element, THE Tomation_Finder SHALL NOT produce a Find_Trace for that step.
## Considerations (not committed for this iteration)

- **assertNotExists**: For `assertNotExists`, the failure condition is the opposite — the step fails because the element *was* found. A Find_Trace that explains what was located (which Candidate matched and where) would help debug these failures, but this is a lower-priority consideration and is not a committed requirement for this iteration.

## Out of Scope

- Changing element matching semantics or the 5-second timeout behavior.
- AI-assisted suggestions for fixing failed locators.
