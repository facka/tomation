# Implementation Plan: Onboarding Landing Page

## Overview

Replace the existing `#home-landing` section in `panel.html` with a comprehensive onboarding experience for first-time users. Adds a welcome heading, unified drop zone, Get Started button, playground link, playground auto-detection prompt, automations guidance section, and bundles the playground spec into the extension package. All code is ES5, global scope, inline CSS in panel.html.

## Tasks

- [x] 1. Add CSS styles for onboarding components in panel.html
  - [x] 1.1 Add all new CSS rules for landing page components to the `<style>` block in panel.html
    - Add `.landing-welcome` (h1: 18px, font-weight 700, centered, margin-bottom 4px)
    - Add `.landing-tagline` (13px, `--text-secondary`, max 120 chars width, centered)
    - Add `.landing-get-started` (primary CTA, padding 8px 20px)
    - Add `.drop-zone-unified` (dashed border, centered content, max-width 320px, width 100%, cursor pointer)
    - Add `.drop-zone-unified:hover` (border color accent hint)
    - Add `.drop-zone-unified.drag-over` (accent border + accent-soft background)
    - Add `.drop-zone-unified:focus-visible` (keyboard focus ring)
    - Add `.drop-zone-label` (bold text), `.drop-zone-helper` (muted text)
    - Add `.drop-zone-error` (`--error` color, 12px, margin-top 6px, hidden when empty)
    - Add `.playground-prompt` (banner: accent-soft bg, border, rounded, padding 12px)
    - Add `.playground-prompt-text`, `.playground-prompt-actions` (flex row with gap)
    - Add `.landing-playground-link` (`--accent-text`, underline on hover, 13px)
    - Add `.landing-automations` (details/summary: border, radius, margin-top, collapsed default)
    - Add `.automations-content` (padding 12px, prose styling), `.automations-content pre` (bg-elevated, mono font)
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 6.1, 6.2, 6.3_

- [x] 2. Replace `#home-landing` HTML markup in panel.html
  - [x] 2.1 Replace the existing `#home-landing` section content with the new onboarding markup
    - Add `<h1 class="landing-welcome">Welcome to Tomation</h1>`
    - Add tagline `<p>` below heading (≤120 chars communicating extension purpose)
    - Add Get Started button `<button id="get-started-btn" class="btn btn-primary landing-get-started">Get Started</button>`
    - Add unified drop zone `<div id="drop-zone" class="drop-zone-unified" tabindex="0" role="button" aria-label="Load spec file">` with label, helper text, hidden file input
    - Add `<p id="drop-zone-error" class="drop-zone-error" role="alert" aria-live="polite"></p>` for inline errors
    - Add playground prompt `<div id="playground-prompt" style="display:none;">` with Load and Dismiss buttons
    - Add playground link `<a id="playground-link" class="landing-playground-link" ...>`
    - Add automations section `<details id="automations-section" class="landing-automations">` with summary, DSL explanation, compiler instruction, and docs link
    - Ensure top-to-bottom order: welcome, tagline, Get Started, drop zone, error, playground prompt, playground link, automations section
    - _Requirements: 1.1, 1.2, 2.1, 2.5, 3.1, 4.1, 4.2, 4.3, 5.1, 7.3, 8.1, 8.2, 8.3, 8.4, 8.5_

- [x] 3. Implement unified drop zone logic in panel.js
  - [x] 3.1 Add `isPlaygroundUrl`, `showDropZoneError`, `clearDropZoneError`, and drop zone event handlers
    - Add `isPlaygroundUrl(url)` — returns true if url starts with `https://facka.github.io/tomation/` or equals `https://facka.github.io/tomation` exactly
    - Add `showDropZoneError(msg)` — sets text content on `#drop-zone-error`
    - Add `clearDropZoneError()` — clears `#drop-zone-error` text content
    - Add `handleUnifiedDropZoneClick()` — triggers `#spec-file-input.click()`
    - Add drag/drop handlers: `dragenter` adds `.drag-over` and clears error; `dragleave` removes `.drag-over` (only on boundary exit); `dragover` prevents default; `drop` validates single file + extension, calls `handleDroppedFile` or shows inline error
    - Multi-file drop shows error "Only a single file can be loaded at a time"
    - Invalid extension shows error "Invalid file type. Please drop a .tomation.json file"
    - On click, clear previous error
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

  - [ ]* 3.2 Write property test for `isPlaygroundUrl`
    - **Property 1: Playground URL detection correctness**
    - Generate random URL strings (valid URLs, random strings, near-misses) and verify correct classification
    - Test file: `packages/extension/src/isPlaygroundUrl.test.js`
    - **Validates: Requirements 7.2**

- [x] 4. Implement Get Started button and playground link handlers in panel.js
  - [x] 4.1 Wire Get Started button and playground link click handlers
    - Get Started button click: call `api.tabs.create({ url: 'https://facka.github.io/tomation/' })`
    - Playground link click (if needed for extension context): call `api.tabs.create` similarly
    - _Requirements: 3.2, 4.1, 4.2_

- [x] 5. Implement playground auto-detection in background.js
  - [x] 5.1 Add `TAB_URL_UPDATE` message sending in background.js
    - In `tabs.onActivated` handler: get tab info and send `{ type: 'TAB_URL_UPDATE', url: tab.url }` via `safeSendMessage`
    - In `tabs.onUpdated` handler (on status complete): query active tab and send `TAB_URL_UPDATE` via `safeSendMessage`
    - _Requirements: 7.2_

  - [x] 5.2 Add `LOAD_BUNDLED_SPEC` message handler in background.js
    - On receiving `LOAD_BUNDLED_SPEC`: fetch `chrome.runtime.getURL('bundled/playground-tests.tomation.json')`, parse JSON, send `BUNDLED_SPEC_LOADED` with spec and filename back to panel
    - On error: send `BUNDLED_SPEC_ERROR` with error message
    - _Requirements: 7.1, 7.4, 7.5_

- [x] 6. Implement playground prompt UI logic in panel.js
  - [x] 6.1 Add playground prompt show/hide/dismiss logic and message handling
    - Add `var playgroundPromptDismissed = false;` session state
    - Add `showPlaygroundPrompt()` and `hidePlaygroundPrompt()` functions
    - Handle `TAB_URL_UPDATE` message: if `isPlaygroundUrl(url)` AND no spec loaded AND not dismissed AND not running → show prompt; otherwise hide
    - Wire `#load-playground-btn` click: send `LOAD_BUNDLED_SPEC` to background
    - Wire `#dismiss-playground-btn` click: set `playgroundPromptDismissed = true`, hide prompt
    - Handle `BUNDLED_SPEC_LOADED` message: call `addSpec(hostname, filename, spec)` and re-render
    - Handle `BUNDLED_SPEC_ERROR` message: show inline error in prompt area
    - _Requirements: 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

- [ ] 7. Checkpoint - Verify panel UI renders correctly
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Update build script to bundle playground spec
  - [x] 8.1 Add bundled spec copy step to `packages/extension/build.js`
    - Copy `examples/playground-tests/playground-tests.tomation.json` to `dist/<target>/bundled/playground-tests.tomation.json` for each build target
    - Create `bundled/` directory if it does not exist
    - _Requirements: 7.1_

- [ ] 9. Update `renderHomeView` to handle landing page visibility
  - [ ] 9.1 Update `renderHomeView` in panel.js to manage onboarding element visibility
    - When spec is loaded: hide Get Started button, hide playground prompt, hide automations section, hide playground link
    - When no spec loaded: show all onboarding elements
    - After determining landing vs loaded state, check playground prompt visibility based on current tab URL and dismiss state
    - _Requirements: 3.3, 3.4, 7.6, 8.7_

- [ ] 10. Final checkpoint - Ensure all components are wired together
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- All code must be ES5 (var, function declarations, no arrow functions, global scope)
- panel.html uses inline CSS (no build step for styles)
- The bundled playground spec source is at `examples/playground-tests/playground-tests.tomation.json`
- The playground URL is `https://facka.github.io/tomation/`
- Property test uses fast-check with node:test + node:assert/strict
- Do NOT run tests as part of any task — the user runs tests manually

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "5.1", "5.2", "8.1"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["3.1", "4.1"] },
    { "id": 3, "tasks": ["3.2", "6.1"] },
    { "id": 4, "tasks": ["9.1"] }
  ]
}
```
