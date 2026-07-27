# Requirements Document

## Introduction

This feature adds a dedicated documentation page to the Tomation playground site. The page presents the full DSL reference and feature documentation (sourced from the project README) in a well-structured, browsable format with a Playwright-style left sidebar for navigation. The docs page integrates with the existing Main Navbar so users can access documentation directly from any playground page without leaving the site.

## Glossary

- **Docs_Page**: The static HTML documentation page located at `examples/playground/docs.html`
- **Sidebar**: A fixed left-side navigation panel on the Docs_Page containing collapsible section links for navigating documentation content
- **Sidebar_Section**: A top-level group in the Sidebar that can be expanded or collapsed to reveal child links
- **Sidebar_Link**: A clickable item within the Sidebar that scrolls the main content area to the corresponding section anchor
- **Content_Area**: The scrollable main content region to the right of the Sidebar that renders all documentation as formatted HTML
- **Section_Anchor**: An HTML element with a unique `id` attribute used as a scroll target for Sidebar_Links
- **Scroll_Spy**: A JavaScript mechanism that monitors the viewport scroll position and highlights the Sidebar_Link corresponding to the currently visible Section_Anchor
- **Main_Navbar**: The primary navigation bar (Tier 1) present on all playground pages, as defined in the playground-examples-improvement spec
- **Active_Indicator**: A visual style applied to the Sidebar_Link whose corresponding Section_Anchor is currently visible in the viewport

## Requirements

### Requirement 1: Docs Page Creation and Location

**User Story:** As a visitor, I want a dedicated documentation page within the playground site so that I can read comprehensive Tomation documentation without leaving the site.

#### Acceptance Criteria

1. THE Docs_Page SHALL be accessible at the path `examples/playground/docs.html`
2. THE Docs_Page SHALL be a static HTML file requiring no build step, consistent with the existing playground page pattern
3. THE Docs_Page SHALL include the Main_Navbar at the top of the page
4. THE Docs_Page SHALL use Tailwind CSS via CDN for styling
5. THE Docs_Page SHALL use Prism.js for code syntax highlighting in all code blocks
6. THE Docs_Page SHALL use the same dark theme with emerald accents as the existing playground pages
7. THE Docs_Page SHALL use Sora font for body text and JetBrains Mono font for code blocks

### Requirement 2: Left Sidebar Navigation Structure

**User Story:** As a visitor, I want a sidebar with organized, collapsible sections so that I can quickly find and navigate to specific documentation topics.

#### Acceptance Criteria

1. THE Sidebar SHALL be rendered as a fixed-position panel on the left side of the Docs_Page
2. THE Sidebar SHALL contain the following top-level Sidebar_Sections in order: "Get Started & Installation", "Tomation CLI", "Configuration File", "API", "Tests", "Automations", "POM Files"
3. THE Sidebar "API" Sidebar_Section SHALL contain the following child Sidebar_Links: "Element/Locators Builder API", "Where Matchers", "User Functions: Click, Type, Select", "Assertions"
4. WHEN a Sidebar_Section containing child links is clicked, THE Sidebar SHALL toggle the visibility of the child Sidebar_Links within that section
5. THE Sidebar SHALL render all top-level Sidebar_Sections in a collapsed state by default, except for the section corresponding to the currently visible content
6. THE Sidebar SHALL use a semantic HTML nav element with an aria-label attribute of "Documentation navigation"
7. THE Sidebar SHALL apply the dark theme with emerald accent colors consistent with the playground styling

### Requirement 3: Sidebar Scroll Spy and Active Highlighting

**User Story:** As a visitor scrolling through documentation, I want the sidebar to highlight the section I am currently reading so that I always know my position within the document.

#### Acceptance Criteria

1. WHILE the user scrolls the Content_Area, THE Scroll_Spy SHALL determine which Section_Anchor is currently visible in the viewport
2. WHEN a Section_Anchor becomes visible in the viewport, THE Sidebar SHALL apply the Active_Indicator style to the corresponding Sidebar_Link
3. THE Active_Indicator SHALL visually distinguish the active Sidebar_Link from inactive links using a different text color or background color, with exactly one link marked active at any time
4. WHEN a Sidebar_Link is clicked, THE Content_Area SHALL smooth-scroll to the corresponding Section_Anchor

### Requirement 4: Sidebar Responsive Behavior

**User Story:** As a mobile user, I want the sidebar to collapse into a toggleable menu so that I can still navigate documentation on small screens without losing content space.

#### Acceptance Criteria

1. WHILE the viewport width is below 768px, THE Sidebar SHALL be hidden by default and accessible via a hamburger menu button
2. WHEN the hamburger menu button is activated on viewports below 768px, THE Sidebar SHALL appear as an overlay panel
3. WHEN a Sidebar_Link is activated on viewports below 768px, THE Sidebar overlay SHALL close after initiating the scroll to the target Section_Anchor
4. WHILE the viewport width is 768px or above, THE Sidebar SHALL be visible as a fixed panel and the hamburger menu button SHALL be hidden
5. THE hamburger menu button SHALL have an aria-label of "Toggle documentation navigation" and SHALL use an aria-expanded attribute reflecting the Sidebar visibility state

### Requirement 5: Documentation Content Rendering

**User Story:** As a visitor, I want the documentation content to be well-formatted with proper headings, code blocks, and tables so that I can easily read and understand the DSL reference.

#### Acceptance Criteria

1. THE Content_Area SHALL render documentation content as formatted HTML with proper heading hierarchy (h1 through h4)
2. THE Content_Area SHALL render code blocks with Prism.js syntax highlighting using the TypeScript language grammar
3. THE Content_Area SHALL render tables with visible borders and readable styling consistent with the dark theme
4. THE Content_Area SHALL render inline code with a visually distinct background color
5. THE Content_Area SHALL assign a unique Section_Anchor id to each major content section corresponding to a Sidebar_Link
6. THE Content_Area SHALL be positioned to the right of the Sidebar on viewports 768px and above, occupying the remaining horizontal space
7. WHILE the viewport width is below 768px, THE Content_Area SHALL occupy the full page width

### Requirement 6: Documentation Content Sections

**User Story:** As a visitor, I want all key Tomation features documented in organized sections so that I can learn about each part of the framework.

#### Acceptance Criteria

1. THE Content_Area SHALL include a "Get Started & Installation" section covering the project introduction, browser extension installation, and compiler installation
2. THE Content_Area SHALL include a "Tomation CLI" section covering the compile command and watch mode
3. THE Content_Area SHALL include a "Configuration File" section covering the `tomation.config.ts` structure and available fields
4. THE Content_Area SHALL include an "Element/Locators Builder API" section covering the `is.TAG.where().as()` pattern, `childOf` scoping, and XPath element declarations
5. THE Content_Area SHALL include a "Where Matchers" section listing all available matcher functions with descriptions and usage examples
6. THE Content_Area SHALL include a "User Functions: Click, Type, Select" section covering Click, Type, TypePassword, and Select interaction functions
7. THE Content_Area SHALL include an "Assertions" section covering AssertExists, AssertNotExists, AssertHasText, and related assertion functions
8. THE Content_Area SHALL include a "Tests" section covering the Test() declaration syntax and test file structure
9. THE Content_Area SHALL include an "Automations" section covering Automation declaration, parameter types, and differences from tests
10. THE Content_Area SHALL include a "POM Files" section covering the Page Object Model pattern and folder-based namespacing

### Requirement 7: Main Navbar Docs Link Update

**User Story:** As a visitor, I want the "Docs" link in the Main Navbar to navigate to the new documentation page so that I can access documentation directly from any playground page.

#### Acceptance Criteria

1. THE Main_Navbar "Docs" link on All_Pages SHALL navigate to `docs.html` instead of `https://github.com/facka/tomation`
2. WHEN the Docs_Page is the current page, THE Main_Navbar "Docs" link SHALL be visually distinguished as active

### Requirement 8: Accessibility

**User Story:** As a visitor using assistive technology, I want the documentation page to be accessible so that I can navigate and read content regardless of ability.

#### Acceptance Criteria

1. THE Sidebar SHALL use a semantic HTML nav element with an aria-label of "Documentation navigation"
2. THE Sidebar collapsible sections SHALL use aria-expanded attributes to indicate expansion state
3. THE Sidebar_Links SHALL use semantic anchor elements with href attributes pointing to Section_Anchor ids
4. THE Content_Area SHALL use semantic heading elements (h1, h2, h3, h4) in correct hierarchical order
5. THE Docs_Page SHALL provide visible focus indicators on all interactive elements when navigated via keyboard
6. THE hamburger menu button SHALL be keyboard-accessible and SHALL toggle the Sidebar when activated via Enter or Space keys
7. THE Docs_Page SHALL render on viewports from 320px to 1920px wide without horizontal page scrolling or content overlapping
