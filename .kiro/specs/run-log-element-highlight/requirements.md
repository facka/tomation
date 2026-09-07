# Requirements Document

## Introduction

This feature lets a user visually connect a step shown in the execution log to the actual DOM element it acted on. While a run is displayed in the Run View, hovering the pointer over a log entry highlights the corresponding element on the page; moving the pointer away removes that highlight.

To correlate a log entry with its DOM element, the Runtime tags each element it resolves with a `tomation-key` attribute whose value is the step's element key. When the user hovers a log entry, the panel sends a hover-highlight request identifying that key; the Runtime finds every element carrying the matching `tomation-key` and applies a hover highlight that is visually distinct from the existing action highlight (`data-tomation-active`).

Because an element is only tagged once the Runtime has resolved it, only executed steps whose element was found are hoverable. Steps that never resolved an element (failed find, or non-element actions such as navigate/wait/manual) produce no hover highlight. The existing action-highlight behavior, element-matching semantics, and find-trace behavior are preserved unchanged.

The primary purpose of this feature is diagnostic: sometimes the Element_Finder resolves the wrong element because the locator definition is wrong rather than because of a bug. Showing which element was actually found lets the user confirm whether Tomation matched the intended element and, if not, correct the locator. This applies to successful and passing steps as well, because a step can pass while acting on the wrong element, so completed and passing log entries must remain inspectable after the run.

Because the `tomation-key` tag lives on the DOM element, a later step in the same run can remove that element, either by navigating and replacing the document or by removing part of the DOM in place. As a result, hovering a completed step can legitimately find no matching element. When a step that did resolve an element during the run no longer has a matching element in the DOM, the panel informs the user that the element has been removed rather than silently doing nothing.

## Glossary

- **Run_View**: The panel view (`RunView.vue`, rendering `LogEntry.vue` rows via the log container) that displays the ordered execution log of a run.
- **Log_Entry**: A single rendered row in the Run_View execution log, corresponding to one executed step. A Log_Entry may carry a `target` value (the Element_Key of the step's element).
- **Element_Key**: The string key identifying an element descriptor in the spec's `pageElements` map. It is the value of a step's `target` and is displayed as the element badge in a Log_Entry.
- **Page_Element_Descriptor**: The entry in `pageElements` describing how to locate an element (`tag`, `where`, `xpath`, `childOf`, `navigate`).
- **Runtime**: The content-script executor (`runtime.js`) that resolves and acts on DOM elements on the page.
- **Element_Finder**: The Runtime resolution logic (`findElementWithParent` / `findElement`, including `childOf` scoping and `navigate` hops) that resolves a step's descriptor to a concrete DOM element.
- **Resolved_Element**: The single DOM element that the Element_Finder resolved for a given step (the element to which the step's action is applied).
- **Tomation_Key_Attribute**: The DOM attribute `tomation-key`, set by the Runtime on a Resolved_Element, whose value is the step's Element_Key. Used to locate elements by key for hover highlighting. The Tomation_Key_Attribute persists on the Resolved_Element after the step completes and is not tied to the Action_Highlight lifecycle; it remains on the element until the element is removed from the DOM by later navigation or DOM removal. The Tomation_Key_Attribute is set for every step that resolves an element, including assert and save targets, not only click or type steps.
- **Element_Removed_Message**: A message shown in the Run_View, associated with a specific Log_Entry, indicating that the element this step acted on during the run is no longer present in the current DOM (for example, removed by a later navigation or DOM change).
- **Action_Highlight**: The existing highlight the Runtime applies to an element while its step's action executes, implemented via the `data-tomation-active="true"` attribute and its injected outline CSS.
- **Hover_Highlight**: The visual highlight applied to DOM element(s) while the user hovers the corresponding Log_Entry, visually distinct from the Action_Highlight.
- **Hover_Highlight_Request**: The message sent from the panel toward the Runtime asking it to apply the Hover_Highlight to elements matching a given Element_Key.
- **Hover_Clear_Request**: The message sent from the panel toward the Runtime asking it to remove any active Hover_Highlight.
- **Background**: The extension background service worker (`background.js`) that relays messages between the panel and the Runtime on the locked tab.

## Requirements

### Requirement 1: Tag resolved elements with the element key

**User Story:** As a test author, I want each element the runtime acts on to carry its element key in the DOM, so that the panel can later find that element by key to highlight it.

#### Acceptance Criteria

1. WHEN the Element_Finder resolves a Resolved_Element for a step whose Element_Key (the step's `target`) is a non-empty string, THE Runtime SHALL set the `tomation-key` Tomation_Key_Attribute on the Resolved_Element, before applying the Action_Highlight, to a value exactly equal to the raw Element_Key string.
2. WHERE a step carries no Element_Key or an empty Element_Key, THE Runtime SHALL not add, modify, or remove the Tomation_Key_Attribute for that step.
3. IF the Element_Finder fails to resolve a Resolved_Element for a step, THEN THE Runtime SHALL set no Tomation_Key_Attribute for that step and SHALL leave any existing Tomation_Key_Attribute values on the page unchanged.
4. WHEN the Runtime re-resolves an element for a step that carries an Element_Key, THE Runtime SHALL leave the Resolved_Element carrying exactly one Tomation_Key_Attribute whose value equals that step's Element_Key.
5. WHEN the Runtime sets the Tomation_Key_Attribute on a Resolved_Element, THE Runtime SHALL resolve the same Resolved_Element it would have resolved without setting the attribute, preserving element-matching semantics unchanged.
6. WHEN a step that set the Tomation_Key_Attribute on its Resolved_Element completes, THE Runtime SHALL leave the Tomation_Key_Attribute in place on that element and SHALL NOT remove the Tomation_Key_Attribute on step completion, so that the element remains identifiable by key after the step and after the run.

### Requirement 2: Preserve the existing action highlight

**User Story:** As a user watching a run, I want the existing "currently acting on this element" highlight to keep working, so that adding hover highlighting does not change what I already rely on.

#### Acceptance Criteria

1. WHEN a step's action begins executing, THE Runtime SHALL apply the Action_Highlight to the Resolved_Element by setting the `data-tomation-active` attribute to `"true"`.
2. WHEN a step completes, THE Runtime SHALL remove the Action_Highlight from the Resolved_Element by removing the `data-tomation-active` attribute, regardless of whether the step succeeded or failed.
3. THE Runtime SHALL keep the Action_Highlight and the Tomation_Key_Attribute as independent attributes, such that setting or clearing either attribute leaves the other attribute's presence and value unchanged.
4. WHEN both the Action_Highlight and the Hover_Highlight apply to the same element, THE Runtime SHALL render both highlights simultaneously such that each highlight remains individually observable.
5. WHEN the Runtime removes the Action_Highlight (`data-tomation-active`) from an element on step completion, THE Runtime SHALL leave that element's Tomation_Key_Attribute present and unchanged.

### Requirement 3: Highlight the DOM element on log-entry hover

**User Story:** As a user reviewing the execution log, I want to hover a log entry and see the matching element highlighted on the page, so that I can identify which element a step referred to.

#### Acceptance Criteria

1. WHEN the pointer has remained within a Log_Entry that carries an Element_Key for at least 100 milliseconds, THE Run_View SHALL issue exactly one Hover_Highlight_Request identifying that Element_Key.
2. WHEN the Runtime receives a Hover_Highlight_Request for an Element_Key, THE Runtime SHALL apply the Hover_Highlight to every DOM element whose Tomation_Key_Attribute value equals that Element_Key.
3. WHERE a Log_Entry does not carry an Element_Key, THE Run_View SHALL issue no Hover_Highlight_Request when the pointer enters that Log_Entry.
4. IF a Hover_Highlight_Request identifies an Element_Key for which no DOM element carries a matching Tomation_Key_Attribute, THEN THE Runtime SHALL apply no Hover_Highlight and SHALL report the not-found outcome to the Run_View, such that the response indicates whether at least one matching element was found.
5. WHEN a Hover_Highlight_Request identifies an Element_Key matched by more than one DOM element, THE Runtime SHALL apply the Hover_Highlight to all matching elements.
6. WHEN a matching element is found for a Hover_Highlight_Request and that element is not currently within the viewport, THE Runtime SHALL scroll the matched element into view.
7. WHEN a matching element is found for a Hover_Highlight_Request and that element is already within the viewport, THE Runtime SHALL NOT scroll and SHALL highlight the element in place.
8. WHEN a Hover_Highlight_Request is matched by more than one DOM element and the first matched element is not currently within the viewport, THE Runtime SHALL scroll the first matched element into view.
9. WHEN the pointer leaves a Log_Entry for which a Hover_Highlight_Request was issued, THE Run_View SHALL request removal of the Hover_Highlight and THE Runtime SHALL remove the Hover_Highlight from every DOM element to which it was applied.
10. IF the Run_View issues a Hover_Highlight_Request while the run is not active or the target tab is closed, THEN THE Runtime SHALL apply no Hover_Highlight and SHALL leave the DOM unchanged.

### Requirement 4: Remove the highlight on un-hover

**User Story:** As a user, I want the highlight to disappear when I move the pointer off a log entry, so that only the element I am currently pointing at is highlighted.

#### Acceptance Criteria

1. WHEN the pointer leaves a Log_Entry for which a Hover_Highlight_Request was issued, THE Run_View SHALL issue exactly one Hover_Clear_Request.
2. WHEN the Runtime receives a Hover_Clear_Request, THE Runtime SHALL remove the Hover_Highlight from every DOM element currently carrying it, leaving zero elements with the Hover_Highlight applied.
3. WHEN the pointer moves directly from one Log_Entry to another Log_Entry, THE Run_View SHALL issue the Hover_Clear_Request for the first Log_Entry before issuing the Hover_Highlight_Request for the second Log_Entry, such that at no observable point are the elements of both Log_Entries carrying the Hover_Highlight simultaneously.
4. WHEN the Runtime removes the Hover_Highlight from an element, THE Runtime SHALL leave that element's Action_Highlight state unchanged.
5. IF the Run_View is unmounted or its displayed view changes while a Log_Entry is hovered and its Hover_Highlight_Request is outstanding, THEN THE Run_View SHALL issue a Hover_Clear_Request before the hovered Log_Entry is removed from the display.

### Requirement 5: Deliver hover requests to the runtime

**User Story:** As a developer, I want hover requests routed to the runtime on the page under test, so that the correct tab's DOM is highlighted.

#### Acceptance Criteria

1. WHEN the Run_View issues a Hover_Highlight_Request or a Hover_Clear_Request while a locked tab exists and its Runtime is reachable, THE Background SHALL relay that request to the Runtime on the locked tab within 200 milliseconds of receipt.
2. IF the Background cannot deliver a Hover_Highlight_Request or a Hover_Clear_Request to the Runtime because no locked tab exists, the locked tab has been closed, or no Runtime is reachable on the locked tab, THEN THE Background SHALL discard the request, leave the active run unaffected, and produce no user-visible error.
3. IF the Run_View issues a Hover_Highlight_Request or a Hover_Clear_Request while no run is active, THEN THE Background SHALL discard the request and take no relay action.

### Requirement 6: Clear stale key tags on navigation

**User Story:** As a user, I want highlighting to reflect the current page, so that hovering a log entry never highlights a stale element from a previous page.

#### Acceptance Criteria

1. WHEN the page under test completes loading a new document, THE Runtime SHALL treat all Tomation_Key_Attribute tags associated with the previous document as no longer present.
2. WHEN the page under test completes loading a new document, THE Runtime SHALL re-inject the content script into the new document before processing any Hover_Highlight_Request against it.
3. IF a Hover_Highlight_Request identifies an Element_Key for which no element bearing the matching Tomation_Key_Attribute exists in the current document, THEN THE Runtime SHALL apply no Hover_Highlight and SHALL leave any existing Hover_Highlight unchanged.
4. IF a Hover_Highlight_Request identifies an Element_Key for which exactly one element bearing the matching Tomation_Key_Attribute exists in the current document, THEN THE Runtime SHALL apply the Hover_Highlight to that element.
5. WHEN the page under test has loaded a new document and the pointer hovers a Log_Entry whose step resolved an element on a previous document, THE Runtime SHALL report no matching element and THE Run_View SHALL display the Element_Removed_Message for that Log_Entry, matching the outcome for in-document removal.

### Requirement 7: Distinct hover highlight styling

**User Story:** As a user, I want the hover highlight to look distinct from the action highlight, so that I can tell "I am pointing at this" apart from "the runtime is acting on this".

#### Acceptance Criteria

1. THE Runtime SHALL apply the Hover_Highlight using a page-injected style targeting its own dedicated element attribute, separate from the attribute selector used by the Action_Highlight injected style.
2. THE Runtime SHALL define the Hover_Highlight injected style so that it renders at least one visual outline property (outline color or box-shadow color) with a value different from the corresponding value used by the Action_Highlight injected style.
3. WHEN the Hover_Highlight is applied to an element, THE Runtime SHALL apply it without modifying the injected Action_Highlight style and without modifying the element's own author-defined styles.
4. WHEN the Hover_Highlight is removed from an element, THE Runtime SHALL restore that element to the visual state it had before the Hover_Highlight was applied, leaving any concurrently applied Action_Highlight on that element unchanged.

### Requirement 8: Report when a step's element has been removed

**User Story:** As a test author, I want to be told when the element a step acted on is no longer in the DOM, so that I understand why no highlight appeared and can tell removal apart from a wrong locator.

#### Acceptance Criteria

1. WHEN the pointer hovers a Log_Entry whose step resolved an element during the run AND the Runtime reports that no element currently carries the matching Tomation_Key_Attribute, THE Run_View SHALL display an Element_Removed_Message associated with that Log_Entry.
2. WHERE a hovered Log_Entry's step did not resolve an element during the run (a failed find or a non-element step), THE Run_View SHALL display no Element_Removed_Message.
3. WHEN a Hover_Highlight_Request for a Log_Entry results in at least one matching element being highlighted, THE Run_View SHALL display no Element_Removed_Message for that Log_Entry.
4. WHEN the pointer leaves a Log_Entry showing an Element_Removed_Message, THE Run_View SHALL remove that Element_Removed_Message.
5. THE Run_View SHALL present the Element_Removed_Message inline in association with the specific Log_Entry rather than as a global notification.
