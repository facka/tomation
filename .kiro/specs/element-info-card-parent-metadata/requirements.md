# Requirements Document

## Introduction

This feature improves how the Run View's Element Info Card presents an element's `childOf` resolution chain, makes hover-to-highlight more reliable and better explained, and makes failed-step debugging easier by tagging every resolved ancestor element with its own `tomation-key`.

Today the Element Info Card shows full metadata (tag, where matcher(s), navigate, key) for the inspected element itself, but each parent in the chain shows only a tag chip. The card is a popup opened from a Run View log-entry row. This feature lets each parent row reveal the same metadata the self node shows, expanding inline within the single card rather than opening a second popup.

Hovering a chain row (the self node or a parent) highlights the corresponding element on the page when that element was found during the run and still exists in the DOM, reusing the existing hover-highlight protocol and the "removed" notice. Because a parent is only precisely identifiable when the Runtime tagged the exact instance it resolved, this feature extends the Runtime to tag every resolved ancestor in the `childOf` chain with its own `tomation-key`, not just the immediate scope parent it resolves today.

An element can be found yet remain invisible because one of its ancestor containers is hidden (for example `display:none`, `visibility:hidden`, zero size, or clipping via `overflow`). In that case the injected hover/action highlight is not observable even though the element exists. This feature detects that condition and reports it inside the Element Info Card, without modifying the page's author styles to reveal the element.

When the inspected step failed because one of the parents in the `childOf` chain could not be resolved, the card also marks the specific parent row that failed, so the visual chain shows which link broke. This indication is derived from the step's existing find trace parent-resolution outcome (the Runtime already records `parent.resolved` and `parent.descriptorId` when a parent fails to resolve), so the card reads a supplied outcome rather than performing its own DOM resolution.

The existing element-matching semantics, the finder's 5-second timeout behavior, the Action Highlight (`data-tomation-active`), the parent-scoped child search (the finder resolves the `childOf` parent first and searches the child within that parent's subtree, not the whole document), and the run-log-element-highlight behavior are all preserved unchanged.

## Glossary

- **Run_View**: The panel view (`RunView.vue`, rendering `LogEntry.vue` rows) that displays the ordered execution log of a run.
- **Log_Entry**: A single rendered row in the Run_View execution log, corresponding to one executed step. A Log_Entry may carry a `target` value (the Element_Key of the step's element).
- **Element_Info_Card**: The popup component (`ElementInfoCard.vue`, `role="dialog"`) opened from a Log_Entry that displays the inspected element's metadata and its resolution chain. It closes on Escape or backdrop click.
- **Element_Key**: The string key identifying an element descriptor in the spec's `pageElements` map. It is the value of a step's `target`.
- **Page_Element_Descriptor**: The entry in `pageElements` describing how to locate an element (`tag`, `where`, `xpath`, `childOf`, `navigate`, `label`).
- **Element_Chain**: The ordered resolution chain for an inspected Element_Key, produced by `buildElementChain`: the inspected element first (the Self_Node), followed by each `childOf` ancestor walking up the `pageElements` map until there is no further `childOf`, an ancestor key is missing, or a cycle is detected.
- **Self_Node**: The first node of the Element_Chain, representing the inspected element itself.
- **Parent_Row**: A rendered row in the Element_Info_Card representing one ancestor node of the Element_Chain (every node after the Self_Node).
- **Chain_Node_Metadata**: The set of descriptor fields displayed for a node: Tag (`descriptor.tag`), Key (the node's Element_Key), Where matcher lines (from `descriptor.where`) or XPath (`descriptor.xpath`), and Navigate (`descriptor.navigate`).
- **Runtime**: The content-script executor (`runtime.js`) that resolves and acts on DOM elements on the page.
- **Element_Finder**: The Runtime resolution logic (`findElementWithParent` / `findElement`, including `childOf` scoping and `navigate` hops) that resolves a step's descriptor to a concrete DOM element.
- **Resolved_Element**: The single DOM element the Element_Finder resolved for a given node (the inspected element, or a scoping ancestor).
- **Resolved_Ancestor**: A DOM element the Element_Finder resolved as a `childOf` scope while locating a step's element (a parent or higher ancestor in the Element_Chain).
- **Tomation_Key_Attribute**: The DOM attribute `tomation-key`, set by the Runtime on a resolved element, whose value equals that node's Element_Key. Used to locate elements by key for hover highlighting.
- **Action_Highlight**: The existing highlight the Runtime applies to an element while its step's action executes, via `data-tomation-active="true"` and its injected outline CSS.
- **Hover_Highlight**: The visual highlight applied to DOM element(s) while the user hovers a chain row, via `data-tomation-hover="true"` and its injected CSS, visually distinct from the Action_Highlight.
- **Hover_Highlight_Request**: A message sent from the panel toward the Runtime asking it to apply the Hover_Highlight, identifying either an Element_Key (`HOVER_HIGHLIGHT`) or a descriptor (`HOVER_HIGHLIGHT_DESCRIPTOR`).
- **Hover_Clear_Request**: The `HOVER_CLEAR` message sent from the panel toward the Runtime asking it to remove any active Hover_Highlight.
- **Hover_Result**: The Runtime response to a Hover_Highlight_Request (`HOVER_RESULT`) reporting the `found` count of matched elements.
- **Element_Removed_Message**: A notice shown in the Element_Info_Card indicating that a node's element was resolved during the run but is no longer present in the current DOM.
- **Hidden_Ancestor**: An ancestor element of a matched element that prevents the matched element from being visible or rendered — for example `display:none`, `visibility:hidden`, `opacity:0`, zero size, or being clipped out of view by an `overflow` container — such that the Hover_Highlight applied to the matched element is not observable.
- **Hidden_Ancestor_Notice**: A notice shown in the Element_Info_Card indicating that a matched element exists but cannot be shown because a Hidden_Ancestor prevents its visibility.
- **Find_Trace**: The structured record the Runtime attaches to a failed step's result describing what the Element_Finder attempted, including its parent-resolution outcome. It is the value already available as `entry.findTrace` in `LogEntry.vue`.
- **Parent_Resolution_Outcome**: The portion of the Find_Trace recording whether the `childOf` parent was resolved: `{ resolved: false, descriptorId }` when the Element_Finder could not resolve the parent node, or `{ resolved: true, identifier, matchCount, scopedToParent }` when the parent resolved and the child search failed. The Element_Info_Card consumes this outcome rather than resolving elements itself.
- **Failed_Parent_Node**: The parent node in the Element_Chain whose descriptor matches the `descriptorId` reported by an unresolved Parent_Resolution_Outcome — the specific `childOf` link the Element_Finder could not resolve.
- **Parent_Not_Found_Indicator**: A visual marker the Element_Info_Card places on the Parent_Row corresponding to the Failed_Parent_Node, distinct from the collapsed and expanded row states and from the Element_Removed_Message, showing which link in the `childOf` chain failed to resolve.

## Requirements

### Requirement 1: Parent rows display full metadata via inline expansion

**User Story:** As a test author, I want each parent in the resolution chain to reveal the same metadata the inspected element shows, so that I can inspect the whole `childOf` chain without opening more popups.

#### Acceptance Criteria

1. THE Element_Info_Card SHALL render one Parent_Row for each ancestor node of the Element_Chain, in Element_Chain order (immediate parent first).
2. WHEN a Parent_Row is collapsed, THE Element_Info_Card SHALL display that node's label and, WHERE the node's descriptor is present, its tag, and SHALL indicate that the Parent_Row can be expanded.
3. WHEN the user activates a collapsed Parent_Row, THE Element_Info_Card SHALL expand that Parent_Row inline to reveal its Chain_Node_Metadata within the same Element_Info_Card.
4. WHEN a Parent_Row is expanded, THE Element_Info_Card SHALL display, for that node, its Tag WHERE the descriptor's `tag` is present, its Key, its XPath WHERE the descriptor's `xpath` is present otherwise its Where matcher lines WHERE the descriptor's `where` is present, and its Navigate WHERE the descriptor's `navigate` is present.
5. WHEN the user activates an expanded Parent_Row, THE Element_Info_Card SHALL collapse that Parent_Row and hide its Chain_Node_Metadata.
6. WHERE a Parent_Row's node has no descriptor in `pageElements`, THE Element_Info_Card SHALL display a not-defined-in-spec indication for that Parent_Row and SHALL display no Chain_Node_Metadata for it.
7. WHEN the user activates a Parent_Row, THE Element_Info_Card SHALL toggle only that Parent_Row's expansion state and SHALL leave the expansion state of every other Parent_Row unchanged, such that multiple Parent_Rows can be expanded at the same time.
8. WHEN the user activates a Parent_Row, THE Element_Info_Card SHALL remain the single open popup and SHALL open no additional popup.
9. THE Element_Info_Card SHALL render the Chain_Node_Metadata of an expanded Parent_Row using the same field set and layout used for the Self_Node's metadata.

### Requirement 2: Hover a chain row highlights the element on the page

**User Story:** As a test author, I want hovering any chain row to highlight the corresponding element on the page, so that I can see which element each node refers to.

#### Acceptance Criteria

1. WHEN the pointer enters the Self_Node region of the Element_Info_Card, THE Element_Info_Card SHALL issue a Hover_Highlight_Request for the Self_Node, preferring the Self_Node's Element_Key and falling back to the Self_Node's descriptor when no element carries the matching Tomation_Key_Attribute.
2. WHEN the pointer enters a Parent_Row, THE Element_Info_Card SHALL issue a Hover_Highlight_Request for that Parent_Row's node, preferring the node's Element_Key and falling back to the node's descriptor when no element carries the matching Tomation_Key_Attribute.
3. WHEN the Runtime receives a Hover_Highlight_Request that resolves at least one matching DOM element, THE Runtime SHALL apply the Hover_Highlight to every matching element and SHALL report the matched count in the Hover_Result.
4. IF a Hover_Highlight_Request for a chain node resolves no matching DOM element via either its Element_Key or its descriptor, THEN THE Runtime SHALL apply no Hover_Highlight and SHALL report a found count of zero.
5. WHERE a chain node carries neither an Element_Key nor a highlightable descriptor, THE Element_Info_Card SHALL issue no Hover_Highlight_Request when the pointer enters that node's row.
6. WHEN the pointer leaves a chain row for which a Hover_Highlight_Request was issued, THE Element_Info_Card SHALL issue a Hover_Clear_Request and THE Runtime SHALL remove the Hover_Highlight from every DOM element to which it was applied.
7. WHEN the pointer moves directly from one chain row to another chain row, THE Element_Info_Card SHALL issue the Hover_Clear_Request for the first row before issuing the Hover_Highlight_Request for the second row, such that at no observable point are elements of both rows carrying the Hover_Highlight simultaneously.
8. WHEN the Element_Info_Card closes while a chain row is hovered, THE Element_Info_Card SHALL issue a Hover_Clear_Request.
9. IF the Element_Info_Card issues a Hover_Highlight_Request while no run is active or the target tab is unreachable, THEN THE Runtime SHALL apply no Hover_Highlight and SHALL leave the DOM unchanged.

### Requirement 3: Tag every resolved ancestor with its element key

**User Story:** As a test author debugging a failed step, I want every resolved ancestor in the `childOf` chain to carry its own element key in the DOM, so that any parent row can highlight the exact instance the finder used during the run.

#### Acceptance Criteria

1. WHEN the Element_Finder resolves a Resolved_Ancestor as a `childOf` scope for a step, AND that ancestor's Element_Key is a non-empty string, THE Runtime SHALL set the Tomation_Key_Attribute on that Resolved_Ancestor to a value exactly equal to that ancestor's raw Element_Key string.
2. WHEN a step's Element_Chain contains more than one Resolved_Ancestor, THE Runtime SHALL set the Tomation_Key_Attribute on every Resolved_Ancestor it resolves, each to that ancestor's own Element_Key.
3. WHERE a Resolved_Ancestor has no Element_Key or an empty Element_Key, THE Runtime SHALL not add, modify, or remove the Tomation_Key_Attribute for that ancestor.
4. IF the Element_Finder fails to resolve a Resolved_Ancestor, THEN THE Runtime SHALL set no Tomation_Key_Attribute for that ancestor and SHALL leave existing Tomation_Key_Attribute values on the page unchanged.
5. WHEN the Runtime sets the Tomation_Key_Attribute on a Resolved_Ancestor, THE Runtime SHALL resolve the same elements it would have resolved without setting the attribute, preserving element-matching semantics unchanged.
6. WHEN a step that set the Tomation_Key_Attribute on a Resolved_Ancestor completes, THE Runtime SHALL leave that Tomation_Key_Attribute in place and SHALL NOT remove it on step completion, so that the ancestor remains identifiable by key after the step and after the run.
7. THE Runtime SHALL keep the Tomation_Key_Attribute on a Resolved_Ancestor independent of the Action_Highlight, such that setting or clearing `data-tomation-active` on any element leaves each Resolved_Ancestor's Tomation_Key_Attribute present and unchanged.
8. WHEN the Runtime re-resolves a Resolved_Ancestor for a step that carries an Element_Key for that ancestor, THE Runtime SHALL leave that ancestor carrying exactly one Tomation_Key_Attribute whose value equals that ancestor's Element_Key.

### Requirement 4: Report when a chain node's element has been removed

**User Story:** As a test author, I want to be told when a chain node's element is no longer in the DOM, so that I can tell removal apart from a wrong locator.

#### Acceptance Criteria

1. WHEN the pointer hovers a chain row whose node resolved an element during the run AND the Runtime reports a found count of zero for that node's Hover_Highlight_Request, THE Element_Info_Card SHALL display an Element_Removed_Message associated with that chain node.
2. WHERE a hovered chain row's node did not resolve an element during the run, THE Element_Info_Card SHALL display no Element_Removed_Message.
3. WHEN a Hover_Highlight_Request for a chain node reports a found count of at least one, THE Element_Info_Card SHALL display no Element_Removed_Message for that node.
4. WHEN the pointer leaves a chain row showing an Element_Removed_Message, THE Element_Info_Card SHALL remove that Element_Removed_Message.

### Requirement 5: Detect and report a highlight hidden by an ancestor

**User Story:** As a test author, I want to be told when a matched element cannot be shown because an ancestor container is hidden, so that I understand why no highlight appeared without the extension altering the page.

#### Acceptance Criteria

1. WHEN the Runtime applies the Hover_Highlight to a matched element, THE Runtime SHALL determine whether a Hidden_Ancestor prevents that matched element from being visible.
2. IF the Runtime determines that a Hidden_Ancestor prevents a matched element from being visible, THEN THE Runtime SHALL report the hidden-ancestor condition to the Element_Info_Card in the Hover_Result.
3. WHEN the Runtime reports the hidden-ancestor condition for a hovered chain node, THE Element_Info_Card SHALL display a Hidden_Ancestor_Notice stating that the element exists but cannot be shown because an ancestor is hidden.
4. WHEN detecting or reporting the hidden-ancestor condition, THE Runtime SHALL leave the page's author-defined styles unchanged and SHALL apply no style that would reveal the matched element or its Hidden_Ancestor.
5. WHERE a matched element is visible and no Hidden_Ancestor prevents its visibility, THE Element_Info_Card SHALL display no Hidden_Ancestor_Notice for that node.
6. WHEN the pointer leaves a chain row showing a Hidden_Ancestor_Notice, THE Element_Info_Card SHALL remove that Hidden_Ancestor_Notice.

### Requirement 6: Preserve existing highlight and matching behavior

**User Story:** As a user, I want existing highlighting and element matching to keep working, so that these enhancements do not change what I already rely on.

#### Acceptance Criteria

1. THE Runtime SHALL preserve the Action_Highlight behavior, applying `data-tomation-active="true"` when a step's action begins and removing it when the step completes, independent of the Tomation_Key_Attribute and the Hover_Highlight.
2. WHEN both the Action_Highlight and the Hover_Highlight apply to the same element, THE Runtime SHALL render both highlights simultaneously such that each highlight remains individually observable.
3. THE Runtime SHALL preserve the element-matching semantics and the Element_Finder's 5-second timeout behavior unchanged when tagging Resolved_Ancestors and when serving Hover_Highlight_Requests.
4. THE panel SHALL issue Hover_Highlight_Requests and Hover_Clear_Requests using the existing hover message protocol and Hover_Result contract.
5. WHEN a step's Page_Element_Descriptor defines a `childOf` parent, THE Element_Finder SHALL scope the child element search to the resolved parent element's subtree as the search root, rather than to the whole document, preserving the existing optimized scoping behavior.
6. WHERE a `childOf` parent's Page_Element_Descriptor carries a `navigate` field, THE Element_Finder SHALL use the parent element produced after applying that parent's navigate hops as the child search root, preserving the existing Navigate-then-scope behavior.

### Requirement 7: Indicate which parent in the chain failed to resolve

**User Story:** As a test author debugging a failed step, I want the card to mark the specific parent that could not be resolved, so that I can see which link in the `childOf` chain broke.

#### Acceptance Criteria

1. WHEN the inspected step failed because a Parent_Row's node could not be resolved by the Element_Finder, THE Element_Info_Card SHALL mark that Parent_Row with a Parent_Not_Found_Indicator that is distinct from the collapsed and expanded row states.
2. WHEN the Element_Info_Card marks a Parent_Row with the Parent_Not_Found_Indicator, THE Element_Info_Card SHALL mark the Parent_Row whose node is the Failed_Parent_Node identified by the `descriptorId` of the unresolved Parent_Resolution_Outcome, and SHALL mark no other Parent_Row.
3. WHERE the inspected step's Find_Trace reports a resolved Parent_Resolution_Outcome, or the inspected step succeeded, or the inspected step carries no Find_Trace, THE Element_Info_Card SHALL display no Parent_Not_Found_Indicator on any Parent_Row.
4. THE Element_Info_Card SHALL derive the Parent_Not_Found_Indicator from the Parent_Resolution_Outcome supplied to the Element_Info_Card, and SHALL NOT perform its own DOM resolution to determine the Parent_Not_Found_Indicator.
5. WHERE a Parent_Row carries the Parent_Not_Found_Indicator AND that node has a descriptor in `pageElements`, THE Element_Info_Card SHALL allow the user to expand that Parent_Row to reveal its Chain_Node_Metadata.
6. THE Element_Info_Card SHALL render the Parent_Not_Found_Indicator as a state distinct from the Element_Removed_Message, such that a Parent_Row that failed to resolve during the run and a chain node whose element was removed after the run remain visually distinguishable.
