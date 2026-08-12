# Requirements Document

## Introduction

The HTML Inspector POM Generator adds a "Lab" tab to the Tomation browser extension's side panel. It enables users to visually select a single DOM node through an interactive inspection mode, configure an AI provider, and auto-generate a Page Object Model (`.pom.ts`) file in `@tomationjs/dsl` format from the full subtree of the selected node. The AI receives the bundled `tomation-ai.md` skills file as system prompt context, ensuring generated code follows all DSL conventions, matchers, and patterns.

## Glossary

- **Lab_Tab**: A new tab in the HomeView tab bar (alongside Tests and Automations) that houses the HTML inspector and AI-powered POM generation features
- **Inspect_Mode**: A toggleable state where a content script is injected into the active page to highlight elements on hover and capture the user's single node selection
- **Content_Script**: A JavaScript file injected on-demand into the active browser tab that handles element highlighting, hover detection, and click-to-select behavior
- **Selected_Node**: The single DOM node chosen by the user during inspection; its full subtree (outerHTML including all children) is used as context for POM generation
- **AI_Provider**: A configurable external AI service (OpenAI, Anthropic, Google Gemini, or custom endpoint) used to generate POM code from the selected node's HTML
- **AI_Configuration**: The persisted set of provider, endpoint URL, API key, and model selection stored in `chrome.storage.local`
- **HTML_Context**: The HTML content sent to the AI provider — either the full page HTML or the selected node's subtree HTML, based on user preference
- **Skills_File_Content**: The contents of `tomation-ai.md` bundled into the extension at build time, used as the system prompt for AI code generation
- **POM_Output**: The generated `.pom.ts` file content containing valid `@tomationjs/dsl` imports, element descriptors, and optional Task scaffolds
- **Background_Script**: The extension's background service worker (Chrome MV3) or background script (Firefox MV2) that handles AI API calls to avoid CORS restrictions
- **Panel**: The Vue 3 side panel application that renders the Tomation UI including the new Lab tab

## Requirements

### Requirement 1: Lab Tab Integration

**User Story:** As a Tomation user, I want a Lab tab in the side panel, so that I can access the HTML inspector and POM generation features without leaving the extension.

#### Acceptance Criteria

1. THE Lab_Tab SHALL appear as a third tab in the HomeView tab bar after Tests and Automations
2. WHEN the user clicks the Lab_Tab, THE Panel SHALL display the Lab tab content area and visually indicate the Lab_Tab as the active tab
3. THE Lab_Tab SHALL be visible and clickable in the tab bar regardless of whether a test spec is currently loaded
4. WHILE the Lab_Tab is active, THE Panel SHALL display the inspect mode toggle, selected node preview, AI configuration section, and generation controls
5. IF no test spec is currently loaded AND the user is on the LandingPage, THEN THE Panel SHALL still display the tab bar containing the Lab_Tab

### Requirement 2: Inspect Mode and Node Selection

**User Story:** As a Tomation user, I want to toggle an inspection mode and select a single DOM node, so that I can use its subtree as context for POM generation.

#### Acceptance Criteria

1. WHEN the user clicks the inspect mode toggle button, THE Panel SHALL activate inspect mode, visually indicate that Inspect_Mode is active on the toggle button, and inject the Content_Script into the active browser tab
2. WHILE Inspect_Mode is active, THE Content_Script SHALL highlight the element currently under the user's cursor with a colored border overlay that is visually distinct from page content
3. WHILE Inspect_Mode is active, WHEN the user clicks an element, THE Content_Script SHALL prevent the default browser action for that click, capture the clicked element as the Selected_Node (including its tag name, attributes, and the full outerHTML of its subtree), and automatically deactivate Inspect_Mode
4. WHEN a Selected_Node is captured, THE Content_Script SHALL send the node data (tag name, attributes, outerHTML of the full subtree) to the Panel via the browser messaging API
5. WHEN the Panel receives a Selected_Node, THE Panel SHALL display a preview showing the node's tag name, a summary of its subtree (e.g., number of child elements), and a truncated HTML preview
6. WHEN a new selection is made, THE Panel SHALL replace the previous Selected_Node with the new one (only one node can be selected at a time)
7. THE Panel SHALL allow the user to clear the current Selected_Node selection
8. WHEN the user clicks the inspect mode toggle button while Inspect_Mode is active, THE Panel SHALL deactivate inspect mode, remove the highlight overlay from the page, and update the toggle button to indicate Inspect_Mode is inactive
9. IF the Content_Script injection fails due to insufficient permissions or a restricted page, THEN THE Panel SHALL display an error message indicating that element inspection is not available on the current page and keep Inspect_Mode inactive

### Requirement 3: AI Provider Configuration

**User Story:** As a Tomation user, I want to configure my preferred AI provider and credentials, so that I can use my own API key for POM generation.

#### Acceptance Criteria

1. THE Panel SHALL display a provider selector dropdown with options for OpenAI, Anthropic, Google Gemini, and custom endpoint
2. WHEN the user selects a known provider (OpenAI, Anthropic, or Google Gemini), THE Panel SHALL pre-fill the API endpoint URL with the provider's standard endpoint
3. WHEN the user selects the custom endpoint option, THE Panel SHALL display an editable endpoint URL field and an editable model name text input field
4. THE Panel SHALL display an API key input field that masks the entered value by default, with a toggle to reveal or hide the key
5. WHEN the user selects a known provider (OpenAI, Anthropic, or Google Gemini), THE Panel SHALL display a model selector populated with provider-specific model options for the selected provider
6. IF the user attempts to save AI_Configuration with an empty API key or, for a custom endpoint, an empty endpoint URL, THEN THE Panel SHALL display an inline validation error indicating the missing field and SHALL NOT persist the configuration
7. WHEN the user saves valid AI_Configuration values, THE Panel SHALL persist the provider, endpoint URL, API key, and model selection to `chrome.storage.local`
8. WHEN the Lab_Tab is opened, THE Panel SHALL load and display previously saved AI_Configuration from `chrome.storage.local`
9. IF no AI_Configuration exists in `chrome.storage.local` when the Lab_Tab is opened, THEN THE Panel SHALL display the provider selector set to the first option (OpenAI) with empty API key and model fields, indicating configuration is required before generation

### Requirement 4: HTML Context Options

**User Story:** As a Tomation user, I want to choose how much HTML context to send to the AI, so that I can balance generation quality against token usage and cost.

#### Acceptance Criteria

1. THE Panel SHALL display two HTML context mode options presented as radio buttons or equivalent single-select control: Full HTML and Selected Node Subtree
2. WHEN the user triggers POM generation with Full HTML mode selected, THE Panel SHALL retrieve the complete page HTML from the active tab and insert an HTML comment marker (e.g., `<!-- SELECTED_NODE -->`) immediately before the Selected_Node to identify its position
3. WHEN the user triggers POM generation with Selected Node Subtree mode selected, THE Panel SHALL send only the Selected_Node's outerHTML (which includes its full subtree of children) as context
4. THE Panel SHALL default to Selected Node Subtree mode as the pre-selected option when the Lab_Tab is first displayed
5. IF the Panel cannot retrieve HTML from the active tab (due to navigation, tab closure, or restricted page), THEN THE Panel SHALL display an error message indicating that HTML content is unavailable from the current page and SHALL NOT proceed with generation

### Requirement 5: AI-Powered POM Code Generation

**User Story:** As a Tomation user, I want to generate a POM file from my selected DOM node using AI, so that I can avoid writing element descriptors manually.

#### Acceptance Criteria

1. WHEN the user clicks the Generate POM button, THE Panel SHALL send a generation request to the Background_Script containing the HTML_Context and the AI_Configuration
2. IF the user clicks the Generate POM button while no Selected_Node exists or the AI_Configuration is incomplete (missing API key or model), THEN THE Panel SHALL display an error message indicating the missing prerequisite and SHALL NOT send a generation request
3. WHEN the Background_Script receives a generation request, THE Background_Script SHALL construct an AI prompt that includes the Skills_File_Content as system context and the HTML_Context (selected node subtree or full page) as user content
4. WHEN the Background_Script has constructed the prompt, THE Background_Script SHALL send it to the configured AI_Provider endpoint using the stored API key and model
5. WHEN the AI_Provider returns a successful response, THE Background_Script SHALL extract the code block content from the response and send it back to the Panel
6. WHEN the Panel receives generated code, THE Panel SHALL display the POM_Output in a code viewer with syntax highlighting
7. IF the AI_Provider returns an error response, THEN THE Panel SHALL display an error message indicating the provider name, the HTTP status code, and the error reason returned by the provider
8. IF the AI_Provider does not respond within 60 seconds, THEN THE Background_Script SHALL abort the request and THE Panel SHALL display an error message indicating a timeout
9. WHILE a generation request is in progress, THE Panel SHALL display a loading indicator and disable the Generate POM button
10. THE POM_Output SHALL contain valid TypeScript with imports from `@tomationjs/dsl`, element descriptors using the `is.TAG.where(matcher).as(label)` pattern, and a default export object

### Requirement 6: Output Actions

**User Story:** As a Tomation user, I want to copy or download the generated POM code, so that I can use it in my test project.

#### Acceptance Criteria

1. WHEN POM_Output is displayed in the code viewer, THE Panel SHALL show a Copy to clipboard button
2. WHEN the user clicks the Copy to clipboard button, THE Panel SHALL copy the POM_Output text to the system clipboard and display a confirmation message for at least 2 seconds indicating the copy succeeded
3. IF the clipboard write operation fails, THEN THE Panel SHALL display an error message indicating that the copy could not be completed
4. WHEN POM_Output is displayed in the code viewer, THE Panel SHALL show a Download as .pom.ts button
5. WHEN the user clicks the Download button, THE Panel SHALL trigger a file download with the POM_Output content, a filename composed of the generated POM name followed by the `.pom.ts` extension, and a MIME type of `text/plain`

### Requirement 7: Skills File Bundling

**User Story:** As a developer building the extension, I want the `tomation-ai.md` skills file bundled into the extension, so that it is available at runtime for constructing AI prompts.

#### Acceptance Criteria

1. THE extension build process SHALL copy the `tomation-ai.md` file into each browser target's output directory so that it is accessible via `chrome.runtime.getURL` or equivalent extension resource API
2. THE Background_Script SHALL be able to read the bundled Skills_File_Content at runtime by loading it from the extension's local resources without external network requests, and the retrieved content SHALL match the full text of the source `tomation-ai.md` file with no truncation or modification
3. WHEN the `tomation-ai.md` source file is updated, THE extension build process SHALL include the updated content in subsequent builds without requiring manual cache clearing or additional build steps
4. IF the `tomation-ai.md` source file is missing or unreadable at build time, THEN THE extension build process SHALL fail with an error message indicating the skills file could not be found

### Requirement 8: Cross-Browser Content Script Injection

**User Story:** As a Tomation user on Chrome or Firefox, I want element inspection to work regardless of my browser, so that I can use the feature on either supported platform.

#### Acceptance Criteria

1. WHEN Inspect_Mode is activated on Chrome, THE Panel SHALL inject the Content_Script into the currently active browser tab using `chrome.scripting.executeScript`
2. WHEN Inspect_Mode is activated on Firefox, THE Panel SHALL inject the Content_Script into the currently active browser tab using `browser.tabs.executeScript`
3. IF the Content_Script injection fails due to permissions, restricted pages, or absence of an active tab, THEN THE Panel SHALL display an error message indicating that inspection is not available on the current page and SHALL revert Inspect_Mode to inactive
4. WHEN Inspect_Mode is activated, THE Panel SHALL detect the runtime environment using the presence of the `browser` global object to select the Firefox API, falling back to the `chrome` global object for Chrome
5. THE Content_Script injection SHALL produce identical inspection behavior (element highlighting, click capture, and message passing) regardless of whether the Chrome or Firefox injection API was used
