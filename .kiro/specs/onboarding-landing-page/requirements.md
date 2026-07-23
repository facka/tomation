# Requirements Document

## Introduction

This feature redesigns the sidepanel home page (the "landing" state shown when no spec is loaded) to optimize for first-time users who have just installed the Tomation extension. The current landing page presents a generic "Load a spec" message with separate load-button and drop-zone elements. The new onboarding landing page consolidates these into a single unified drop-zone component, adds a welcoming "Get Started" experience, links to the playground so users can immediately try examples, auto-detects when the user is on the playground site to offer a bundled spec, and provides guidance on how to write and compile automations.

## Glossary

- **Sidepanel**: The Chrome extension side panel UI where Tomation displays its interface
- **Landing_Page**: The view rendered inside the sidepanel when no `.tomation.json` spec file is loaded
- **Drop_Zone**: A unified interactive area that accepts both drag-and-drop file input and click-to-browse actions
- **Spec_File**: A `.tomation.json` file that defines browser automation tests for the extension to run
- **Playground**: The hosted GitHub Pages site at `https://facka.github.io/tomation/` containing example apps and test specs
- **Playground_URL**: The base URL `https://facka.github.io/tomation/` and any subpath thereof
- **Bundled_Playground_Spec**: A `.tomation.json` file shipped inside the extension package that contains pre-built tests targeting the Playground site
- **Automations_Section**: A collapsible informational section on the Landing_Page that explains how to write and compile Tomation automations
- **Tomation_DSL**: The `@tomationjs/dsl` TypeScript package used to author automation test files
- **Tomation_Compiler**: The `@tomationjs/compiler` package invoked via `npx @tomationjs/compiler` to compile TypeScript automation files into a Spec_File
- **First_Time_User**: A user who has recently installed the extension and has not yet loaded any spec file

## Requirements

### Requirement 1: Welcome Heading

**User Story:** As a first-time user, I want to see a clear welcome message when I open the sidepanel, so that I understand what the extension does and feel oriented.

#### Acceptance Criteria

1. WHEN no Spec_File is loaded, THE Landing_Page SHALL display a welcome heading with the text "Welcome to Tomation" using a top-level heading element (h1)
2. WHEN no Spec_File is loaded, THE Landing_Page SHALL display a tagline of no more than 120 characters positioned directly below the welcome heading that communicates the extension's purpose of running browser UI tests

### Requirement 2: Unified Drop Zone

**User Story:** As a first-time user, I want a single clear area where I can load my spec file, so that I do not have to decide between a button and a drop area.

#### Acceptance Criteria

1. THE Landing_Page SHALL display a single Drop_Zone component that combines drag-and-drop and click-to-browse functionality
2. WHEN a user clicks the Drop_Zone, THE Landing_Page SHALL open the system file picker filtered to `.json` and `.tomation.json` files
3. WHEN a user drags a file over the Drop_Zone, THE Drop_Zone SHALL display a visually distinct active state by changing its border style and background color, and WHEN the dragged file leaves the Drop_Zone without being dropped, THE Drop_Zone SHALL revert to its default visual state
4. WHEN a user drops a valid Spec_File onto the Drop_Zone, THE Landing_Page SHALL load the spec and transition to the loaded state
5. THE Drop_Zone SHALL display a button label (e.g. "Load Spec File") and helper text (e.g. "or drag and drop a .tomation.json file here") within a single bordered area
6. IF a user drops a file that is not a valid Spec_File, THEN THE Landing_Page SHALL display an inline error message indicating the file is invalid, and the error message SHALL be cleared as soon as the user initiates any new load action (clicking the Drop_Zone or starting to drag a new file over it)
7. IF a user drops more than one file onto the Drop_Zone at once, THEN THE Landing_Page SHALL reject the drop and display an inline error message indicating that only a single file is accepted

### Requirement 3: Get Started Button

**User Story:** As a first-time user who does not have a spec file yet, I want a "Get Started" action that guides me to learn how to create one, so that I am not stuck on the landing page.

#### Acceptance Criteria

1. WHEN no Spec_File is loaded, THE Landing_Page SHALL display a "Get Started" button styled with the primary button variant (accent background, white text) so that it is the most visually prominent action on the page
2. WHEN a user clicks the "Get Started" button, THE Landing_Page SHALL open the Playground URL (`https://facka.github.io/tomation/`) in a new browser tab
3. WHEN a valid Spec_File is loaded, THE Landing_Page SHALL hide the "Get Started" button so that it is no longer visible or focusable
4. IF a loaded Spec_File is invalid or corrupted, THEN THE Landing_Page SHALL continue to display the "Get Started" button

### Requirement 4: Playground Link

**User Story:** As a first-time user, I want a visible link to the playground examples, so that I can try Tomation with pre-built specs before creating my own.

#### Acceptance Criteria

1. WHEN no Spec_File is loaded, THE Landing_Page SHALL display a text link with the label "Try examples in the Playground" pointing to the URL `https://facka.github.io/tomation/`
2. WHEN a user clicks the Playground link, THE Sidepanel SHALL open `https://facka.github.io/tomation/` in a new browser tab
3. THE Playground link SHALL be positioned below the Drop_Zone in the visual hierarchy and styled as a secondary text link (not a button)

### Requirement 5: Visual Hierarchy for Onboarding

**User Story:** As a first-time user, I want the landing page to visually guide me through my options in order of priority, so that I can quickly understand what to do next.

#### Acceptance Criteria

1. WHEN no Spec_File is loaded, THE Landing_Page SHALL arrange content in the following top-to-bottom order: welcome heading, tagline, Get Started button, Drop_Zone, Playground link, Automations_Section
2. THE Landing_Page SHALL keep all onboarding content centered horizontally within the sidepanel
3. THE Landing_Page SHALL use the existing design system variables (colors, radii, fonts) defined in the extension stylesheet for all onboarding elements
4. THE Landing_Page SHALL render the "Get Started" button using primary button styling and the Playground link using secondary or text-link styling; each element SHALL use its assigned style independently regardless of styling failures in other elements

### Requirement 6: Responsive Layout

**User Story:** As a user with varying sidepanel widths, I want the landing page to remain readable and usable, so that the experience works regardless of how wide I set the panel.

#### Acceptance Criteria

1. WHILE the Sidepanel width is at the minimum supported width (280px), THE Landing_Page SHALL display all onboarding elements without horizontal overflow or clipping
2. THE Drop_Zone SHALL expand to fill available horizontal space up to a maximum width of 320px
3. THE Landing_Page text elements SHALL wrap to multiple lines rather than overflow when the sidepanel width is narrow

### Requirement 7: Bundled Playground Spec (Auto-detection)

**User Story:** As a first-time user visiting the playground site, I want the extension to automatically detect that I am on the playground and offer to load a bundled spec, so that I can immediately run tests without needing to manually find and load a file.

#### Acceptance Criteria

1. THE Extension SHALL ship with the Bundled_Playground_Spec file included in the extension package
2. WHEN the active browser tab URL matches the Playground_URL (base URL or any subpath), THE Extension SHALL detect the playground context by reading the current tab URL
3. WHEN the playground context is detected and no Spec_File is currently loaded, THE Extension SHALL display a prompt in the Sidepanel offering to load the Bundled_Playground_Spec with a clear call-to-action (e.g. "Load Playground Tests")
4. WHEN a user accepts the prompt to load the Bundled_Playground_Spec, THE Extension SHALL load the bundled spec and transition to the loaded state without requiring file system access
5. IF the Bundled_Playground_Spec fails to load (due to corruption or missing files), THEN THE Extension SHALL display an error message and remain in the not-loaded state
6. WHEN a Spec_File is already loaded, THE Extension SHALL not display the playground auto-load prompt regardless of the active tab URL
7. IF the user dismisses the playground auto-load prompt, THEN THE Extension SHALL hide the prompt for the current session and not re-display the prompt until the Sidepanel is reopened or the extension is reloaded

### Requirement 8: How to Write Automations Section

**User Story:** As a first-time user, I want to learn how to write and compile automations from the landing page, so that I understand the workflow for creating my own test specs.

#### Acceptance Criteria

1. WHEN no Spec_File is loaded, THE Landing_Page SHALL display an Automations_Section positioned below the Playground link in the visual hierarchy
2. THE Automations_Section SHALL be rendered in a collapsible container (e.g. a details/summary element) that is collapsed by default so that the landing page remains compact
3. THE Automations_Section SHALL include a brief explanation stating that automations are written in TypeScript using the Tomation_DSL (`@tomationjs/dsl`)
4. THE Automations_Section SHALL include an instruction stating that TypeScript automation files are compiled to a Spec_File by running `npx @tomationjs/compiler`
5. THE Automations_Section SHALL include a link to the documentation (project README or docs) for further details on the DSL and compiler usage
6. WHEN a user expands the Automations_Section, THE Landing_Page SHALL display the full content without horizontal overflow within the sidepanel width
7. WHEN a Spec_File is loaded, THE Landing_Page SHALL hide the Automations_Section so that it is no longer visible or focusable
