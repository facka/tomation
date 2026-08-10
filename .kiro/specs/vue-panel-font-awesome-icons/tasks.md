# Implementation Plan: Vue Panel Font Awesome Icons

## Overview

Migrate all inline Unicode/emoji icons in the Vue 3 panel to Font Awesome SVG icons. The implementation installs the required packages, creates a centralized icon registry, registers the global component, and systematically replaces icons across all affected components.

## Tasks

- [x] 1. Install Font Awesome packages and set up icon infrastructure
  - [x] 1.1 Install Font Awesome npm dependencies
    - Run `npm install --save @fortawesome/fontawesome-svg-core @fortawesome/free-solid-svg-icons @fortawesome/free-regular-svg-icons @fortawesome/vue-fontawesome` in `packages/extension/panel-vue/`
    - Verify all four packages are added to `dependencies` in `package.json` with pinned versions
    - _Requirements: 1.1, 13.1, 13.2_

  - [x] 1.2 Create `src/icons.ts` with centralized icon imports
    - Create `packages/extension/panel-vue/src/icons.ts`
    - Import `library` from `@fortawesome/fontawesome-svg-core`
    - Import all needed solid icons: `faPause`, `faPlay`, `faStop`, `faClipboardList`, `faStar`, `faSpinner`, `faCheck`, `faXmark`, `faBan`, `faListCheck`, `faBolt`, `faCircleInfo`, `faArrowLeft`, `faTriangleExclamation`, `faRotateRight`
    - Import regular icon: `faStar as faStarRegular` from `@fortawesome/free-regular-svg-icons`
    - Call `library.add()` with all imported icons
    - _Requirements: 1.3, 1.4, 13.1, 13.2_

  - [x] 1.3 Update `src/main.ts` with global component registration
    - Add `import './icons';` before the `createApp` call
    - Import `FontAwesomeIcon` from `@fortawesome/vue-fontawesome`
    - Store `createApp(App)` in a variable, call `app.component('font-awesome-icon', FontAwesomeIcon)`, then `app.mount('#app')`
    - _Requirements: 1.2, 1.4_

- [x] 2. Replace icons in ControllerBar and TabBar
  - [x] 2.1 Replace ControllerBar icons
    - In `src/components/ControllerBar.vue`, replace `⏸` with `<font-awesome-icon :icon="['fas', 'pause']" aria-hidden="true" />`
    - Replace `▶` with `<font-awesome-icon :icon="['fas', 'play']" aria-hidden="true" />`
    - Replace `⏹` with `<font-awesome-icon :icon="['fas', 'stop']" aria-hidden="true" />`
    - Replace `📋` with `<font-awesome-icon :icon="['fas', 'clipboard-list']" aria-hidden="true" />`
    - Preserve all text labels ("Pause", "Resume", "Stop", "Context") beside icons
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 12.1_

  - [x] 2.2 Replace TabBar icons
    - In `src/components/TabBar.vue`, replace `☑` with `<font-awesome-icon :icon="['fas', 'list-check']" aria-hidden="true" />`
    - Replace `⚡` with `<font-awesome-icon :icon="['fas', 'bolt']" aria-hidden="true" />`
    - Preserve text labels ("Tests", "Automations")
    - _Requirements: 5.1, 5.2, 12.1_

- [x] 3. Replace icons in RunnableItem and ConfigSection
  - [x] 3.1 Replace RunnableItem icons
    - In `src/components/RunnableItem.vue`, replace the favourite `★` (isFavourite=true) with `<font-awesome-icon :icon="['fas', 'star']" />`
    - Replace `☆` (isFavourite=false) with `<font-awesome-icon :icon="['far', 'star']" />`
    - Replace `▶` in quick-run button with `<font-awesome-icon :icon="['fas', 'play']" />`
    - Ensure the favourite and quick-run buttons retain their `title` attributes for accessibility
    - _Requirements: 3.1, 3.2, 3.3, 12.2, 12.3_

  - [x] 3.2 Replace ConfigSection info icon
    - In `src/components/ConfigSection.vue`, replace `ℹ` with `<font-awesome-icon :icon="['fas', 'circle-info']" />`
    - Retain the existing `title` attribute on the info button
    - _Requirements: 6.1, 6.2, 12.3_

- [x] 4. Replace icons in LogEntry/LogContainer
  - [x] 4.1 Replace LogEntry status icons
    - Replace the spinner/in-progress icon (`⟳`) with `<font-awesome-icon :icon="['fas', 'spinner']" spin />`
    - Replace the pass icon (`✓`) with `<font-awesome-icon :icon="['fas', 'check']" />`
    - Replace the fail icon (`✗`) with `<font-awesome-icon :icon="['fas', 'xmark']" />`, preserving adjacent error text and attempt badge
    - Replace the skipped icon (`⊘`) with `<font-awesome-icon :icon="['fas', 'ban']" />`, preserving adjacent "Skipped" label
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [ ] 5. Checkpoint - Verify core components build
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Replace icons in navigation and view components
  - [x] 6.1 Replace TestPlanView icons
    - Replace `←` in the Back button with `<font-awesome-icon :icon="['fas', 'arrow-left']" aria-hidden="true" />`, preserving "Back" text
    - Replace `▶` in the Run button with `<font-awesome-icon :icon="['fas', 'play']" aria-hidden="true" />`, preserving "Run" text
    - _Requirements: 7.1, 11.1, 12.1_

  - [x] 6.2 Replace RunSummary back icon
    - Replace `←` in the Back to Home button with `<font-awesome-icon :icon="['fas', 'arrow-left']" aria-hidden="true" />`, preserving "Back to Home" text
    - _Requirements: 7.2, 12.1_

  - [x] 6.3 Replace RunView icons
    - Replace `✕` in the close button with `<font-awesome-icon :icon="['fas', 'xmark']" />`
    - Replace `⏸` in the manual pause banner with `<font-awesome-icon :icon="['fas', 'pause']" />`
    - Ensure the close button retains its `title` or `aria-label` attribute
    - _Requirements: 7.3, 10.1, 12.2_

  - [x] 6.4 Replace ContextPopup close icon
    - Replace `✕` in the close button with `<font-awesome-icon :icon="['fas', 'xmark']" />`
    - Ensure the button retains its `title` or `aria-label` attribute
    - _Requirements: 7.4, 12.2_

- [x] 7. Replace icons in ErrorView and LoadedHeader
  - [x] 7.1 Replace ErrorView warning icon
    - Replace `⚠️` with `<font-awesome-icon :icon="['fas', 'triangle-exclamation']" />`
    - _Requirements: 8.1_

  - [x] 7.2 Replace LoadedHeader icons
    - Replace `⚠️` in the URL mismatch warning banner with `<font-awesome-icon :icon="['fas', 'triangle-exclamation']" aria-hidden="true" />`
    - Replace `⟳` in the reload button with `<font-awesome-icon :icon="['fas', 'rotate-right']" />`
    - Ensure the reload button retains its `title` attribute
    - _Requirements: 8.2, 9.1, 12.2, 12.3_

- [x] 8. Final checkpoint - Ensure all components build and render correctly
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Property-based testing is not applicable to this feature (deterministic UI migration with fixed icon mappings)
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation after major groups of changes
- All icons use the array syntax `['fas', 'icon-name']` or `['far', 'icon-name']` for consistency
- The `aria-hidden="true"` attribute is applied to decorative icons that appear alongside text labels
- Icon-only buttons retain their `title` attributes for screen reader accessibility

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["1.3"] },
    { "id": 3, "tasks": ["2.1", "2.2", "3.1", "3.2", "4.1"] },
    { "id": 4, "tasks": ["6.1", "6.2", "6.3", "6.4", "7.1", "7.2"] }
  ]
}
```
