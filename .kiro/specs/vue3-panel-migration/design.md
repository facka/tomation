# Technical Design: Vue 3 Panel Migration

## Overview

This design describes the migration of the Tomation extension sidebar panel from vanilla ES5 (panel.html + panel.js, ~2500 lines) to a Vue 3 application using Composition API, `<script setup>`, and TypeScript. The architecture prioritises a single-file HTML output (CSP-compliant), shared logic reuse, and a feature-flag toggle (`USE_VUE_PANEL`) for safe rollout.

## Architecture

The Vue panel lives in `packages/extension/panel-vue/` as an independent Vite-powered sub-project. Vite compiles Vue 3 SFCs with TypeScript into a single `panel.html` file (JS inlined via `vite-plugin-singlefile`). The existing `build.js` conditionally copies either the Vite output or the original panel files into `dist/chrome` and `dist/firefox`.

```
┌─────────────────────────────────────────────────────────────────┐
│  packages/extension/                                            │
│  ├── src/panel.html + panel.js  (original, preserved)           │
│  ├── panel-vue/                 (new Vue 3 source)              │
│  │   ├── vite.config.ts                                         │
│  │   ├── index.html                                             │
│  │   └── src/                                                   │
│  └── build.js                   (reads USE_VUE_PANEL flag)      │
│                                                                 │
│  build.js → dist/chrome/src/panel.html                          │
│           → dist/firefox/src/panel.html                         │
└─────────────────────────────────────────────────────────────────┘
```

## File & Folder Structure

```
packages/extension/panel-vue/
├── index.html                    # Vite entry HTML (minimal shell)
├── vite.config.ts                # Vite config (singlefile plugin)
├── tsconfig.json                 # TypeScript config
├── package.json                  # Dev dependencies (vue, vite, etc.)
├── env.d.ts                      # Vite/Vue type shims
└── src/
    ├── main.ts                   # App bootstrap (createApp, mount)
    ├── App.vue                   # Root component (view router)
    ├── types/
    │   ├── spec.ts               # Spec, Test, Automation, Step types
    │   ├── store.ts              # Store state & action interfaces
    │   └── messages.ts           # Message protocol types
    ├── store/
    │   └── index.ts              # Reactive store (Vue reactive/ref)
    ├── composables/
    │   ├── useMessaging.ts       # Browser API messaging wrapper
    │   ├── useFileLoader.ts      # Drag-drop + file read + validate
    │   ├── useRunExecution.ts    # Run state machine & log entries
    │   └── useSearch.ts          # Reactive search filtering
    ├── logic/
    │   ├── validateSpec.ts       # Spec validation (port of ES5)
    │   ├── filterTests.ts        # Name substring filtering
    │   ├── sortFavourites.ts     # Stable favourites partition sort
    │   ├── quickRunHelpers.ts    # buildAllStepsChecked, buildDefaultParams, hasRequiredParamsWithoutValues
    │   ├── stepLabel.ts          # buildStepLabelHtml, buildStepLabel, resolveTargetLabel
    │   └── browserApi.ts         # Cross-browser API detection
    ├── components/
    │   ├── HomeView.vue          # Home: landing + loaded state
    │   ├── TestPlanView.vue      # Test Plan: checklist + params + config
    │   ├── RunView.vue           # Run: log + controller + summary
    │   ├── LandingPage.vue       # Welcome, drop zone, playground prompt
    │   ├── LoadedHeader.vue      # Spec name, description, reload btn
    │   ├── TabBar.vue            # Tests/Automations tab switcher
    │   ├── TestList.vue          # Filtered test item list
    │   ├── AutomationList.vue    # Filtered automation list (with favs)
    │   ├── RunnableItem.vue      # Single list item (name, quick-run)
    │   ├── StepChecklist.vue     # Recursive step checkbox tree
    │   ├── ParamForm.vue         # Typed parameter inputs
    │   ├── ConfigSection.vue     # Debug mode + speed dropdown
    │   ├── LogContainer.vue      # Scrollable log entries
    │   ├── LogEntry.vue          # Single log row (status, label)
    │   ├── TaskHeader.vue        # Task group header in log
    │   ├── ControllerBar.vue     # Pause/Resume/Stop/Context buttons
    │   ├── RunSummary.vue        # Pass/fail/skip counts
    │   ├── ContextPopup.vue      # Context store overlay table
    │   └── DropZone.vue          # File drag-drop zone
    └── styles/
        └── global.css            # Extracted design tokens & base styles
```

## Component Tree

```
App.vue
├── HomeView.vue (view === 'home')
│   ├── LandingPage.vue (no spec loaded)
│   │   ├── DropZone.vue
│   │   └── PlaygroundPrompt (inline)
│   └── [spec loaded]
│       ├── LoadedHeader.vue
│       ├── TabBar.vue
│       ├── TestList.vue (tab === 'tests')
│       │   └── RunnableItem.vue (×N)
│       └── AutomationList.vue (tab === 'automations')
│           └── RunnableItem.vue (×N)
├── TestPlanView.vue (view === 'test-plan')
│   ├── NavRow (back + title)
│   ├── ParamForm.vue (if automation with params)
│   ├── StepChecklist.vue (recursive)
│   └── ConfigSection.vue
└── RunView.vue (view === 'run')
    ├── NavRow (title + close)
    ├── ControllerBar.vue
    ├── LogContainer.vue
    │   ├── ParamBanner (if automation)
    │   ├── TaskHeader.vue (×N)
    │   └── LogEntry.vue (×N)
    ├── ContextPopup.vue (overlay)
    └── RunSummary.vue (post-completion)
```

## Components and Interfaces

See the Component Tree and Composable APIs sections below for the full component architecture. The system is organized into:

- **Views** (HomeView, TestPlanView, RunView) — top-level page components switched by reactive state
- **UI Components** — reusable presentational components (DropZone, LogEntry, StepChecklist, etc.)
- **Composables** — stateful logic hooks (useMessaging, useFileLoader, useRunExecution, useSearch)
- **Logic modules** — pure TypeScript functions (validateSpec, filterTests, sortFavourites, etc.)
- **Store** — centralized reactive state using Vue 3 primitives

## Data Models

## Store Interface (Types)

```typescript
// types/spec.ts
export interface PageElement {
  tag: string;
  label?: string;
  where?: Record<string, string>;
  xpath?: string;
  childOf?: string;
  navigate?: string;
}

export interface Step {
  action: string;
  target?: string;
  value?: string;
  url?: string;
  ms?: number;
  description?: string;
  name?: string;       // for task action
  params?: Record<string, unknown>;
  gone?: boolean;
  contextKey?: string;
}

export interface Param {
  name: string;
  type: 'string' | 'number' | 'date' | 'enum';
  optional?: boolean;
  defaultValue?: string;
  options?: string[];
}

export interface TestEntry {
  name: string;
  steps: Step[];
  sourceFile?: string;
}

export interface AutomationEntry {
  name: string;
  steps: Step[];
  params: Param[];
  sourceFile?: string;
}

export interface SpecMeta {
  name?: string;
  description?: string;
  compilerVersion?: string;
  urls?: string[];
  url?: string;
}

export interface Spec {
  format: string;
  version: number;
  meta?: SpecMeta;
  pageElements: Record<string, PageElement>;
  tasks: Record<string, { steps: Step[]; label?: string }>;
  tests: TestEntry[];
  automations?: AutomationEntry[];
}

export interface SpecEntry {
  id: string;
  filename: string;
  loadedAt: string;
  spec: Spec;
}

export interface Project {
  host: string;
  name: string;
  specs: SpecEntry[];
  lastUsed: string;
  savedParams?: Record<string, Record<string, unknown>>;
  favourites?: Record<string, boolean>;
}
```

```typescript
// types/store.ts
import type { Spec, SpecEntry, Project, TestEntry, AutomationEntry, Step } from './spec';

export type ViewName = 'home' | 'test-plan' | 'run' | 'error';
export type RunnableType = 'test' | 'automation';
export type StepStatus = 'queued' | 'in-progress' | 'pass' | 'fail' | 'skipped';
export type TaskHeaderStatus = 'queued' | 'in-progress' | 'pass' | 'warning';

export interface Runnable {
  type: RunnableType;
  index: number;
  data: TestEntry | AutomationEntry;
}

export interface RunConfig {
  allowContinueOnFailure: boolean;
  allowRetryOnFailure: boolean;
  executionSpeed: 'FAST' | 'NORMAL' | 'SLOW';
}

export interface LogEntry {
  stepIndex: number;
  status: StepStatus;
  action: string;
  target?: string;
  value?: string;
  error?: string;
  retryAttempt?: number;
  taskPath?: Array<{ name: string; label?: string; params?: Record<string, unknown> }>;
  taskDepth?: number;
}

export interface StoreState {
  // Core state
  currentView: ViewName;
  currentHostname: string | null;
  currentProject: Project | null;
  currentSpec: SpecEntry | null;
  currentRunnable: Runnable | null;

  // Home view
  activeTab: 'tests' | 'automations';
  favourites: Record<string, boolean>;
  searchQuery: string;

  // Run state
  isRunning: boolean;
  isPaused: boolean;
  runConfig: RunConfig | null;
  logEntries: LogEntry[];
  runSummary: { total: number; passed: number; failed: number } | null;
  contextStore: Record<string, unknown>;
  automationParams: Record<string, unknown> | null;

  // UI state
  playgroundPromptDismissed: boolean;
  lastKnownTabUrl: string | null;
  errorMessage: string | null;
}

export interface StoreActions {
  // Navigation
  setView(view: ViewName): void;
  
  // Spec management
  loadSpec(hostname: string, filename: string, spec: Spec): Promise<void>;
  setProject(project: Project | null): void;
  setHostname(hostname: string | null): void;

  // Runnable selection
  selectRunnable(specEntry: SpecEntry, runnable: Runnable): void;
  clearRunnable(): void;

  // Favourites
  toggleFavourite(automationName: string): void;

  // Run lifecycle
  startRun(config: RunConfig, params?: Record<string, unknown>): void;
  setStepPlan(steps: Step[]): void;
  setStepStatus(stepIndex: number, status: StepStatus, meta?: Partial<LogEntry>): void;
  setRunComplete(summary: { total: number; passed: number; failed: number }): void;
  setPaused(paused: boolean): void;
  stopRun(): void;

  // Context
  updateContext(key: string, value: unknown): void;
  setContextStore(store: Record<string, unknown>): void;

  // Tab & search
  setActiveTab(tab: 'tests' | 'automations'): void;
  setSearchQuery(query: string): void;
}

export interface StoreGetters {
  filteredTests: TestEntry[];
  filteredAutomations: AutomationEntry[];
  sortedAutomations: AutomationEntry[];
  currentStepPlan: LogEntry[];
  isPlaygroundDetected: boolean;
  showPlaygroundPrompt: boolean;
}
```

```typescript
// types/messages.ts

// Messages sent FROM panel TO background
export type PanelMessage =
  | { type: 'RUN_TEST'; testIndex: number; checkedSteps: number[]; config: RunConfig }
  | { type: 'RUN_AUTOMATION'; automationIndex: number; params: Record<string, unknown>; checkedSteps: number[]; config: RunConfig }
  | { type: 'RETRY_STEP'; stepIndex: number }
  | { type: 'SKIP_STEP'; stepIndex: number }
  | { type: 'STOP' }
  | { type: 'PAUSE' }
  | { type: 'CONTINUE' }
  | { type: 'LOAD_BUNDLED_SPEC' }
  | { type: 'GET_CONTEXT' };

// Messages sent FROM background TO panel
export type BackgroundMessage =
  | { type: 'STEP_PLAN'; steps: StepPlanEntry[] }
  | { type: 'STEP_STARTING'; stepIndex: number; action: string; target?: string; value?: string; url?: string; ms?: number; description?: string; name?: string; params?: Record<string, unknown> }
  | { type: 'LOG'; stepIndex: number; action: string; target?: string; value?: string; ok: boolean; error?: string; retryAttempt?: number; contextKey?: string; savedValue?: unknown; resolvedContext?: Array<{ key: string; value: unknown }> }
  | { type: 'UPDATE_LOG_ENTRY'; stepIndex: number; ok: boolean; retryAttempt?: number; error?: string }
  | { type: 'STEP_FAILED_AWAITING_ACTION'; stepIndex: number; action: string; target?: string; value?: string; error?: string; retryAttempt?: number }
  | { type: 'RUN_COMPLETE'; total: number; passed: number; failed: number }
  | { type: 'RUN_STOPPED'; total: number; passed: number; failed: number }
  | { type: 'STATE_SYNC'; running: boolean; paused?: boolean }
  | { type: 'TAB_URL_UPDATE'; url: string }
  | { type: 'MANUAL_PAUSE'; description: string }
  | { type: 'BUNDLED_SPEC_LOADED'; filename: string; spec: Spec }
  | { type: 'BUNDLED_SPEC_ERROR'; error: string }
  | { type: 'CONTEXT_STATE'; store: Record<string, unknown> };

export interface StepPlanEntry {
  action: string;
  target?: string;
  value?: string;
  url?: string;
  ms?: number;
  description?: string;
  name?: string;
  params?: Record<string, unknown>;
  taskPath?: Array<{ name: string; label?: string; params?: Record<string, unknown> }>;
  taskDepth?: number;
}
```

## Store Implementation

The store uses Vue 3 `reactive()` for the state object and `computed()` for derived getters. No external state management library is needed.

```typescript
// store/index.ts (simplified)
import { reactive, computed } from 'vue';
import type { StoreState, StoreActions, StoreGetters } from '../types/store';
import { filterTests } from '../logic/filterTests';
import { sortAutomationsWithFavourites } from '../logic/sortFavourites';
import { isPlaygroundUrl } from '../logic/browserApi';

const state = reactive<StoreState>({ /* initial values */ });

// Getters as computed refs
const filteredTests = computed(() => {
  if (!state.currentProject) return [];
  const allTests = state.currentProject.specs.flatMap(s => s.spec.tests);
  return filterTests(allTests.map(t => t.name), state.searchQuery)
    .map(name => allTests.find(t => t.name === name)!);
});

const sortedAutomations = computed(() => {
  if (!state.currentProject) return [];
  const allAutos = state.currentProject.specs.flatMap(s => s.spec.automations ?? []);
  return sortAutomationsWithFavourites(allAutos, state.favourites);
});

// Actions mutate state directly
function setView(view: ViewName) { state.currentView = view; }
function toggleFavourite(name: string) { /* toggle + persist */ }
// ... etc

export function useStore() {
  return { state, filteredTests, sortedAutomations, /* actions */ };
}
```

## Composable APIs

### useMessaging

```typescript
// composables/useMessaging.ts
import type { PanelMessage, BackgroundMessage } from '../types/messages';

export function useMessaging() {
  const api = (typeof browser !== 'undefined' ? browser : chrome) as typeof chrome;

  function send(message: PanelMessage): void {
    api.runtime.sendMessage(message);
  }

  function onMessage(handler: (msg: BackgroundMessage) => void): () => void {
    api.runtime.onMessage.addListener(handler);
    return () => api.runtime.onMessage.removeListener(handler);
  }

  function getActiveTabUrl(): Promise<string | null> {
    return new Promise((resolve) => {
      api.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs?.[0]?.url) {
          resolve(tabs[0].url);
        } else {
          resolve(null);
        }
      });
    });
  }

  return { send, onMessage, getActiveTabUrl, api };
}
```

### useFileLoader

```typescript
// composables/useFileLoader.ts
import { ref } from 'vue';
import { validateSpec } from '../logic/validateSpec';
import { useStore } from '../store';

export function useFileLoader() {
  const error = ref<string | null>(null);
  const isDragOver = ref(false);

  function handleFile(file: File): void {
    error.value = null;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch (e) {
        error.value = `Failed to parse JSON: ${(e as Error).message}`;
        return;
      }
      const result = validateSpec(parsed);
      if (!result.ok) {
        error.value = `Invalid spec: ${result.error}`;
        return;
      }
      const store = useStore();
      store.loadSpec(store.state.currentHostname!, file.name, result.spec!);
    };
    reader.readAsText(file);
  }

  function handleDrop(event: DragEvent): void { /* extract file, validate extension, call handleFile */ }
  function handleDragEnter(): void { isDragOver.value = true; }
  function handleDragLeave(): void { isDragOver.value = false; }

  return { error, isDragOver, handleFile, handleDrop, handleDragEnter, handleDragLeave };
}
```

### useRunExecution

```typescript
// composables/useRunExecution.ts
import { computed } from 'vue';
import { useStore } from '../store';
import { useMessaging } from './useMessaging';
import type { StepStatus } from '../types/store';

export function useRunExecution() {
  const store = useStore();
  const { send } = useMessaging();

  const isRunning = computed(() => store.state.isRunning);
  const isPaused = computed(() => store.state.isPaused);
  const logEntries = computed(() => store.state.logEntries);
  const summary = computed(() => store.state.runSummary);

  function pause(): void {
    send({ type: 'PAUSE' });
    store.setPaused(true);
  }

  function resume(): void {
    send({ type: 'CONTINUE' });
    store.setPaused(false);
  }

  function stop(): void {
    send({ type: 'STOP' });
  }

  function retry(stepIndex: number): void {
    send({ type: 'RETRY_STEP', stepIndex });
    store.setStepStatus(stepIndex, 'in-progress');
  }

  function skip(stepIndex: number): void {
    send({ type: 'SKIP_STEP', stepIndex });
    store.setStepStatus(stepIndex, 'skipped');
  }

  return { isRunning, isPaused, logEntries, summary, pause, resume, stop, retry, skip };
}
```

### useSearch

```typescript
// composables/useSearch.ts
import { ref, computed, type Ref } from 'vue';
import { filterTests } from '../logic/filterTests';

export function useSearch<T extends { name: string }>(items: Ref<T[]>) {
  const query = ref('');

  const filtered = computed(() => {
    if (!query.value) return items.value;
    const matchingNames = filterTests(
      items.value.map(i => i.name),
      query.value
    );
    return items.value.filter(i => matchingNames.includes(i.name));
  });

  const isEmpty = computed(() => query.value.length > 0 && filtered.value.length === 0);

  return { query, filtered, isEmpty };
}
```

## Message Flow

### Panel → Background (outgoing)

```
┌──────────────┐     sendMessage()     ┌────────────────┐
│  Vue Panel   │ ────────────────────> │  background.js │
│              │                        │                │
│ RUN_TEST     │  testIndex,           │                │
│ RUN_AUTOMATION│ automationIndex,     │                │
│ RETRY_STEP   │  stepIndex,           │                │
│ SKIP_STEP    │  config, params       │                │
│ STOP/PAUSE   │                        │                │
│ CONTINUE     │                        │                │
│ LOAD_BUNDLED │                        │                │
│ GET_CONTEXT  │                        │                │
└──────────────┘                        └────────────────┘
```

### Background → Panel (incoming)

```
┌────────────────┐    onMessage()     ┌──────────────┐
│  background.js │ ────────────────> │  Vue Panel   │
│                │                    │              │
│ STEP_PLAN      │ → setStepPlan()   │ useMessaging │
│ STEP_STARTING  │ → setStepStatus() │   handler    │
│ LOG            │ → setStepStatus() │     ↓        │
│ UPDATE_LOG     │ → setStepStatus() │   store      │
│ STEP_FAILED    │ → show retry/skip │   actions    │
│ RUN_COMPLETE   │ → setRunComplete()│              │
│ RUN_STOPPED    │ → setRunComplete()│              │
│ STATE_SYNC     │ → restore state   │              │
│ TAB_URL_UPDATE │ → update URL      │              │
│ MANUAL_PAUSE   │ → show banner     │              │
│ BUNDLED_SPEC   │ → loadSpec()      │              │
│ CONTEXT_STATE  │ → setContextStore │              │
└────────────────┘                    └──────────────┘
```

### Message Dispatch (in App.vue onMounted)

```typescript
// App.vue setup
const { onMessage } = useMessaging();
const store = useStore();

onMounted(() => {
  onMessage((msg) => {
    switch (msg.type) {
      case 'STEP_PLAN':
        store.setStepPlan(msg.steps);
        break;
      case 'STEP_STARTING':
        store.setStepStatus(msg.stepIndex, 'in-progress', msg);
        break;
      case 'LOG':
        store.setStepStatus(msg.stepIndex, msg.ok ? 'pass' : 'fail', msg);
        if (msg.contextKey !== undefined) {
          store.updateContext(msg.contextKey, msg.savedValue);
        }
        break;
      case 'UPDATE_LOG_ENTRY':
        store.setStepStatus(msg.stepIndex, msg.ok ? 'pass' : 'fail', msg);
        break;
      case 'STEP_FAILED_AWAITING_ACTION':
        store.setStepStatus(msg.stepIndex, 'fail', msg);
        break;
      case 'RUN_COMPLETE':
      case 'RUN_STOPPED':
        store.setRunComplete({ total: msg.total, passed: msg.passed, failed: msg.failed });
        break;
      case 'STATE_SYNC':
        if (msg.running) { store.state.isRunning = true; store.setView('run'); }
        if (msg.paused) { store.setPaused(true); }
        break;
      case 'TAB_URL_UPDATE':
        store.state.lastKnownTabUrl = msg.url;
        break;
      case 'BUNDLED_SPEC_LOADED':
        store.loadSpec('facka.github.io', msg.filename, msg.spec);
        break;
      case 'CONTEXT_STATE':
        store.setContextStore(msg.store);
        break;
    }
  });
});
```

## Vite Configuration

```typescript
// panel-vue/vite.config.ts
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  plugins: [vue(), viteSingleFile()],
  root: __dirname,
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Deterministic filenames (no content hashes)
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]',
      },
    },
    // CSP compliance: no inline scripts in the HTML shell
    // vite-plugin-singlefile inlines JS into the HTML body as a <script> tag
    // with src removed — the entire JS bundle becomes the tag content.
    // For Chrome MV3 CSP: we use a separate .js file referenced by <script src="...">
    // UNLESS singlefile mode is used (which is allowed in side_panel context).
    cssCodeSplit: false,
    minify: 'terser',
  },
  // Resolve @ alias for clean imports
  resolve: {
    alias: {
      '@': '/src',
    },
  },
});
```

**CSP Strategy:** Chrome MV3 side panels allow inline scripts within the panel HTML (they run in the extension context, not a web page context). The `vite-plugin-singlefile` approach inlines all JS/CSS into a single `index.html`, which is valid for both Chrome side_panel and Firefox sidebar_action contexts. This avoids needing separate asset files and simplifies the build copy step.

**Alternative (if CSP issues arise):** Remove `vite-plugin-singlefile`, produce `panel.html` + `panel.js` + `panel.css` as separate files, and update the build script to copy all three. The manifest already loads from a path rather than inline.

## Build Integration

The existing `build.js` is modified to conditionally copy the Vue panel output:

```javascript
// In build.js — modified buildTarget function
function buildTarget(target) {
  var targetDir = path.join(DIST, target);
  cleanDir(targetDir);

  // ... manifest writing (unchanged) ...

  // Panel file selection based on USE_VUE_PANEL environment variable
  var useVuePanel = process.env.USE_VUE_PANEL;
  var panelFiles;

  if (useVuePanel && useVuePanel !== '0' && useVuePanel !== 'false' && useVuePanel !== '') {
    // Copy Vue panel build output (single HTML file)
    var vuePanelSrc = path.join(ROOT, 'panel-vue', 'dist', 'index.html');
    copyFile(vuePanelSrc, path.join(targetDir, 'src', 'panel.html'));
    // Remove panel.js from shared files list
    panelFiles = SHARED_FILES.filter(function(f) {
      return f !== 'src/panel.html' && f !== 'src/panel.js';
    });
  } else {
    // Copy original panel files (default)
    panelFiles = SHARED_FILES;
  }

  // Copy selected files
  for (var i = 0; i < panelFiles.length; i++) {
    copyFile(path.join(ROOT, panelFiles[i]), path.join(targetDir, panelFiles[i]));
  }

  // ... rest unchanged (playground, icons, bundled spec) ...
}
```

**Build workflow:**
1. `cd packages/extension/panel-vue && npm run build` — produces `panel-vue/dist/index.html`
2. `USE_VUE_PANEL=1 node build.js` — copies Vue output to dist directories
3. Without the flag: `node build.js` — copies original panel.html/panel.js (default)

## Styling Architecture

The global stylesheet is extracted from `panel.html`'s `<style>` block and placed in `panel-vue/src/styles/global.css`. It contains:

- CSS custom properties (design tokens: colors, radii, shadows, fonts)
- Reset rules (`* { box-sizing: border-box; margin: 0; padding: 0; }`)
- Base typography (body, h1-h3)
- Shared utility classes (`.btn`, `.btn-primary`, `.btn-ghost`, `.btn-sm`, etc.)
- Layout primitives (`.view`, `.nav-row`, `.action-bar`)

Individual components use `<style scoped>` for component-specific rules, referencing the design tokens via `var(--token-name)`.

```vue
<!-- Example: LogEntry.vue -->
<style scoped>
.log-entry.pass {
  border-left: 3px solid var(--success);
}
.log-entry.fail {
  border-left: 3px solid var(--error);
}
</style>
```

The global stylesheet is imported once in `main.ts`:

```typescript
import './styles/global.css';
import { createApp } from 'vue';
import App from './App.vue';
createApp(App).mount('#app');
```

## Cross-Browser Compatibility

The `browserApi.ts` module handles API detection:

```typescript
// logic/browserApi.ts
declare const browser: typeof chrome | undefined;

export const api: typeof chrome =
  typeof browser !== 'undefined' ? (browser as typeof chrome) : chrome;

export function isPlaygroundUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false;
  if (url === 'https://facka.github.io/tomation') return true;
  return url.startsWith('https://facka.github.io/tomation/');
}
```

Both Chrome MV3 and Firefox MV2 use the same panel file path (`src/panel.html`) referenced in their respective manifests:
- Chrome: `"side_panel": { "default_path": "src/panel.html" }`
- Firefox: `"sidebar_action": { "default_panel": "src/panel.html" }`

No code changes are needed between targets — the same built `panel.html` works in both.

## Error Handling

- **File parse errors:** Caught in `useFileLoader`, surfaced via `error` ref to `DropZone.vue`
- **Validation errors:** `validateSpec` returns `{ ok: false, error: string }`, displayed in drop zone error area
- **Messaging errors:** `useMessaging.send()` wraps in try/catch; failures logged to console
- **Storage errors:** All storage operations use `.catch()` with console warnings (matching original silent-fail pattern)
- **Missing background connection:** `STATE_SYNC` message on panel open allows recovery if panel opens mid-run

## Dependencies

```json
{
  "dependencies": {
    "vue": "3.4.38"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "5.1.4",
    "typescript": "5.5.4",
    "vite": "5.4.8",
    "vite-plugin-singlefile": "2.0.2",
    "vue-tsc": "2.1.6"
  }
}
```

No Pinia, no Vue Router (views managed via reactive `currentView` state), no external CSS framework.

## Key Design Decisions

1. **No Vue Router:** The panel has only 3 views with simple transitions. A reactive `currentView` string with `v-if` switching is simpler and avoids router overhead in the extension context.

2. **No Pinia:** The state is small enough (single object) that `reactive()` + a composable export pattern provides equivalent functionality without the extra dependency.

3. **Single-file output:** The `vite-plugin-singlefile` approach produces one HTML file, matching the original panel.html pattern. This simplifies the build copy step and avoids needing to track multiple output files.

4. **Logic extraction to plain TS modules:** Functions like `validateSpec`, `filterTests`, and `sortAutomationsWithFavourites` are extracted as pure TypeScript functions in `logic/`. This allows unit testing without Vue component mounting and potential future sharing with the original panel.

5. **Deterministic filenames:** Content hashes are removed from Vite output filenames since the extension is loaded from local files (no CDN caching benefit) and manifest.json references fixed paths.

6. **Scoped styles with global tokens:** Design tokens live in `global.css` (single source of truth), while component-specific layout/overrides use scoped styles. This prevents style leakage between components while maintaining the existing visual language.

## Testing Strategy

**Unit tests** (example-based) cover:
- Component rendering for specific states (landing page elements, loaded header, config section)
- Navigation transitions (clicking an item opens TestPlanView)
- Edge cases (empty search results display, run summary after completion)
- Integration with browser messaging (verifying correct message shape sent)

**Property tests** (100+ iterations with fast-check) cover:
- Logic module equivalence with original ES5 functions (validateSpec, filterTests, sortFavourites)
- Build flag behaviour (truthy/falsy variants produce correct panel selection)
- Store state transitions (valid message sequences produce valid state)
- Quick-run helper functions (buildAllStepsChecked, buildDefaultParams)
- URL detection, parameter validation, and status mappings

The project already has `fast-check` as a dev dependency in the extension package. Property tests use Vitest as the runner with `fast-check` for input generation.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Build flag selects correct panel output

*For any* truthy value of the `USE_VUE_PANEL` environment variable (e.g., "1", "true", "yes"), the build script SHALL copy the Vue panel output to dist directories; *for any* falsy or absent value (undefined, "0", "false", ""), it SHALL copy the original `panel.html` and `panel.js`.

**Validates: Requirements 1.2, 1.3, 9.2**

### Property 2: CSP-compliant output

*For any* set of Vue source files compiled by the build system, the produced HTML output SHALL contain no inline `<script>` tags with JavaScript code that would violate Chrome MV3 CSP (i.e., all script content is either in a referenced file or in the extension-allowed inline context), and SHALL contain no `eval()` calls.

**Validates: Requirements 1.4**

### Property 3: Deterministic build output filenames

*For any* two consecutive builds of the same source files, the output filenames SHALL be identical (no content hashes or random suffixes).

**Validates: Requirements 1.6**

### Property 4: Spec validation equivalence

*For any* JSON object (valid or invalid), the TypeScript `validateSpec` function SHALL produce the same `{ ok, error?, spec? }` result as the original ES5 `validateSpec` function.

**Validates: Requirements 2.2**

### Property 5: Search filter equivalence

*For any* array of name strings and any query string, the TypeScript `filterTests` function SHALL return the same filtered array as the original ES5 `filterTests` function.

**Validates: Requirements 2.3, 4.5, 10.4**

### Property 6: Favourites sort equivalence

*For any* array of automation objects (each with a `.name` property) and any favourites map (object mapping names to `true`), the TypeScript `sortAutomationsWithFavourites` function SHALL return the same ordered array as the original ES5 function — favourited items first, preserving relative order within each group.

**Validates: Requirements 2.4, 4.8**

### Property 7: Store persistence round-trip

*For any* favourites map, persisting it to extension storage via the store's `toggleFavourite` action and then reloading it SHALL return the same favourites map.

**Validates: Requirements 3.4, 4.7**

### Property 8: File validation error display

*For any* invalid spec JSON (that fails `validateSpec`), the file loader composable SHALL set its `error` ref to the validation error message and SHALL NOT modify the store's spec state.

**Validates: Requirements 4.2, 4.3**

### Property 9: Quick-run helper correctness

*For any* steps array of length N, `buildAllStepsChecked` SHALL return `[0, 1, ..., N-1]`. *For any* params array with valid types, `buildDefaultParams` SHALL return an object with one key per param using the type-appropriate default value (empty string for string, 0 for number, today's date for date, first option for enum).

**Validates: Requirements 4.10**

### Property 10: Playground URL detection

*For any* URL string, `isPlaygroundUrl` SHALL return `true` if and only if the URL exactly equals `https://facka.github.io/tomation` or starts with `https://facka.github.io/tomation/`.

**Validates: Requirements 4.11**

### Property 11: Parameter form type mapping

*For any* automation parameter definition with type in `{string, number, date, enum}`, the parameter form component SHALL render the corresponding HTML input type (text, number, date, select).

**Validates: Requirements 5.4**

### Property 12: Required parameter validation

*For any* set of automation parameters where at least one non-optional parameter has an empty value, the run initiation SHALL be prevented and a validation error message SHALL be displayed.

**Validates: Requirements 5.5**

### Property 13: Step status to CSS class mapping

*For any* step status value in `{queued, in-progress, pass, fail, skipped}`, the log entry component SHALL apply the corresponding CSS class to the rendered element.

**Validates: Requirements 6.3**

### Property 14: Task header aggregate status

*For any* set of child step statuses within a task group: if all are `pass`, the task header SHALL show `task-pass`; if any are `fail` or `skipped`, the task header SHALL show `task-warning`; if at least one is started but not all complete, the task header SHALL show `task-in-progress`.

**Validates: Requirements 6.4**

### Property 15: Context popup completeness

*For any* context store object with N key-value entries (N ≥ 0), the context popup table SHALL render exactly N rows, each containing the correct key and formatted value.

**Validates: Requirements 6.7**

### Property 16: Browser API detection

*For any* environment where `browser` is defined as a global, the API module SHALL use `browser`; otherwise it SHALL use `chrome`. The selected API object SHALL be used for all messaging, storage, and tab operations.

**Validates: Requirements 8.1**

### Property 17: Message protocol compatibility

*For any* user action that triggers an outgoing message (run test, run automation, retry, skip, stop, pause, resume, load bundled), the Vue panel SHALL send a message with the same `type` field and payload shape as the original panel sends for the same action.

**Validates: Requirements 8.4**

### Property 18: Run execution state transitions

*For any* valid sequence of background messages (STEP_PLAN → STEP_STARTING → LOG/UPDATE_LOG_ENTRY → RUN_COMPLETE), the run execution composable SHALL transition each step through statuses in a valid order: `queued → in-progress → pass|fail|skipped`, and SHALL never transition backward (e.g., `pass → queued`).

**Validates: Requirements 10.3**
