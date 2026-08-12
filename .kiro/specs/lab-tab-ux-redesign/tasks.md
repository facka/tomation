# Implementation Plan: Lab Tab UX Redesign

## Overview

This plan implements the UX redesign of the Lab tab in incremental steps. It modifies the store to support multi-node selection and new state fields, updates the inspector to stay active for multi-select, refactors existing Vue components (AIConfigSection, InspectSection, GenerateSection, LabView), and introduces a new CodeViewer component. Each step builds on the previous, ending with full integration.

## Tasks

- [x] 1. Update Lab Store for multi-node selection and new state
  - [x] 1.1 Update LabState interface and store actions
    - In `packages/extension/panel-vue/src/types/lab.ts`: change `selectedNode: SelectedNodeData | null` to `selectedNodes: SelectedNodeData[]`, rename `contextMode: 'full' | 'subtree'` to `contextMode: 'full' | 'inspect'`, add `codeViewerContent: string` and `fullPageHtml: string | null` fields
    - In `packages/extension/panel-vue/src/store/lab.ts`: update initial state to use `selectedNodes: []`, `contextMode: 'inspect'`, `codeViewerContent: ''`, `fullPageHtml: null`; replace `setSelectedNode`/`clearSelectedNode` with `addSelectedNode(node)` (cap at 20, deduplicate by outerHTML), `removeSelectedNode(index)`, `clearSelectedNodes()`; add `setCodeViewerContent(content)`, `updateCodeViewerContent()`, `setFullPageHtml(html)` actions as specified in the design
    - _Requirements: 4.1, 4.2, 4.5, 4.8, 2.5, 2.6, 3.4_

  - [x]* 1.2 Write property tests for store multi-node logic
    - **Property 4: Duplicate nodes are rejected by outerHTML equality**
    - **Property 9: Multi-select stores up to 20 unique nodes with one Mini_Editor per node**
    - **Validates: Requirements 4.2, 4.1, 4.3**
    - Create test file at `packages/extension/src/store-multinode.test.js` using `node:test` and `fast-check`
    - Test that `addSelectedNode` rejects duplicates (same outerHTML) and caps at 20 unique nodes

  - [x]* 1.3 Write property test for node concatenation
    - **Property 2: Node concatenation produces newline-separated outerHTML in selection order**
    - **Validates: Requirements 2.6, 4.6, 7.1**
    - Test that `updateCodeViewerContent()` produces outerHTML values joined by `\n` in selection order

  - [x]* 1.4 Write property test for node deletion
    - **Property 5: Node deletion removes the targeted node and regenerates Code_Viewer content**
    - **Validates: Requirements 4.5**
    - Test that `removeSelectedNode(i)` produces list of length N-1 and codeViewerContent is recalculated

- [x] 2. Update Inspector script for multi-select behavior
  - [x] 2.1 Modify inspector.js to stay active after click
    - In `packages/extension/src/inspector.js`: remove the `cleanup()` call from `onClick` handler so the inspector keeps listening after each node selection
    - Add a `chrome.runtime.onMessage` listener for `REMOVE_INSPECTOR` messages that calls `cleanup()` when received
    - Ensure Escape key still calls `cleanup()` and sends `INSPECT_CANCELLED`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x]* 2.2 Write property test for inspector staying active after click
    - **Property 6: Inspector script remains active after click in multi-select mode**
    - **Validates: Requirements 6.1**
    - Create test at `packages/extension/src/inspector-multiselect.test.js`; use jsdom to simulate click events and verify event listeners remain registered and overlay stays in DOM

- [x] 3. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Refactor AIConfigSection with collapsible state
  - [x] 4.1 Replace `<details>` with custom collapsible in AIConfigSection
    - In `packages/extension/panel-vue/src/components/AIConfigSection.vue`: replace `<details>/<summary>` with a custom collapsible using reactive `isCollapsed` ref
    - Add `onMounted` logic: collapse if `labState.aiConfig?.apiKey.trim().length > 0`, expand otherwise
    - Collapsed view shows: provider name, model name, and a check icon (✓)
    - Click on summary header toggles `isCollapsed`
    - On save while expanded: stay expanded, show confirmation for 2 seconds (existing `saveSuccess` logic already handles this)
    - _Requirements: 1.2, 1.3, 1.4, 1.5_

  - [x]* 4.2 Write property test for AI Config collapse state
    - **Property 1: AI Config collapse state determined by API key content**
    - **Validates: Requirements 1.2, 1.3**
    - Create test at `packages/extension/src/ai-config-collapse.test.js`; generate arbitrary strings and whitespace-only strings; verify collapse logic function returns correct state

- [x] 5. Refactor InspectSection with context mode and multi-node UI
  - [x] 5.1 Add context mode radio buttons to InspectSection
    - In `packages/extension/panel-vue/src/components/InspectSection.vue`: add two radio buttons at the top — "Generate with Full HTML" and "Select elements with Inspect Element"
    - Bind to `labState.contextMode` ('full' or 'inspect')
    - When switching to 'full' mode: trigger `GET_PAGE_HTML` message to fetch page HTML; hide the inspect toggle button
    - When switching to 'inspect' mode: show the inspect toggle button; do NOT clear `selectedNodes`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [x] 5.2 Add selected nodes list with mini-editors
    - In `InspectSection.vue`: when `contextMode === 'inspect'`, render a list of mini-editors (one per `labState.selectedNodes` entry)
    - Each mini-editor: `<pre>` block showing `node.outerHTML` (read-only) + a delete button (✕) that calls `removeSelectedNode(index)`
    - Add a "Clear All" button that calls `clearSelectedNodes()`
    - Show inline message when node list is at 20-cap limit
    - _Requirements: 4.3, 4.4, 4.5, 4.8_

  - [x] 5.3 Update NODE_SELECTED message handling in App.vue
    - In `packages/extension/panel-vue/src/App.vue`: update the `NODE_SELECTED` message handler to call `addSelectedNode(node)` instead of `setSelectedNode(node)` and do NOT set `inspectMode = false` (inspector stays active)
    - _Requirements: 6.1, 4.1_

- [x] 6. Create CodeViewer component
  - [x] 6.1 Create CodeViewer.vue with syntax highlighting and editing
    - Create `packages/extension/panel-vue/src/components/CodeViewer.vue`
    - Read from `labState.codeViewerContent`; use a `<textarea>` for editing with a `<pre><code>` overlay for syntax highlighting
    - Tokenize HTML: tags, attribute names, attribute values, text content — each with a CSS class for coloring
    - On textarea input: call `setCodeViewerContent(value)` to keep store in sync
    - Show empty-state placeholder when content is empty ("No HTML content loaded")
    - When `contextMode` changes (via a watcher): call `updateCodeViewerContent()` to replace content (discarding edits)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8_

  - [x]* 6.2 Write property test for generation sends viewer content
    - **Property 3: Generation always sends current Code_Viewer content**
    - **Validates: Requirements 2.4, 7.2**
    - Create test at `packages/extension/src/code-viewer-generation.test.js`; verify that the generate flow reads from `codeViewerContent` (including arbitrary user edits) as the payload

- [x] 7. Refactor GenerateSection and add Privacy Label
  - [x] 7.1 Update GenerateSection for new data flow and privacy label
    - In `packages/extension/panel-vue/src/components/GenerateSection.vue`: remove the context mode radio buttons (moved to InspectSection)
    - Update `generate()` to read from `labState.codeViewerContent` instead of `labState.selectedNode.outerHTML`
    - Update validation: in inspect mode with empty `selectedNodes` array → show "Please select at least one element before generating"
    - In full mode: if `codeViewerContent` is empty, show appropriate error
    - Add static Privacy_Label text: "Email addresses, passwords, and personally identifiable information are automatically stripped from HTML before sending to the AI service."
    - Replace `ai-disclaimer` text with the privacy label
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 4.7, 7.2, 7.3, 7.4_

- [x] 8. Update LabView component ordering
  - [x] 8.1 Reorder LabView children and add CodeViewer
    - In `packages/extension/panel-vue/src/components/LabView.vue`: import `CodeViewer`, reorder template to: `AIConfigSection` → `InspectSection` → `CodeViewer` → `GenerateSection` → `CodeOutput`
    - Remove `NodePreview` import and usage (its functionality is replaced by the mini-editors in InspectSection and the CodeViewer)
    - _Requirements: 1.1, 2.1_

- [x] 9. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Integration wiring and final adjustments
  - [x] 10.1 Wire Full HTML fetch flow end-to-end
    - Ensure `GET_PAGE_HTML` message sent from InspectSection (on mode switch to 'full') is handled by background and response `PAGE_HTML` calls `setFullPageHtml(html)` in the store (via App.vue message handler)
    - Verify `updateCodeViewerContent()` sets `codeViewerContent` to `fullPageHtml` when in full mode
    - _Requirements: 2.5, 3.2_

  - [x] 10.2 Wire generation to use codeViewerContent through sanitizer
    - In `GenerateSection.vue`: update `sendGenerateRequest` to pass `labState.codeViewerContent` as `htmlContext` to `GENERATE_POM` message
    - Background script already passes through `sanitizeHtmlForPrivacy` — no changes needed there
    - _Requirements: 7.1, 7.2, 7.3_

  - [x]* 10.3 Write property test for privacy sanitization
    - **Property 8: Privacy sanitizer strips PII from HTML before AI submission**
    - **Validates: Requirements 7.3**
    - Create test at `packages/extension/src/sanitize-privacy.test.js`; generate HTML strings with injected email/phone patterns; verify they are replaced with redacted placeholders

- [x] 11. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- The existing `NodePreview.vue` component is superseded by the mini-editors in InspectSection and the CodeViewer — it can be removed or left unused
- Tests use `node --test` with `fast-check` — no test runner setup needed
- The user already has tasks 1-6 from the original spec completed (store foundation, build, inspector, background). This spec focuses on the UX redesign layer on top

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "1.4", "2.1"] },
    { "id": 2, "tasks": ["2.2", "4.1"] },
    { "id": 3, "tasks": ["4.2", "5.1"] },
    { "id": 4, "tasks": ["5.2", "5.3", "6.1"] },
    { "id": 5, "tasks": ["6.2", "7.1"] },
    { "id": 6, "tasks": ["8.1"] },
    { "id": 7, "tasks": ["10.1", "10.2"] },
    { "id": 8, "tasks": ["10.3"] }
  ]
}
```
