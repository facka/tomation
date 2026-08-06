# Requirements Document

## Introduction

Migrate all inline Unicode characters, emoji, and text-based icons in the Vue 3 panel (`packages/extension/panel-vue/`) to Font Awesome icons. This provides a consistent, scalable, and professional icon set across all panel components.

## Glossary

- **Panel**: The Vue 3 browser extension sidebar UI located at `packages/extension/panel-vue/`
- **Icon_System**: The Font Awesome icon library integrated into the Panel via the `@fortawesome/vue-fontawesome` component
- **Inline_Icon**: A Unicode character, emoji, or text symbol currently used as a visual icon in a component template (e.g., ⏸, ▶, ✓, ★)
- **FA_Component**: The `<font-awesome-icon>` Vue component provided by the `@fortawesome/vue-fontawesome` package

## Requirements

### Requirement 1: Install Font Awesome Dependencies

**User Story:** As a developer, I want Font Awesome packages installed and registered in the Vue app, so that FA_Component is available across all Panel components.

#### Acceptance Criteria

1. THE Icon_System SHALL include the packages `@fortawesome/fontawesome-svg-core`, `@fortawesome/free-solid-svg-icons`, `@fortawesome/free-regular-svg-icons`, and `@fortawesome/vue-fontawesome` as production dependencies with pinned compatible versions
2. THE Panel SHALL register the FontAwesome plugin globally in the Vue application entry point (`main.ts`) so that the `<font-awesome-icon>` component is available in all Panel components without per-component imports
3. THE Icon_System SHALL use explicit named imports for each individual icon and add them to the Font Awesome library via `library.add()`, rather than importing entire icon packs
4. WHEN the Vue application mounts, THE Icon_System SHALL have all icons added to the library before the app's `mount()` call so that components render icons on first paint

### Requirement 2: Replace ControllerBar Icons

**User Story:** As a user, I want the run controller buttons to use polished icons, so that the pause, resume, stop, and context actions are visually clear.

#### Acceptance Criteria

1. WHEN the ControllerBar component renders the Pause button, THE Icon_System SHALL display an FA_Component with the `fa-pause` icon in place of the "⏸" Unicode character, preserving the "Pause" text label beside the icon
2. WHEN the ControllerBar component renders the Resume button, THE Icon_System SHALL display an FA_Component with the `fa-play` icon in place of the "▶" Unicode character, preserving the "Resume" text label beside the icon
3. WHEN the ControllerBar component renders the Stop button, THE Icon_System SHALL display an FA_Component with the `fa-stop` icon in place of the "⏹" Unicode character, preserving the "Stop" text label beside the icon
4. WHEN the ControllerBar component renders the Context button, THE Icon_System SHALL display an FA_Component with the `fa-clipboard-list` icon in place of the "📋" emoji, preserving the "Context" text label beside the icon
5. WHEN any ControllerBar button icon is replaced with an FA_Component, THE Icon_System SHALL set `aria-hidden="true"` on the icon element since visible text labels are present alongside the icon

### Requirement 3: Replace RunnableItem Icons

**User Story:** As a user, I want the test/automation list items to use consistent icons for play and favourite actions.

#### Acceptance Criteria

1. WHEN a RunnableItem of type "automation" is marked as a favourite, THE Icon_System SHALL display a solid `fa-star` icon from `free-solid-svg-icons` in place of the "★" character
2. WHEN a RunnableItem of type "automation" is not a favourite, THE Icon_System SHALL display a regular (outline) `fa-star` icon from `free-regular-svg-icons` in place of the "☆" character
3. WHEN the quick-run button is rendered on any RunnableItem, THE Icon_System SHALL display a solid `fa-play` icon in place of the "▶" character

### Requirement 4: Replace LogEntry Status Icons

**User Story:** As a user, I want log entry status indicators to use clear, distinguishable icons for each state.

#### Acceptance Criteria

1. WHEN a log entry has status "in-progress", THE Icon_System SHALL display a `fa-spinner` icon with the `spin` attribute enabled in place of the "⟳" character
2. WHEN a log entry has status "pass", THE Icon_System SHALL display a `fa-check` icon in place of the "✓" character
3. WHEN a log entry has status "fail", THE Icon_System SHALL display a `fa-xmark` icon in place of the "✗" character, preserving any adjacent error text and attempt badge
4. WHEN a log entry has status "skipped", THE Icon_System SHALL display a `fa-ban` icon in place of the "⊘" character, preserving the adjacent "Skipped" label text

### Requirement 5: Replace TabBar Icons

**User Story:** As a user, I want the tab navigation buttons to use recognizable icons that convey the tab meaning.

#### Acceptance Criteria

1. WHEN the Tests tab button is rendered, THE Icon_System SHALL display a `fa-list-check` icon in place of the "☑" character, preserving the "Tests" text label
2. WHEN the Automations tab button is rendered, THE Icon_System SHALL display a `fa-bolt` icon in place of the "⚡" character, preserving the "Automations" text label

### Requirement 6: Replace ConfigSection Info Icon

**User Story:** As a user, I want the debug mode info button to use a standard info icon.

#### Acceptance Criteria

1. WHEN the info button in ConfigSection is rendered, THE Icon_System SHALL display a `fa-circle-info` icon in place of the "ℹ" character
2. THE info button SHALL retain its existing `title` attribute for tooltip and accessibility

### Requirement 7: Replace Navigation and Close Icons

**User Story:** As a user, I want navigation and dismiss buttons to use standard arrow and close icons.

#### Acceptance Criteria

1. WHEN the Back button is rendered in TestPlanView, THE Icon_System SHALL display a `fa-arrow-left` icon in place of the "←" text, preserving the "Back" text label
2. WHEN the Back to Home button is rendered in RunSummary, THE Icon_System SHALL display a `fa-arrow-left` icon in place of the "←" text, preserving the "Back to Home" text label
3. WHEN the close button is rendered in RunView, THE Icon_System SHALL display a `fa-xmark` icon in place of the "✕" character
4. WHEN the close button is rendered in ContextPopup, THE Icon_System SHALL display a `fa-xmark` icon in place of the "✕" character

### Requirement 8: Replace Warning and Error Icons

**User Story:** As a user, I want error and warning states to use standard alert icons.

#### Acceptance Criteria

1. WHEN the ErrorView card is rendered, THE Icon_System SHALL display a `fa-triangle-exclamation` icon in place of the "⚠️" emoji
2. WHEN the URL mismatch warning banner is shown in LoadedHeader, THE Icon_System SHALL display a `fa-triangle-exclamation` icon in place of the "⚠️" emoji

### Requirement 9: Replace LoadedHeader Reload Icon

**User Story:** As a user, I want the reload spec button to use a recognizable refresh icon.

#### Acceptance Criteria

1. WHEN the reload button is rendered in LoadedHeader, THE Icon_System SHALL display a `fa-rotate-right` icon in place of the "⟳" character

### Requirement 10: Replace RunView Pause Banner Icon

**User Story:** As a user, I want the manual pause banner to use a clear pause icon.

#### Acceptance Criteria

1. WHEN the manual pause banner is displayed in RunView, THE Icon_System SHALL display a `fa-pause` icon in place of the "⏸" character

### Requirement 11: Replace TestPlanView Run Button Icon

**User Story:** As a user, I want the Run button to use a standard play icon.

#### Acceptance Criteria

1. WHEN the Run button is rendered in TestPlanView, THE Icon_System SHALL display a `fa-play` icon in place of the "▶" character, preserving the "Run" text label

### Requirement 12: Maintain Accessibility

**User Story:** As a user with assistive technology, I want icons to remain accessible after the migration.

#### Acceptance Criteria

1. WHEN an FA_Component is used as a decorative icon alongside visible text, THE Icon_System SHALL set `aria-hidden="true"` on the icon element
2. WHEN an FA_Component is used as the sole content of a button, THE button element SHALL retain its existing `title` attribute or have an `aria-label` attribute for screen reader accessibility
3. THE Panel SHALL preserve all existing `title` attributes on buttons that contained Inline_Icons

### Requirement 13: Bundle Size Optimization

**User Story:** As a developer, I want the Font Awesome integration to have minimal impact on the extension bundle size.

#### Acceptance Criteria

1. THE Icon_System SHALL use explicit icon imports (tree-shakeable) rather than importing entire icon packs
2. THE Icon_System SHALL add icons to the Font Awesome library only for the specific icons used in the Panel
