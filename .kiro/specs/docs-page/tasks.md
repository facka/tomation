# Implementation Plan: Docs Page

## Overview

Create a static documentation page (`examples/playground/docs.html`) with a fixed left sidebar, collapsible navigation sections, IntersectionObserver-based scroll spy, responsive hamburger overlay for mobile, and full DSL reference content sourced from the README. Update the Main Navbar "Docs" link across all playground pages to point to the new docs page.

## Tasks

- [x] 1. Create docs.html with base structure and Main Navbar
  - [x] 1.1 Create `examples/playground/docs.html` with HTML boilerplate, CDN links (Tailwind, Prism.js, Google Fonts), Tailwind config, dark theme styles, and the Main Navbar with "Docs" link set to `docs.html` and marked active
    - Include `<head>` with meta tags, font preconnects, Tailwind CDN script with custom theme config (Sora, JetBrains Mono, neon/surface colors, glow shadow), Prism tomorrow theme CSS
    - Include the same `<style>` block for body background gradients, grid-noise, code-scroll scrollbar, and Prism overrides from existing playground pages
    - Main Navbar matches existing pattern from `playground.html` / `index.html` but with "Docs" link `href="docs.html"` and emerald active styling on it
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 7.2_

- [x] 2. Implement sidebar navigation and content area layout
  - [x] 2.1 Add the fixed sidebar `<nav>` with all top-level sections and the API section's child links
    - Use `<nav aria-label="Documentation navigation">` with fixed position, `w-64`, `top-[60px]`, `h-[calc(100vh-60px)]`, `overflow-y-auto`, `bg-slate-900/95 backdrop-blur`, `border-r border-slate-700/70`
    - Render collapsible section buttons with `aria-expanded="false"` and chevron icons for sections with children (API)
    - Render leaf sidebar links as `<a href="#anchor-id">` elements with classes for hover/active states
    - Sections in order: Get Started & Installation, Tomation CLI, Configuration File, API (with 4 children), Tests, Automations, POM Files
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 8.1, 8.2, 8.3_

  - [x] 2.2 Add the content area `<main>` skeleton with all section headings and unique anchor IDs
    - Use `ml-64` on desktop (`md:ml-64`), `ml-0` on mobile, `max-w-4xl`, `px-6 py-10 sm:px-10`
    - Add `<h1>` page title, `<h2>` for each top-level section, `<h3>` for sub-sections under API
    - Each heading gets a unique `id` matching sidebar hrefs: `get-started`, `cli`, `configuration`, `element-locators`, `where-matchers`, `user-functions`, `assertions`, `tests`, `automations`, `pom-files`
    - _Requirements: 5.1, 5.5, 5.6, 5.7, 8.4_

- [x] 3. Populate documentation content
  - [x] 3.1 Write the "Get Started & Installation" section content
    - Cover project introduction, browser extension installation (Chrome link), compiler installation via npm
    - Include code blocks with `language-bash` for install commands
    - _Requirements: 6.1_

  - [x] 3.2 Write the "Tomation CLI" section content
    - Cover `npx tomation compile` command and `npx tomation watch` for live recompilation
    - Include code blocks with `language-bash`
    - _Requirements: 6.2_

  - [x] 3.3 Write the "Configuration File" section content
    - Cover `tomation.config.ts` structure: meta, pom, tests, automations, baseUrl fields
    - Include a full config example in a `language-typescript` code block
    - _Requirements: 6.3_

  - [x] 3.4 Write the "Element/Locators Builder API" section content
    - Cover `is.TAG.where(matcher).as('Label')` pattern, `childOf` scoping, XPath `Element()` declarations
    - Include TypeScript code examples for each pattern
    - _Requirements: 6.4_

  - [x] 3.5 Write the "Where Matchers" section content
    - List all matcher functions (idIs, innerTextIs, innerTextContains, classIncludes, placeholderIs, nameIs, typeIs, valueIs, ariaLabel, roleIs, titleIs, hrefContains, isDisabled, nthChild, dataAttr, closestLabelIs) with descriptions and examples
    - Render as a styled table with dark theme borders
    - _Requirements: 6.5, 5.3_

  - [x] 3.6 Write the "User Functions: Click, Type, Select" section content
    - Cover Click, Type, TypePassword, Select interaction functions with usage examples
    - Include Save to Context (SaveText, SaveAttribute, SaveValue, Save) and Date Helpers
    - _Requirements: 6.6_

  - [x] 3.7 Write the "Assertions" section content
    - Cover AssertExists, AssertNotExists, AssertHasText and related assertion functions with examples
    - _Requirements: 6.7_

  - [x] 3.8 Write the "Tests" section content
    - Cover Test() declaration syntax, test file structure, and how tests are compiled and run
    - _Requirements: 6.8_

  - [x] 3.9 Write the "Automations" section content
    - Cover Automation declaration, parameter types (string, number, Date, union literals), optional params, config, differences from Tests
    - Include the parameter types table and code examples
    - _Requirements: 6.9_

  - [x] 3.10 Write the "POM Files" section content
    - Cover the Page Object Model pattern, folder-based namespacing, export default pattern
    - _Requirements: 6.10_

- [x] 4. Checkpoint - Verify static content renders correctly
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement JavaScript interactivity
  - [x] 5.1 Implement the Section Collapse Controller
    - Attach click handlers to `.sidebar-section-toggle` buttons
    - Toggle `hidden` class on adjacent `.sidebar-children` lists
    - Update `aria-expanded` attribute on each toggle
    - All sections start collapsed by default
    - _Requirements: 2.4, 2.5, 8.2_

  - [x] 5.2 Implement the Scroll Spy Controller using IntersectionObserver
    - Create `IntersectionObserver` with `rootMargin: '-60px 0px -60% 0px'`
    - Observe all elements with `[data-section]` or matching section IDs
    - On intersection, find corresponding sidebar link by matching `href` to section `id`
    - Apply active class (`text-emerald-300 border-l-2 border-emerald-400 bg-emerald-500/5`) to matching link, remove from others
    - Auto-expand parent sidebar section when a child link becomes active
    - Ensure exactly one link is marked active at any time
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [x] 5.3 Implement the Sidebar Toggle Controller for mobile
    - Add hamburger button (hidden on `md:` and above) with `aria-label="Toggle documentation navigation"` and `aria-expanded` attribute
    - On click, show sidebar as overlay with `z-50` positioning and a `bg-slate-950/50` backdrop
    - Clicking a sidebar link on mobile closes the overlay after initiating smooth scroll
    - Clicking the backdrop closes the overlay
    - Update `aria-expanded` on open/close
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 8.5, 8.6_

  - [x] 5.4 Implement smooth scroll on sidebar link click
    - Add click handlers to all sidebar links that call `element.scrollIntoView({ behavior: 'smooth' })`
    - Prevent default anchor jump behavior
    - _Requirements: 3.4_

- [x] 6. Checkpoint - Verify interactivity works
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Update Main Navbar "Docs" link on all playground pages
  - [x] 7.1 Update the "Docs" link href from `https://github.com/facka/tomation` to `docs.html` in `examples/playground/index.html`
    - _Requirements: 7.1_

  - [x] 7.2 Update the "Docs" link href from `https://github.com/facka/tomation` to `docs.html` in `examples/playground/playground.html`
    - _Requirements: 7.1_

  - [x] 7.3 Update the "Docs" link href in `examples/playground/login/index.html`, `examples/playground/todo/index.html`, `examples/playground/navigation/index.html`, `examples/playground/navigation/page2.html`, `examples/playground/navigation/page3.html`
    - Adjust relative paths as needed (e.g., `../docs.html` for subdirectory pages)
    - _Requirements: 7.1_

- [x] 8. Final checkpoint - Verify complete integration
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- No property-based tests are applicable for this feature (static HTML/CSS/JS UI page)
- All content is hardcoded in the HTML file — no build step or runtime fetching
- The page follows the same single-file architecture as existing playground pages
- CDN resources degrade gracefully if unavailable (content remains readable)
- Sidebar link active state and section expansion are driven by scroll spy on page load
- Each task references specific requirements for traceability

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1", "2.2"] },
    { "id": 2, "tasks": ["3.1", "3.2", "3.3", "3.4", "3.5", "3.6", "3.7", "3.8", "3.9", "3.10"] },
    { "id": 3, "tasks": ["5.1", "5.2", "5.3", "5.4"] },
    { "id": 4, "tasks": ["7.1", "7.2", "7.3"] }
  ]
}
```
