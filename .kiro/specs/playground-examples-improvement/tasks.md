# Implementation Plan: Playground Examples Improvement

## Overview

This plan implements a two-tier navigation system (Main Navbar + Secondary Examples Navbar), creates the Examples Hub page (`playground.html`), and replaces the landing page grid with a carousel. All pages are static HTML with Tailwind CSS (CDN), Prism.js, and vanilla JavaScript. Existing nav elements on sub-pages will be replaced with the new two-tier system, and `index.html` will gain the Main Navbar above its existing carousel.

## Tasks

- [x] 1. Implement Main Navbar on index.html
  - [x] 1.1 Add Main Navbar to index.html (Landing Page)
    - Insert a `<nav aria-label="Main navigation">` element at the top of `<body>`, before the existing grid-noise div
    - Include Tomation SVG icon (purple rounded rect #6B46C1 with white "T", `role="img"`, `aria-label="Tomation logo"`), brand text "Tomation", center-left links (Docs → GitHub repo, Examples → `playground.html`), and right-side icon links (Chrome Extension, GitHub)
    - Style with dark background, emerald accents, backdrop blur, responsive padding, 44×44px minimum touch targets on mobile
    - Preserve the existing carousel and all other content below the navbar
    - Do NOT add the Secondary Examples Navbar on this page
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 6.1, 6.7, 6.9_

- [x] 2. Create Examples Hub page with both navbars
  - [x] 2.1 Create playground.html with Main Navbar, Secondary Navbar, code cards grid, and How-To-Run section
    - Create `examples/playground/playground.html` with both navigation tiers at the top
    - Main Navbar identical to index.html (same markup, paths adjusted: `playground.html` for Examples link)
    - Secondary Examples Navbar (`<nav aria-label="Examples navigation">`) with links: Playground (active), Login, Todo, Navigation — using relative paths from playground.html depth (`login/index.html`, `todo/index.html`, `navigation/index.html`)
    - Active link styled with `text-emerald-300 border-b-2 border-emerald-400`; inactive links with `text-slate-400 hover:text-slate-200`
    - Code Cards grid: responsive (1 col <640px, 2 cols 640–1023px, 3 cols ≥1024px), each card with ≤10 line code snippet (Prism.js highlighted), title, description, link to sub-page
    - How-To-Run section below cards: ordered list (install extension, visit page, open side panel, click run, note about custom project TS compilation)
    - Use same dark theme, Sora + JetBrains Mono fonts, Tailwind CDN, Prism.js CDN as index.html
    - Footer consistent with landing page
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 2.1–2.10, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 6.1, 6.2, 6.5, 6.6, 6.7, 6.9_

- [x] 3. Add both navbars to Login sub-page
  - [x] 3.1 Replace existing nav on login/index.html with Main Navbar and Secondary Examples Navbar
    - Remove any existing `<nav aria-label="Playground navigation">` element
    - Insert Main Navbar at top of body (paths adjusted: `../playground.html` for Examples link, same external URLs)
    - Insert Secondary Examples Navbar below Main Navbar with links: Playground (`../playground.html`), Login (active, self), Todo (`../todo/index.html`), Navigation (`../navigation/index.html`)
    - Active state on "Login" link
    - Preserve all existing `<main>` content, form, IDs (`username`, `password`, `login-btn`, `message`), event handlers, and DOM hierarchy
    - Ensure navbars do not introduce conflicting IDs or class names with test selectors
    - _Requirements: 2.1, 2.8, 2.9, 2.10, 3.1, 3.5, 3.8, 3.9, 3.10, 3.11, 5.3, 5.5, 5.6, 6.1, 6.2, 6.5, 6.7_

- [x] 4. Add both navbars to Todo sub-page
  - [x] 4.1 Replace existing nav on todo/index.html with Main Navbar and Secondary Examples Navbar
    - Remove any existing `<nav aria-label="Playground navigation">` element
    - Insert Main Navbar at top of body (paths adjusted: `../playground.html` for Examples link)
    - Insert Secondary Examples Navbar below Main Navbar with links: Playground (`../playground.html`), Login (`../login/index.html`), Todo (active, self), Navigation (`../navigation/index.html`)
    - Active state on "Todo" link
    - Preserve all existing `<main>` content, IDs (`todo-input`, `add-btn`, `todo-list`), class names (`.todo-item`, `.todo-text`, `.delete-btn`), and event handlers
    - _Requirements: 2.1, 2.8, 2.9, 2.10, 3.1, 3.6, 3.8, 3.9, 3.10, 3.11, 5.3, 5.5, 5.6, 6.1, 6.2, 6.5, 6.7_

- [x] 5. Add both navbars to Navigation sub-pages
  - [x] 5.1 Replace existing nav on navigation/index.html with Main Navbar and Secondary Examples Navbar
    - Remove any existing `<nav aria-label="Playground navigation">` element
    - Insert Main Navbar at top of body (paths adjusted: `../playground.html` for Examples link)
    - Insert Secondary Examples Navbar below Main Navbar with links: Playground (`../playground.html`), Login (`../login/index.html`), Todo (`../todo/index.html`), Navigation (active, self/`index.html`)
    - Active state on "Navigation" link
    - Preserve all existing `<main>` content, IDs (`step-indicator`, `page-title`, `page-description`, `next-btn`), and DOM hierarchy
    - _Requirements: 2.1, 2.8, 2.9, 2.10, 3.1, 3.7, 3.8, 3.9, 3.10, 3.11, 5.3, 5.5, 5.6, 6.1, 6.2, 6.5, 6.7_

  - [x] 5.2 Replace existing nav on navigation/page2.html with Main Navbar and Secondary Examples Navbar
    - Same navbar structure as navigation/index.html (Navigation link active)
    - Paths: Examples → `../playground.html`, Playground → `../playground.html`, Login → `../login/index.html`, Todo → `../todo/index.html`, Navigation → `index.html`
    - Preserve all existing `<main>` content, IDs (`step-indicator`, `page-title`, `page-description`, `back-btn`, `next-btn`)
    - _Requirements: 2.1, 2.8, 2.9, 2.10, 3.1, 3.7, 3.8, 3.9, 3.10, 3.11, 5.3, 5.5, 5.6, 6.1, 6.2, 6.5, 6.7_

  - [x] 5.3 Replace existing nav on navigation/page3.html with Main Navbar and Secondary Examples Navbar
    - Same navbar structure as navigation/index.html (Navigation link active)
    - Paths: Examples → `../playground.html`, Playground → `../playground.html`, Login → `../login/index.html`, Todo → `../todo/index.html`, Navigation → `index.html`
    - Preserve all existing `<main>` content, IDs (`step-indicator`, `page-title`, `success-message`, `page-description`, `restart-btn`)
    - _Requirements: 2.1, 2.8, 2.9, 2.10, 3.1, 3.7, 3.8, 3.9, 3.10, 3.11, 5.3, 5.5, 5.6, 6.1, 6.2, 6.5, 6.7_

- [x] 6. Checkpoint - Verify navigation structure
  - Ensure all pages render correctly with proper navbars, ask the user if questions arise.

- [x] 7. Implement carousel on index.html
  - [x] 7.1 Replace the existing three-column grid with carousel component on index.html
    - Replace the `#examples` section grid with a carousel container using `aria-roledescription="carousel"` and `aria-label="Code examples"`
    - Add previous/next buttons with `aria-label="Previous example"` / `aria-label="Next example"` positioned on either side
    - Add position indicator text (e.g., "1 of 3")
    - Add `aria-live="polite"` on card container with dynamic `aria-label="Example N of 3"`
    - Show one full Code_Card at a time with complete code snippet (no truncation), horizontal scroll within code block if needed
    - Implement vanilla JS state machine: `currentIndex`, next/prev with modulo wrapping
    - Add keyboard navigation (Left/Right arrow keys when carousel or controls have focus)
    - Re-highlight code with Prism.js after card switch
    - Preserve hero section, key features section, and footer in their current positions
    - Preserve the existing modal/code-viewer functionality
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 6.3, 6.4, 6.6, 6.7, 6.8_

- [x] 8. Final checkpoint - Verify complete implementation
  - Ensure all pages render correctly, carousel works, navigation links are correct, and no test selectors are broken. Ask the user if questions arise.

- [ ]* 9. Write property-based tests for carousel logic
  - [ ]* 9.1 Write property test for carousel index wrapping
    - **Property 1: Carousel index wrapping**
    - For any sequence of next/prev operations, `currentIndex` always remains within bounds `[0, totalCards - 1]`
    - Use fast-check library with minimum 100 iterations
    - **Validates: Requirements 4.2, 4.7**

  - [ ]* 9.2 Write property test for carousel position indicator accuracy
    - **Property 2: Carousel position indicator accuracy**
    - For any carousel state, the displayed position text equals `"${currentIndex + 1} of ${totalCards}"` and the aria-label matches
    - Use fast-check library with minimum 100 iterations
    - **Validates: Requirements 4.8, 6.8**

  - [ ]* 9.3 Write property test for carousel navigation cycle
    - **Property 3: Carousel navigation is a cycle**
    - For any starting index, performing `totalCards` consecutive next operations returns to the original index (same for prev)
    - Use fast-check library with minimum 100 iterations
    - **Validates: Requirements 4.2, 4.7**

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each page contains its own inline navbar markup (no JS includes) per design decision
- Relative paths must be adjusted per page depth (root-level vs sub-directory)
- Navbars must NOT introduce IDs or class names that conflict with existing test selectors
- The carousel on index.html already exists from a previous implementation — task 7.1 may need to update/refine it rather than build from scratch
- Property tests validate the carousel's vanilla JS logic using fast-check

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1"] },
    { "id": 1, "tasks": ["3.1", "4.1", "5.1", "5.2", "5.3"] },
    { "id": 2, "tasks": ["7.1"] },
    { "id": 3, "tasks": ["9.1", "9.2", "9.3"] }
  ]
}
```
