# Requirements Document

## Introduction

This feature restructures the Tomation playground site to improve discoverability of examples and streamline the onboarding experience. A dedicated examples hub page (`playground.html`) consolidates all demo apps with usage instructions. The main landing page (`index.html`) is updated to present examples in a carousel format. All pages gain a two-tier navigation system inspired by the Playwright docs: a Main Navbar present on every page for brand identity and global links, and a Secondary Examples Navbar on sub-pages for quick navigation between examples.

## Glossary

- **Landing_Page**: The main entry point at `examples/playground/index.html`, deployed to `https://facka.github.io/tomation/`
- **Examples_Hub**: A new page at `examples/playground/playground.html` that aggregates all demo app cards and usage instructions
- **Sub_Page**: Any example app page (`login/index.html`, `todo/index.html`, `navigation/index.html`, `navigation/page2.html`, `navigation/page3.html`)
- **All_Pages**: The complete set of playground pages: Landing_Page, Examples_Hub, and all Sub_Pages
- **Main_Navbar**: The primary navigation bar (Tier 1) rendered at the top of All_Pages, containing the Tomation brand icon and title, global links (Docs, Examples), and external resource icons (Chrome Extension, GitHub)
- **Secondary_Examples_Navbar**: A secondary navigation bar (Tier 2) rendered below the Main_Navbar on the Examples_Hub and all Sub_Pages, containing links to navigate between example apps
- **Tomation_Icon**: An inline SVG icon depicting a purple rounded rectangle (background color #6B46C1) with a white capital "T", matching the Chrome extension icon design
- **Carousel**: A UI component that displays one example card at a time with controls to navigate between cards
- **Code_Card**: A visual card containing a code snippet preview, title, description, and links to the corresponding Sub_Page
- **How_To_Run_Section**: An instructional block on the Examples_Hub explaining how to install and use the Chrome extension with the playground

## Requirements

### Requirement 1: Examples Hub Page Creation

**User Story:** As a visitor, I want a dedicated examples hub page so that I can see all available demo apps in one place and understand how to run them.

#### Acceptance Criteria

1. THE Examples_Hub SHALL be accessible at the path `examples/playground/playground.html`
2. THE Examples_Hub SHALL display Code_Cards for Login, Todo, and Navigation demo apps in a grid layout that shows 3 columns on viewports 1024px and above, 2 columns on viewports between 640px and 1023px, and 1 column on viewports below 640px
3. THE Examples_Hub SHALL render each Code_Card with a code snippet preview of no more than 10 lines, a title, a description, and a link to the corresponding Sub_Page
4. THE Examples_Hub SHALL include a How_To_Run_Section below the Code_Cards grid
5. THE How_To_Run_Section SHALL explain the following steps: install the Chrome extension, visit this page to auto-load examples, open the browser side panel, and click run
6. THE How_To_Run_Section SHALL mention that custom projects require compiling TypeScript before loading tests
7. THE Examples_Hub SHALL include the Main_Navbar and the Secondary_Examples_Navbar at the top of the page
8. THE Examples_Hub SHALL use the same dark theme with emerald accents, Tailwind CSS via CDN, Prism.js for syntax highlighting, and Sora plus JetBrains Mono fonts as the Landing_Page

### Requirement 2: Main Navbar (Tier 1)

**User Story:** As a visitor, I want a consistent brand navigation bar on every playground page so that I can identify the site, access documentation, and find external resources from any page.

#### Acceptance Criteria

1. THE Main_Navbar SHALL appear at the top of All_Pages, including the Landing_Page, Examples_Hub, and all Sub_Pages
2. THE Main_Navbar SHALL display the Tomation_Icon on the left side as an inline SVG element with a purple rounded rectangle background (#6B46C1) and a white capital "T"
3. THE Main_Navbar SHALL display the text "Tomation" adjacent to the Tomation_Icon on the left side, styled as a brand title
4. THE Main_Navbar SHALL display a "Docs" link in the center-left area that navigates to `https://github.com/facka/tomation`
5. THE Main_Navbar SHALL display an "Examples" link in the center-left area that navigates to `playground.html`
6. THE Main_Navbar SHALL display a Chrome Extension icon link on the right side that navigates to `https://chromewebstore.google.com/detail/plinecpdmbklpddinihlmcempieeehch?utm_source=gh-page`
7. THE Main_Navbar SHALL display a GitHub icon link on the right side that navigates to `https://github.com/facka/tomation`
8. THE Main_Navbar SHALL use a semantic HTML nav element with an aria-label attribute of "Main navigation"
9. THE Main_Navbar SHALL use the dark theme with emerald accent colors consistent with the playground styling
10. THE Main_Navbar SHALL remain fully operable on viewports from 320px to 1920px wide, with all links visible and tappable with a minimum touch target size of 44x44 CSS pixels on viewports below 768px

### Requirement 3: Secondary Examples Navbar (Tier 2)

**User Story:** As a visitor, I want a secondary navigation bar on example pages so that I can quickly switch between demo apps without returning to the hub.

#### Acceptance Criteria

1. THE Secondary_Examples_Navbar SHALL appear directly below the Main_Navbar on the Examples_Hub and all Sub_Pages
2. THE Secondary_Examples_Navbar SHALL NOT appear on the Landing_Page
3. THE Secondary_Examples_Navbar SHALL contain links labeled "Playground", "Login", "Todo", and "Navigation"
4. THE Secondary_Examples_Navbar "Playground" link SHALL navigate to the Examples_Hub (`playground.html`)
5. THE Secondary_Examples_Navbar "Login" link SHALL navigate to `login/index.html`
6. THE Secondary_Examples_Navbar "Todo" link SHALL navigate to `todo/index.html`
7. THE Secondary_Examples_Navbar "Navigation" link SHALL navigate to `navigation/index.html`
8. THE Secondary_Examples_Navbar SHALL visually distinguish the currently active page link from inactive links by applying a different text color or background color, with exactly one link marked active at any time
9. THE Secondary_Examples_Navbar SHALL use a semantic HTML nav element with an aria-label attribute of "Examples navigation"
10. THE Secondary_Examples_Navbar SHALL use the dark theme with emerald accent colors consistent with the playground styling
11. THE Secondary_Examples_Navbar SHALL remain fully operable on viewports from 320px to 1920px wide, with all navigation links visible and tappable with a minimum touch target size of 44x44 CSS pixels on viewports below 768px

### Requirement 4: Landing Page Carousel Update

**User Story:** As a visitor, I want to browse examples one at a time on the landing page so that I can see full code content without truncation in a focused view.

#### Acceptance Criteria

1. WHEN the Landing_Page loads, THE Landing_Page SHALL display example Code_Cards in a carousel format showing one card at a time
2. THE Carousel SHALL provide visible previous and next navigation controls positioned on either side of the active card
3. THE Carousel SHALL display the full code snippet content without truncation for the active card, allowing horizontal scroll within the code block if the content exceeds container width
4. WHEN a Code_Card link is activated in the Carousel, THE Landing_Page SHALL navigate to the corresponding Sub_Page
5. THE Landing_Page SHALL remove the existing three-column grid layout for examples
6. THE Landing_Page SHALL retain the hero section, key features section, and footer in their current positions
7. THE Carousel SHALL be keyboard-accessible, allowing navigation via left and right arrow keys when the carousel or its controls have focus
8. THE Carousel SHALL indicate the current position within the total number of cards (e.g., "1 of 3") in a visible text element

### Requirement 5: Preserve Existing Infrastructure and Functionality

**User Story:** As a developer, I want to ensure existing deployment, extension behavior, and sub-app functionality remain unchanged so that nothing breaks for current users.

#### Acceptance Criteria

1. THE GitHub Pages deploy workflow SHALL continue to use `examples/playground/` as the artifact path and SHALL trigger on pushes to the `examples/playground/**` path pattern on the main branch
2. WHEN a user visits a URL matching `https://facka.github.io/tomation`, THE extension bundled `playground-tests.tomation.json` SHALL auto-load its tests by matching against the `meta.urls` field without requiring changes to the JSON file or its URL patterns
3. THE Sub_Pages SHALL retain the following element IDs required by test selectors: `username`, `password`, `login-btn`, `message` (Login), `todo-input`, `add-btn`, `todo-list` (Todo), `page-title`, `step-indicator`, `success-message` (Navigation), and the following class names: `todo-item`, `todo-text`, `delete-btn`
4. THE Landing_Page SHALL remain the file `examples/playground/index.html` served as the root page at `https://facka.github.io/tomation/`
5. WHEN the Main_Navbar or Secondary_Examples_Navbar is added to a page, THE navbar elements SHALL NOT introduce any element IDs or class names that conflict with the test selectors listed in criterion 3, and SHALL be inserted outside the existing main content area
6. WHEN the Main_Navbar or Secondary_Examples_Navbar is added to a Sub_Page, THE Sub_Pages SHALL preserve all existing form submission behavior, event handlers, and DOM hierarchy within the main content area

### Requirement 6: Accessibility and Responsiveness

**User Story:** As a visitor using assistive technology or a mobile device, I want the playground pages to be accessible and responsive so that I can navigate and read content regardless of device or ability.

#### Acceptance Criteria

1. THE Main_Navbar SHALL use a semantic HTML nav element with an aria-label of "Main navigation"
2. THE Secondary_Examples_Navbar SHALL use a semantic HTML nav element with an aria-label of "Examples navigation"
3. THE Carousel SHALL use aria-live="polite" on the card container and aria-roledescription="carousel" on the carousel root element to announce card changes to screen readers without interrupting active user interaction
4. THE Carousel navigation controls SHALL each have an aria-label that describes the control's action (e.g., "Previous example", "Next example")
5. THE Examples_Hub and all Sub_Pages SHALL render on viewports from 320px to 1920px wide without horizontal page scrolling, content overlapping, or interactive elements being unreachable
6. THE Code_Cards SHALL maintain a minimum font size of 12px for code snippets at all supported viewport widths and SHALL enable horizontal scrolling within the code block when content exceeds the container width
7. THE Main_Navbar, Secondary_Examples_Navbar, and Carousel SHALL provide visible focus indicators on all interactive elements when navigated via keyboard
8. THE Carousel card container SHALL include an aria-label indicating the current position within the total card count (e.g., "Example 1 of 3")
9. THE Tomation_Icon inline SVG SHALL include a role="img" attribute and an aria-label of "Tomation logo" for assistive technology identification
