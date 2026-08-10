# Design Document: Vue Panel Font Awesome Icons

## Overview

This design covers the migration of all inline Unicode characters, emoji, and text-based icons in the Vue 3 panel (`packages/extension/panel-vue/`) to Font Awesome SVG icons. The panel currently uses raw characters like ⏸, ▶, ✓, ★, ⚠️ etc. across 10+ components. We will integrate the `@fortawesome/vue-fontawesome` library, register a globally-available `<font-awesome-icon>` component, and replace each inline icon with the appropriate Font Awesome icon reference.

The approach uses Font Awesome 6.x free packages with explicit tree-shakeable imports to minimize bundle impact. All icons are registered in a central file and the component is made globally available, so individual Vue components need no extra imports.

## Architecture

The integration follows a layered approach:

```
┌─────────────────────────────────────────────┐
│            Vue Component Templates           │
│  (use <font-awesome-icon :icon="..." />)     │
├─────────────────────────────────────────────┤
│        Global Component Registration         │
│  (app.component('font-awesome-icon', ...))   │
├─────────────────────────────────────────────┤
│          Icon Library (icons.ts)             │
│  (library.add(faPause, faPlay, faStop, ...)) │
├─────────────────────────────────────────────┤
│        @fortawesome npm packages             │
│  fontawesome-svg-core + icon packs           │
└─────────────────────────────────────────────┘
```

**Key design decisions:**

1. **Global registration** — The `FontAwesomeIcon` component is registered once in `main.ts` via `app.component()`. This avoids repetitive imports in every `.vue` file and matches how the panel is structured (single entry point, no lazy-loaded routes).

2. **Centralized icon file** — A dedicated `src/icons.ts` file handles all `library.add()` calls. This keeps `main.ts` clean and makes it easy to audit which icons are included in the bundle.

3. **Font Awesome 6.x (not 7)** — Version 6 is the stable, well-documented release with broad Vue 3 support. The `@fortawesome/vue-fontawesome` 3.x line targets Vue 3 specifically.

4. **No CSS font files** — Using SVG core means no external font file requests. Icons are inlined as SVG elements, which works well for a browser extension where network requests should be avoided.

## Components and Interfaces

### New Files

#### `src/icons.ts`

Central icon registration module. Responsible for importing individual icons and adding them to the Font Awesome library.

```typescript
import { library } from '@fortawesome/fontawesome-svg-core';

// Solid icons
import {
  faPause,
  faPlay,
  faStop,
  faClipboardList,
  faStar,
  faSpinner,
  faCheck,
  faXmark,
  faBan,
  faListCheck,
  faBolt,
  faCircleInfo,
  faArrowLeft,
  faTriangleExclamation,
  faRotateRight,
} from '@fortawesome/free-solid-svg-icons';

// Regular icons
import { faStar as faStarRegular } from '@fortawesome/free-regular-svg-icons';

library.add(
  faPause,
  faPlay,
  faStop,
  faClipboardList,
  faStar,
  faStarRegular,
  faSpinner,
  faCheck,
  faXmark,
  faBan,
  faListCheck,
  faBolt,
  faCircleInfo,
  faArrowLeft,
  faTriangleExclamation,
  faRotateRight,
);
```

#### Updated `src/main.ts`

```typescript
import './styles/global.css';
import './icons'; // Must be before createApp to ensure library is populated
import { createApp } from 'vue';
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
import App from './App.vue';

const app = createApp(App);
app.component('font-awesome-icon', FontAwesomeIcon);
app.mount('#app');
```

### Modified Components

Each component replaces inline characters with `<font-awesome-icon>` usage:

| Component | Old Icon | New Icon | Props |
|-----------|----------|----------|-------|
| ControllerBar | `⏸` | `fa-solid fa-pause` | `aria-hidden="true"` |
| ControllerBar | `▶` | `fa-solid fa-play` | `aria-hidden="true"` |
| ControllerBar | `⏹` | `fa-solid fa-stop` | `aria-hidden="true"` |
| ControllerBar | `📋` | `fa-solid fa-clipboard-list` | `aria-hidden="true"` |
| RunnableItem | `★` | `fa-solid fa-star` | — |
| RunnableItem | `☆` | `fa-regular fa-star` | — |
| RunnableItem | `▶` | `fa-solid fa-play` | — |
| LogEntry | `⟳` (spinner) | `fa-solid fa-spinner` | `spin` |
| LogEntry | `✓` | `fa-solid fa-check` | — |
| LogEntry | `✗` | `fa-solid fa-xmark` | — |
| LogEntry | `⊘` | `fa-solid fa-ban` | — |
| TabBar | `☑` | `fa-solid fa-list-check` | `aria-hidden="true"` |
| TabBar | `⚡` | `fa-solid fa-bolt` | `aria-hidden="true"` |
| ConfigSection | `ℹ` | `fa-solid fa-circle-info` | — |
| TestPlanView | `←` (Back) | `fa-solid fa-arrow-left` | `aria-hidden="true"` |
| TestPlanView | `▶` (Run) | `fa-solid fa-play` | `aria-hidden="true"` |
| RunSummary | `←` (Back to Home) | `fa-solid fa-arrow-left` | `aria-hidden="true"` |
| RunView | `✕` (close) | `fa-solid fa-xmark` | — |
| RunView | `⏸` (pause banner) | `fa-solid fa-pause` | — |
| ContextPopup | `✕` (close) | `fa-solid fa-xmark` | — |
| ErrorView | `⚠️` | `fa-solid fa-triangle-exclamation` | — |
| LoadedHeader | `⚠️` | `fa-solid fa-triangle-exclamation` | `aria-hidden="true"` |
| LoadedHeader | `⟳` (reload) | `fa-solid fa-rotate-right` | — |

### Component Usage Pattern

Icons alongside text labels use the array shorthand:

```vue
<button @click="pause">
  <font-awesome-icon :icon="['fas', 'pause']" aria-hidden="true" /> Pause
</button>
```

Icons as sole button content rely on the button's `title` or `aria-label`:

```vue
<button class="btn btn-ghost btn-sm" title="Load another spec" @click="onReload">
  <font-awesome-icon :icon="['fas', 'rotate-right']" />
</button>
```

The regular star (outline) uses the `far` prefix:

```vue
<font-awesome-icon :icon="['far', 'star']" />
```

## Data Models

No new data models are introduced. The feature only changes the visual presentation layer — it does not alter component props, events, store state, or message types.

The only data structure of note is the icon reference format accepted by `<font-awesome-icon>`:

```typescript
// Array syntax: [prefix, iconName]
type IconProp = [string, string]; // e.g. ['fas', 'pause'], ['far', 'star']

// String syntax (solid only): "fa-solid fa-pause"
type IconPropString = string;
```

We will use the array syntax consistently for clarity and to support both solid and regular icon families.

## Error Handling

- **Missing icon**: If an icon name is misspelled or not added to `library.add()`, Font Awesome logs a console warning and renders nothing. This is caught during development but does not crash the app.
- **Build failure**: If `@fortawesome/free-solid-svg-icons` doesn't export a named icon, TypeScript will flag an import error at build time (`vue-tsc --noEmit`).
- **Accessibility fallback**: Since icons are SVG elements, screen readers will ignore them when `aria-hidden="true"` is set. For icon-only buttons, the existing `title` attribute provides the accessible name.

## Testing Strategy

### Why Property-Based Testing Does Not Apply

This feature is a deterministic UI migration with a fixed, known icon mapping. Each acceptance criterion maps one specific Unicode character in one specific component to one specific Font Awesome icon. There is no input space to vary — the behavior is entirely static template rendering. Property-based testing is not applicable here.

### Recommended Testing Approach

**Example-based component tests** using Vue Test Utils + Vitest:

1. **Smoke tests** (Requirement 1, 13): Verify `package.json` contains the expected dependencies, and that `icons.ts` uses only named imports (can be validated by the TypeScript compiler).

2. **Component render tests** (Requirements 2–11): For each component, mount it with the required props/state and assert:
   - The `<font-awesome-icon>` stub/component is rendered with the correct `icon` prop
   - Text labels are preserved alongside icons
   - Old Unicode characters are no longer present in the rendered output

3. **Accessibility tests** (Requirement 12): For each component:
   - Verify decorative icons (next to text) have `aria-hidden="true"`
   - Verify icon-only buttons retain `title` or `aria-label`

4. **Visual regression** (optional): Screenshot comparison before/after to confirm the visual result is acceptable. Not automated in CI but useful for manual QA.

### Test Organization

```
src/components/__tests__/
  ControllerBar.spec.ts    — icons + aria-hidden
  RunnableItem.spec.ts     — star toggle + play icon
  LogEntry.spec.ts         — status icons (spinner, check, xmark, ban)
  TabBar.spec.ts           — tab icons
  ConfigSection.spec.ts    — info icon
  TestPlanView.spec.ts     — back + run icons
  RunView.spec.ts          — close + pause banner icons
  RunSummary.spec.ts       — back to home icon
  ContextPopup.spec.ts     — close icon
  ErrorView.spec.ts        — warning icon
  LoadedHeader.spec.ts     — warning + reload icons
```

Each test file should:
- Mount the component with `@fortawesome/vue-fontawesome` stubbed or registered
- Assert the correct icon props are passed
- Assert text labels are preserved
- Assert accessibility attributes are present
