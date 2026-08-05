import { reactive, computed } from 'vue';
import type {
  ViewName,
  StepStatus,
  Runnable,
  RunConfig,
  LogEntry,
  StoreState,
} from '../types/store';
import type { Spec, SpecEntry, Project, Param } from '../types/spec';
import type { StepPlanEntry } from '../types/messages';
import { filterTests } from '../logic/filterTests';
import { sortAutomationsWithFavourites } from '../logic/sortFavourites';
import { isPlaygroundUrl } from '../logic/browserApi';
import { api } from '../logic/browserApi';

// --- Helpers ---

function generateUUID(): string {
  const template = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';
  return template.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function storageGet(key: string): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    api.storage.local.get(key, (items) => resolve(items));
  });
}

function storageSet(items: Record<string, unknown>): Promise<void> {
  return new Promise((resolve) => {
    api.storage.local.set(items, () => resolve());
  });
}

function getProject(hostname: string): Promise<Project | null> {
  return storageGet(hostname).then((result) => {
    return (result[hostname] as Project) || null;
  });
}

function saveProject(hostname: string, project: Project): Promise<void> {
  const data: Record<string, unknown> = {};
  data[hostname] = project;
  return storageSet(data);
}

// --- State ---

const state = reactive<StoreState>({
  currentView: 'home',
  currentHostname: null,
  currentProject: null,
  currentSpec: null,
  currentRunnable: null,

  activeTab: 'tests',
  favourites: {},
  searchQuery: '',

  isRunning: false,
  isPaused: false,
  runConfig: null,
  logEntries: [],
  runSummary: null,
  contextStore: {},
  automationParams: null,

  playgroundPromptDismissed: false,
  lastKnownTabUrl: null,
  errorMessage: null,
});

// --- Getters ---

const filteredTests = computed(() => {
  if (!state.currentProject) return [];
  const allTests = state.currentProject.specs.flatMap((s) => s.spec.tests);
  if (!state.searchQuery) return allTests;
  const matchingNames = filterTests(
    allTests.map((t) => t.name),
    state.searchQuery,
  );
  return allTests.filter((t) => matchingNames.includes(t.name));
});

const filteredAutomations = computed(() => {
  if (!state.currentProject) return [];
  const allAutos = state.currentProject.specs.flatMap((s) => s.spec.automations ?? []);
  if (!state.searchQuery) return allAutos;
  const matchingNames = filterTests(
    allAutos.map((a) => a.name),
    state.searchQuery,
  );
  return allAutos.filter((a) => matchingNames.includes(a.name));
});

const sortedAutomations = computed(() => {
  return sortAutomationsWithFavourites(filteredAutomations.value, state.favourites);
});

const isPlaygroundDetected = computed(() => {
  return isPlaygroundUrl(state.lastKnownTabUrl);
});

const showPlaygroundPrompt = computed(() => {
  return (
    isPlaygroundDetected.value &&
    !state.currentProject &&
    !state.playgroundPromptDismissed
  );
});

// --- Actions ---

function setView(view: ViewName): void {
  state.currentView = view;
}

async function loadSpec(hostname: string, filename: string, spec: Spec): Promise<void> {
  let project = await getProject(hostname);

  if (!project) {
    project = {
      host: hostname,
      name: hostname,
      specs: [],
      lastUsed: new Date().toISOString(),
    };
  }

  const existingIndex = project.specs.findIndex((s) => s.filename === filename);

  if (existingIndex >= 0) {
    project.specs[existingIndex].loadedAt = new Date().toISOString();
    project.specs[existingIndex].spec = spec;
  } else {
    project.specs.push({
      id: generateUUID(),
      filename,
      loadedAt: new Date().toISOString(),
      spec,
    });
  }

  project.lastUsed = new Date().toISOString();
  await saveProject(hostname, project);

  state.currentHostname = hostname;
  state.currentProject = project;
  state.currentSpec = project.specs[existingIndex >= 0 ? existingIndex : project.specs.length - 1];

  // Load favourites from project
  state.favourites = project.favourites ?? {};
}

function setProject(project: Project | null): void {
  state.currentProject = project;
  if (project) {
    state.favourites = project.favourites ?? {};
  }
}

function setHostname(hostname: string | null): void {
  state.currentHostname = hostname;
}

function selectRunnable(specEntry: SpecEntry, runnable: Runnable): void {
  state.currentSpec = specEntry;
  state.currentRunnable = runnable;
}

function clearRunnable(): void {
  state.currentRunnable = null;
}

function toggleFavourite(automationName: string): void {
  if (state.favourites[automationName]) {
    delete state.favourites[automationName];
  } else {
    state.favourites[automationName] = true;
  }

  // Persist favourites
  if (state.currentHostname) {
    saveFavourites(state.currentHostname, { ...state.favourites });
  }
}

function startRun(config: RunConfig, params?: Record<string, unknown>): void {
  state.isRunning = true;
  state.isPaused = false;
  state.runConfig = config;
  state.logEntries = [];
  state.runSummary = null;
  state.contextStore = {};
  state.automationParams = params ?? null;
  state.currentView = 'run';
}

function setStepPlan(steps: StepPlanEntry[]): void {
  state.logEntries = steps.map((step, index) => ({
    stepIndex: index,
    status: 'queued' as StepStatus,
    action: step.action,
    target: step.target,
    value: step.value,
    taskPath: step.taskPath,
    taskDepth: step.taskDepth,
  }));
}

function setStepStatus(stepIndex: number, status: StepStatus, meta?: Partial<LogEntry>): void {
  const entry = state.logEntries[stepIndex];
  if (entry) {
    entry.status = status;
    if (meta) {
      if (meta.action !== undefined) entry.action = meta.action;
      if (meta.target !== undefined) entry.target = meta.target;
      if (meta.value !== undefined) entry.value = meta.value;
      if (meta.error !== undefined) entry.error = meta.error;
      if (meta.retryAttempt !== undefined) entry.retryAttempt = meta.retryAttempt;
      if (meta.taskPath !== undefined) entry.taskPath = meta.taskPath;
      if (meta.taskDepth !== undefined) entry.taskDepth = meta.taskDepth;
      if (meta.resolvedContext !== undefined) entry.resolvedContext = meta.resolvedContext;
    }
  }
}

function setRunComplete(summary: { total: number; passed: number; failed: number }): void {
  state.isRunning = false;
  state.isPaused = false;
  state.runSummary = summary;
}

function setPaused(paused: boolean): void {
  state.isPaused = paused;
}

function stopRun(): void {
  state.isRunning = false;
  state.isPaused = false;
}

function updateContext(key: string, value: unknown): void {
  state.contextStore[key] = value;
}

function setContextStore(store: Record<string, unknown>): void {
  state.contextStore = store;
}

function setActiveTab(tab: 'tests' | 'automations'): void {
  state.activeTab = tab;
  // Persist active tab to storage
  storageSet({ home_active_tab: tab }).catch((err) => {
    console.error('saveActiveTab: failed to write active tab:', err);
  });
}

function setSearchQuery(query: string): void {
  state.searchQuery = query;
}

// --- Persistence Helpers ---

async function saveFavourites(
  hostname: string,
  favourites: Record<string, boolean>,
): Promise<void> {
  try {
    let project = await getProject(hostname);
    if (!project) {
      project = {
        host: hostname,
        name: hostname,
        specs: [],
        lastUsed: new Date().toISOString(),
      };
    }
    project.favourites = favourites;
    await saveProject(hostname, project);
  } catch (err) {
    console.error('saveFavourites: failed to write favourites for "' + hostname + '":', err);
  }
}

// --- Test Plan Config Persistence ---

const VALID_SPEEDS = ['FAST', 'NORMAL', 'SLOW'] as const;

const DEFAULT_TEST_PLAN_CONFIG: RunConfig = {
  allowContinueOnFailure: false,
  allowRetryOnFailure: false,
  executionSpeed: 'NORMAL',
};

/**
 * Persist a test plan configuration to storage.
 * Storage key format: "config:<specId>:<runnableIndex>"
 */
async function saveTestPlanConfig(
  specId: string,
  runnableIndex: number,
  config: RunConfig,
): Promise<void> {
  const key = `config:${specId}:${runnableIndex}`;
  const data: Record<string, unknown> = {};
  data[key] = config;
  try {
    await storageSet(data);
  } catch (err) {
    console.error('saveTestPlanConfig: failed to write config for key "' + key + '":', err);
  }
}

/**
 * Load a persisted test plan configuration from storage.
 * Returns null if missing; returns defaults if stored value has invalid shape.
 */
async function getTestPlanConfig(
  specId: string,
  runnableIndex: number,
): Promise<RunConfig | null> {
  const key = `config:${specId}:${runnableIndex}`;
  try {
    const result = await storageGet(key);
    const stored = result[key] as Record<string, unknown> | undefined;

    if (!stored || typeof stored !== 'object') {
      return null;
    }

    // Validate shape
    if (
      typeof stored.allowContinueOnFailure !== 'boolean' ||
      typeof stored.allowRetryOnFailure !== 'boolean' ||
      typeof stored.executionSpeed !== 'string' ||
      !(VALID_SPEEDS as readonly string[]).includes(stored.executionSpeed)
    ) {
      console.warn(
        'getTestPlanConfig: stored config has invalid shape for key "' + key + '", returning defaults',
      );
      return { ...DEFAULT_TEST_PLAN_CONFIG };
    }

    return {
      allowContinueOnFailure: stored.allowContinueOnFailure,
      allowRetryOnFailure: stored.allowRetryOnFailure,
      executionSpeed: stored.executionSpeed as RunConfig['executionSpeed'],
    };
  } catch {
    return null;
  }
}

// --- Param Persistence ---

/**
 * Persist the last-used parameter values for an Automation.
 * Stores params inside the project object at project.savedParams[automationName].
 */
async function saveParamValues(
  hostname: string,
  automationName: string,
  params: Record<string, unknown>,
): Promise<void> {
  try {
    let project = await getProject(hostname);
    if (!project) {
      project = {
        host: hostname,
        name: hostname,
        specs: [],
        lastUsed: new Date().toISOString(),
      };
    }
    if (!project.savedParams) {
      project.savedParams = {};
    }
    project.savedParams[automationName] = params;
    await saveProject(hostname, project);
  } catch (err) {
    console.error('saveParamValues: failed to write params for "' + automationName + '":', err);
  }
}

/**
 * Load saved parameter values for an Automation from project storage.
 * Returns null if no stored values exist or on read failure.
 */
async function loadParamValues(
  hostname: string,
  automationName: string,
): Promise<Record<string, unknown> | null> {
  try {
    const project = await getProject(hostname);
    if (project?.savedParams?.[automationName]) {
      return project.savedParams[automationName];
    }
    return null;
  } catch (err) {
    console.error('loadParamValues: failed to read params for "' + automationName + '":', err);
    return null;
  }
}

// --- Required Params Helper ---

/**
 * Returns true if any non-optional parameter has no saved value.
 * A param is considered "without value" if savedValues is null,
 * or the param's name is not in savedValues, or its value is undefined/null/empty string.
 */
function hasRequiredParamsWithoutValues(
  params: Param[],
  savedValues: Record<string, unknown> | null,
): boolean {
  for (const param of params) {
    if (param.optional === true) continue;
    if (
      !savedValues ||
      savedValues[param.name] === undefined ||
      savedValues[param.name] === null ||
      savedValues[param.name] === ''
    ) {
      return true;
    }
  }
  return false;
}

// --- Init helpers ---

async function loadPersistedState(hostname: string): Promise<void> {
  // Load favourites
  try {
    const project = await getProject(hostname);
    if (project?.favourites) {
      state.favourites = project.favourites;
    }
  } catch {
    // silent fail
  }

  // Load active tab
  try {
    const result = await storageGet('home_active_tab');
    const tab = result['home_active_tab'];
    if (tab === 'tests' || tab === 'automations') {
      state.activeTab = tab as 'tests' | 'automations';
    }
  } catch {
    // silent fail
  }
}

/**
 * Load the full project from extension storage for a given hostname.
 * Restores currentProject, currentSpec, favourites, and active tab.
 */
async function loadProjectFromStorage(hostname: string): Promise<void> {
  try {
    const project = await getProject(hostname);
    if (project) {
      state.currentProject = project;
      state.favourites = project.favourites ?? {};

      // Set current spec to the most recently loaded one
      if (project.specs.length > 0) {
        const sorted = [...project.specs].sort(
          (a, b) => new Date(b.loadedAt).getTime() - new Date(a.loadedAt).getTime(),
        );
        state.currentSpec = sorted[0];
      }
    }
  } catch {
    // silent fail - panel starts in landing page state
  }

  // Restore active tab preference
  try {
    const result = await storageGet('home_active_tab');
    const tab = result['home_active_tab'];
    if (tab === 'tests' || tab === 'automations') {
      state.activeTab = tab as 'tests' | 'automations';
    }
  } catch {
    // silent fail
  }
}

// --- Export ---

export function useStore() {
  return {
    state,

    // Getters
    filteredTests,
    filteredAutomations,
    sortedAutomations,
    isPlaygroundDetected,
    showPlaygroundPrompt,

    // Actions
    setView,
    loadSpec,
    setProject,
    setHostname,
    selectRunnable,
    clearRunnable,
    toggleFavourite,
    startRun,
    setStepPlan,
    setStepStatus,
    setRunComplete,
    setPaused,
    stopRun,
    updateContext,
    setContextStore,
    setActiveTab,
    setSearchQuery,

    // Init
    loadPersistedState,
    loadProjectFromStorage,

    // Persistence
    saveTestPlanConfig,
    getTestPlanConfig,
    saveParamValues,
    loadParamValues,
    hasRequiredParamsWithoutValues,
  };
}
