# Implementation Plan: HTML Inspector POM Generator

## Overview

This plan implements a "Lab" tab in the Tomation browser extension side panel that allows users to visually inspect DOM elements and generate Page Object Model files using AI. The implementation spans the Vue panel (store, components), the build system (skills file bundling, manifest updates), the content script (inspector.js), and the background script (message handlers, AI gateway, provider adapters).

## Tasks

- [x] 1. Lab store state, types, and persistence
  - [x] 1.1 Define Lab-related TypeScript interfaces and extend store types
    - Add `SelectedNodeData`, `AIConfig`, and `LabState` interfaces to a new `types/lab.ts` file
    - Extend `activeTab` type in `types/store.ts` to include `'lab'`
    - Add Lab-specific message types to `types/messages.ts` (`INJECT_INSPECTOR`, `REMOVE_INSPECTOR`, `GENERATE_POM`, `GET_PAGE_HTML`, `INSPECTOR_INJECTED`, `NODE_SELECTED`, `INSPECT_CANCELLED`, `PAGE_HTML`, `POM_GENERATED`, `POM_GENERATION_ERROR`, `POM_GENERATION_TIMEOUT`)
    - _Requirements: 1.1, 1.4, 2.4, 3.7, 3.8_

  - [x] 1.2 Create Lab store module with reactive state and actions
    - Create `store/lab.ts` composable (or extend `store/index.ts`) exposing `labState` reactive object with `inspectMode`, `selectedNode`, `aiConfig`, `contextMode`, `isGenerating`, `generatedCode`, `generatedPomName`, `error`, `copyConfirmation`
    - Implement actions: `setInspectMode`, `setSelectedNode`, `clearSelectedNode`, `setAIConfig`, `setContextMode`, `setGenerating`, `setGeneratedCode`, `setError`, `setCopyConfirmation`
    - Implement `loadAIConfig()` that reads from `chrome.storage.local` key `lab_ai_config`
    - Implement `saveAIConfig(config)` that validates and persists to `chrome.storage.local`
    - Implement `validateAIConfig(config)` that rejects empty API key or empty endpoint for custom provider
    - _Requirements: 1.4, 2.6, 2.7, 3.6, 3.7, 3.8, 3.9_

  - [ ]* 1.3 Write property tests for AI configuration validation (Property 5)
    - **Property 5: AI configuration validation rejects invalid inputs**
    - Generate arbitrary AIConfig objects with empty/whitespace API key or empty custom endpoint; assert validation always returns error and never calls storage.set
    - **Validates: Requirements 3.6**

  - [ ]* 1.4 Write property tests for AI configuration persistence round-trip (Property 6)
    - **Property 6: AI configuration persistence round-trip**
    - Generate valid AIConfig objects (non-empty key, valid provider, non-empty model, non-empty endpoint for custom); assert save→load produces identical object
    - **Validates: Requirements 3.7, 3.8**

  - [ ]* 1.5 Write property tests for single selection invariant (Property 4)
    - **Property 4: Single selection invariant**
    - Generate random sequences of setSelectedNode and clearSelectedNode calls; assert state always holds exactly the last selection or null
    - **Validates: Requirements 2.6**

- [x] 2. Build system changes
  - [x] 2.1 Add `tomation-ai.md` bundling to build.js
    - Copy `tomation-ai.md` from project root into `bundled/tomation-ai.md` in each target directory
    - Add existence check that fails the build with a clear error if the source file is missing
    - _Requirements: 7.1, 7.3, 7.4_

  - [x] 2.2 Add `inspector.js` to SHARED_FILES in build.js
    - Add `'src/inspector.js'` to the SHARED_FILES array so it's copied to both Chrome and Firefox dist
    - _Requirements: 8.1, 8.2, 8.5_

  - [x] 2.3 Update manifest generation for new permissions and resources
    - Add `"scripting"` to Chrome MV3 permissions in `chromeManifest()`
    - Add `web_accessible_resources` for `bundled/tomation-ai.md` in Chrome manifest (MV3 format with resources array)
    - Add `web_accessible_resources` for `bundled/tomation-ai.md` in Firefox manifest (MV2 string array format)
    - _Requirements: 7.1, 8.1_

  - [ ]* 2.4 Write property test for skills file bundling integrity (Property 14)
    - **Property 14: Skills file bundling integrity**
    - Verify that after build, the copied file content equals the source file content byte-for-byte (test with mock fs or integration check)
    - **Validates: Requirements 7.2**

- [ ] 3. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Content script (inspector.js)
  - [x] 4.1 Create `packages/extension/src/inspector.js` with overlay and event handling
    - Implement `createOverlay()` — creates a positioned absolute div with colored border, high z-index, pointer-events:none
    - Implement `positionOverlay(element)` — reads `getBoundingClientRect()` and positions overlay to match
    - Implement `removeOverlay()` — removes the overlay div from the DOM
    - Implement `onMouseMove(e)` handler — calls `positionOverlay(e.target)`
    - Implement `onClick(e)` handler — `preventDefault()`, `stopPropagation()`, captures `tagName`, `attributes`, `outerHTML`, `childElementCount`, sends `NODE_SELECTED` message, calls `cleanup()`
    - Implement `onKeyDown(e)` handler — if Escape, sends `INSPECT_CANCELLED`, calls `cleanup()`
    - Implement `cleanup()` — removes event listeners, removes overlay
    - Implement `sendMessage(msg)` — uses `chrome.runtime.sendMessage` (aliased via `typeof browser !== 'undefined' ? browser : chrome`)
    - Self-initializes on injection: creates overlay, attaches mousemove/click/keydown listeners on document
    - _Requirements: 2.2, 2.3, 2.4, 2.8, 8.5_

  - [ ]* 4.2 Write property tests for overlay positioning (Property 1)
    - **Property 1: Overlay positioning matches element geometry**
    - Generate arbitrary bounding rects; verify positionOverlay sets overlay style top/left/width/height to match
    - **Validates: Requirements 2.2**

  - [ ]* 4.3 Write property tests for click-to-select capture (Property 2)
    - **Property 2: Click-to-select captures complete node data and sends correct message**
    - Generate DOM elements with arbitrary tag names, attributes, and children; simulate click; verify message payload matches element data
    - **Validates: Requirements 2.3, 2.4**

- [ ] 5. Background script message handlers
  - [ ] 5.1 Add inspector injection handler to background.js
    - Handle `INJECT_INSPECTOR` message: detect browser API (browser vs chrome), call `scripting.executeScript` (Chrome MV3) or `tabs.executeScript` (Firefox MV2) to inject `src/inspector.js` into active tab
    - Send `INSPECTOR_INJECTED` response with `{ success: true }` or `{ success: false, error: reason }` on failure
    - Handle `REMOVE_INSPECTOR` message: inject a cleanup snippet or send message to content script
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [ ] 5.2 Add NODE_SELECTED and INSPECT_CANCELLED relay in background.js
    - Listen for `NODE_SELECTED` messages from content script and relay to panel via `safeSendMessage`
    - Listen for `INSPECT_CANCELLED` messages from content script and relay to panel
    - Handle `GET_PAGE_HTML` by executing script in active tab to capture `document.documentElement.outerHTML` and send `PAGE_HTML` response
    - _Requirements: 2.4, 4.2, 4.5_

  - [ ] 5.3 Add skills file loader utility in background.js
    - Implement `loadSkillsFile()` that fetches `chrome.runtime.getURL('bundled/tomation-ai.md')` and returns the text content
    - Cache the result after first load (file is static within a build)
    - _Requirements: 7.2, 5.3_

  - [ ] 5.4 Add AI gateway and GENERATE_POM handler in background.js
    - Handle `GENERATE_POM` message: load skills file, construct prompt (system = skills content + generation instruction, user = HTML context)
    - Call provider adapter to build HTTP request, execute fetch with 60-second AbortController timeout
    - On success: extract code block from response, send `POM_GENERATED` with `{ code, pomName }`
    - On error: send `POM_GENERATION_ERROR` with `{ provider, status, error }`
    - On timeout: send `POM_GENERATION_TIMEOUT`
    - _Requirements: 5.1, 5.3, 5.4, 5.5, 5.7, 5.8_

  - [ ]* 5.5 Write property test for prompt construction (Property 10)
    - **Property 10: Prompt construction includes skills and HTML context**
    - Generate arbitrary HTML context strings; verify constructed prompt contains the full skills content as system message and HTML as user message
    - **Validates: Requirements 5.3**

- [ ] 6. AI provider adapters
  - [ ] 6.1 Implement provider adapter functions in background.js
    - Implement `buildOpenAIRequest(config, systemPrompt, userPrompt)` — returns `{ url, headers: { Authorization: Bearer }, body: { model, messages } }`
    - Implement `buildAnthropicRequest(config, systemPrompt, userPrompt)` — returns `{ url, headers: { x-api-key, anthropic-version }, body: { model, system, messages } }`
    - Implement `buildGeminiRequest(config, systemPrompt, userPrompt)` — returns `{ url: endpoint/models/{model}:generateContent?key=, headers, body: { contents, systemInstruction } }`
    - Implement `buildCustomRequest(config, systemPrompt, userPrompt)` — OpenAI-compatible format using user-provided endpoint
    - Implement `parseOpenAIResponse(json)`, `parseAnthropicResponse(json)`, `parseGeminiResponse(json)`, `parseCustomResponse(json)` — extract text content from each provider's response format
    - Implement `extractCodeBlock(text)` — find first markdown code fence and return inner content; if none, return full text
    - _Requirements: 5.4, 5.5_

  - [ ]* 6.2 Write property tests for provider adapter requests (Property 11)
    - **Property 11: Provider adapter constructs correct HTTP request**
    - Generate valid AIConfig for each provider; verify each adapter produces correct URL, auth header, and model placement
    - **Validates: Requirements 5.4**

  - [ ]* 6.3 Write property tests for code block extraction (Property 12)
    - **Property 12: Code block extraction from AI response**
    - Generate strings containing markdown code fences with various language tags; verify extraction returns the first code block content without fences
    - **Validates: Requirements 5.5**

  - [ ]* 6.4 Write property tests for error response formatting (Property 13)
    - **Property 13: Error response formatting**
    - Generate error responses with arbitrary provider name, status code, and message; verify formatted output includes all three
    - **Validates: Requirements 5.7**

- [ ] 7. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 8. Vue components — Lab tab UI
  - [ ] 8.1 Create `LabView.vue` container component
    - Import and render `InspectSection`, `NodePreview`, `AIConfigSection`, `GenerateSection`, `CodeOutput`
    - Call `loadAIConfig()` on mount to restore persisted configuration
    - _Requirements: 1.4_

  - [ ] 8.2 Create `InspectSection.vue` — inspect mode toggle
    - Toggle button that sends `INJECT_INSPECTOR` or `REMOVE_INSPECTOR` message via useMessaging
    - Visual indicator showing inspect mode active/inactive state
    - Display error message when injection fails (from `INSPECTOR_INJECTED` with `success: false`)
    - _Requirements: 2.1, 2.8, 2.9_

  - [ ] 8.3 Create `NodePreview.vue` — selected node display
    - Display tag name, childElementCount summary, and truncated outerHTML preview
    - Show "Clear selection" button that calls `clearSelectedNode()`
    - Show empty state when no node is selected
    - _Requirements: 2.5, 2.6, 2.7_

  - [ ]* 8.4 Write property tests for node preview rendering (Property 3)
    - **Property 3: Node preview renders correct summary**
    - Generate arbitrary SelectedNodeData with varying childElementCount and outerHTML lengths; verify render output shows tag name, correct count, and appropriate truncation
    - **Validates: Requirements 2.5**

  - [ ] 8.5 Create `AIConfigSection.vue` — provider configuration form
    - Provider dropdown (OpenAI, Anthropic, Gemini, Custom) that pre-fills endpoint URL for known providers
    - API key input with show/hide toggle (type password/text)
    - Model selector populated with `PROVIDER_MODELS[provider]` for known providers; free text input for custom
    - Editable endpoint URL field shown for custom provider
    - Save button that validates and persists via store `saveAIConfig()`
    - Display inline validation errors for empty key or empty custom endpoint
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9_

  - [ ] 8.6 Create `GenerateSection.vue` — context mode and generate button
    - Radio buttons for "Full HTML" and "Selected Node Subtree" context modes (default: subtree)
    - Generate POM button that validates prerequisites (selectedNode exists, aiConfig complete) before dispatching
    - Show error messages for missing prerequisites
    - Loading indicator and disabled button while `isGenerating` is true
    - On generate: if full mode, send `GET_PAGE_HTML` first to get page HTML and insert `<!-- SELECTED_NODE -->` marker before the selected node's outerHTML; if subtree mode, send only outerHTML
    - Dispatch `GENERATE_POM` message with context and config
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 5.9_

  - [ ]* 8.7 Write property tests for HTML context preparation (Properties 7, 8)
    - **Property 7: Full HTML mode inserts marker before selected node**
    - Generate page HTML strings containing a known substring (selected node outerHTML); verify marker insertion at correct position
    - **Property 8: Subtree mode sends only the selected node's outerHTML**
    - Generate SelectedNodeData; verify subtree mode context equals exactly outerHTML
    - **Validates: Requirements 4.2, 4.3**

  - [ ]* 8.8 Write property tests for generation prerequisites validation (Property 9)
    - **Property 9: Generation prerequisites validation**
    - Generate lab states with missing selectedNode, null aiConfig, empty apiKey, or empty model; verify generate always produces error and never dispatches message
    - **Validates: Requirements 5.2**

  - [ ] 8.9 Create `CodeOutput.vue` — generated code display and actions
    - Display generated code with syntax highlighting (use `<pre><code>` with appropriate class)
    - Copy to clipboard button that writes to `navigator.clipboard.writeText()` and shows confirmation for 2 seconds
    - Download button that triggers a file download with `.pom.ts` extension and `text/plain` MIME type
    - Show error messages for failed clipboard write
    - Hide section when no generated code exists
    - _Requirements: 5.6, 5.10, 6.1, 6.2, 6.3, 6.4, 6.5_

- [ ] 9. HomeView and TabBar modifications
  - [ ] 9.1 Extend TabBar and HomeView to include Lab tab
    - Add "Lab" button to `TabBar.vue` after the Automations button
    - Update `store.setActiveTab` type and the `activeTab` type to accept `'lab'`
    - In `HomeView.vue`, conditionally render `LabView` when `activeTab === 'lab'`
    - Ensure Lab tab is visible even without a loaded spec (modify `HomeView.vue` to show TabBar and LabView when on Lab tab regardless of project state)
    - Persist `'lab'` as active tab value in `chrome.storage.local`
    - _Requirements: 1.1, 1.2, 1.3, 1.5_

- [ ] 10. Integration wiring — message handling in panel
  - [ ] 10.1 Wire background messages to Lab store in App.vue
    - Handle `INSPECTOR_INJECTED` — update inspectMode on success, show error on failure
    - Handle `NODE_SELECTED` — call `setSelectedNode()` with received data, set inspectMode to false
    - Handle `INSPECT_CANCELLED` — set inspectMode to false
    - Handle `PAGE_HTML` — used by GenerateSection's full-mode flow (store or forward)
    - Handle `POM_GENERATED` — call `setGeneratedCode(code, pomName)`, set isGenerating to false
    - Handle `POM_GENERATION_ERROR` — format error with provider name, status, message; set error, set isGenerating to false
    - Handle `POM_GENERATION_TIMEOUT` — set timeout error message, set isGenerating to false
    - _Requirements: 2.4, 2.5, 5.5, 5.6, 5.7, 5.8, 5.9_

- [ ] 11. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The content script (`inspector.js`) is vanilla JavaScript (no framework) since it's injected into arbitrary pages
- The background script additions follow the existing pattern of `var`-based ES5 JavaScript
- Vue components use TypeScript with Composition API (`<script setup lang="ts">`) matching existing convention
- fast-check is already available as a devDependency
- Tests use `node --test` (Node.js test runner) — the user runs tests manually

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "2.2", "2.3"] },
    { "id": 1, "tasks": ["1.2", "4.1", "5.3"] },
    { "id": 2, "tasks": ["1.3", "1.4", "1.5", "2.4", "4.2", "4.3", "5.1", "5.2"] },
    { "id": 3, "tasks": ["5.4", "6.1"] },
    { "id": 4, "tasks": ["5.5", "6.2", "6.3", "6.4"] },
    { "id": 5, "tasks": ["8.1", "8.2", "8.3", "8.5", "8.9", "9.1"] },
    { "id": 6, "tasks": ["8.4", "8.6"] },
    { "id": 7, "tasks": ["8.7", "8.8"] },
    { "id": 8, "tasks": ["10.1"] }
  ]
}
```
