import type { Spec, SpecEntry, Project, TestEntry, AutomationEntry } from './spec';
import type { StepPlanEntry } from './messages';
import type { FindTrace } from './findTrace';

export type ViewName = 'home' | 'test-plan' | 'run' | 'error';
export type RunnableType = 'test' | 'automation';
export type StepStatus = 'queued' | 'in-progress' | 'pass' | 'fail' | 'skipped';

/**
 * Describes an evaluated conditional (if / When). Attached to a "condition"
 * log entry so the run view can show the branch decision.
 */
export interface StepCondition {
  source?: 'ctx';
  param?: string;
  key?: string;
  op: 'truthy' | 'falsy' | 'equals' | 'notEquals';
  value?: string;
}
/** A normalized row/column selector on a table cell accessor. */
export interface CellSelector {
  tag?: string;
  index: number | 'first' | 'last';
}

/**
 * The structured table-cell accessor attached to a step whose target is a
 * `cell`/`firstRow`/`lastRow` call. Carried through to the run log so the
 * panel can display the targeted row/column, preferring `columnName`.
 */
export interface TableCellAccessor {
  type: 'tableCell';
  row: CellSelector;
  column: CellSelector;
  columnName?: string;
}

export type TaskHeaderStatus = 'queued' | 'in-progress' | 'pass' | 'warning';

export interface Runnable {
  type: RunnableType;
  index: number;
  data: TestEntry | AutomationEntry;
  // Present when running a saved copy of an automation instead of the automation itself
  instanceId?: string;
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
  resolvedContext?: Array<{ key: string; value: unknown }>;
  // Present on conditional (if / When) rows
  condition?: StepCondition;
  taken?: boolean;
  findTrace?: FindTrace;
  // Present on wait steps: the configured wait duration in milliseconds
  ms?: number;
  // Present on table-cell steps: the structured cell accessor, used to display
  // the targeted row/column (preferring columnName) in the run log.
  accessor?: TableCellAccessor;
}

/**
 * A single captured XHR/fetch request, attributed to the step that was
 * executing when it was initiated. Produced by the background capture service,
 * delivered over the `NETWORK_REQUEST` message, and stored (verbatim, unmasked)
 * in `StoreState.networkRequests`.
 */
export interface CapturedRequest {
  requestId: string;
  url: string;
  method: string;
  queryParams: Record<string, string[]>;
  requestBody: string;
  requestBodyTruncated: boolean;
  status: number | null;
  responseBody: string;
  responseBodyTruncated: boolean;
  bodyUnavailable: boolean;
  stepIndex: number | null;
  taskPath: Array<{ name: string; label?: string; params?: unknown }> | null;
  initiatedAt: number;
}

export interface StoreState {
  // Core state
  currentView: ViewName;
  currentHostname: string | null;
  currentProject: Project | null;
  currentSpec: SpecEntry | null;
  currentRunnable: Runnable | null;

  // Home view
  activeTab: 'tests' | 'automations' | 'lab';
  favourites: Record<string, boolean>;
  searchQuery: string;

  // Run state
  isRunning: boolean;
  isPaused: boolean;
  runConfig: RunConfig | null;
  logEntries: LogEntry[];
  // Captured network requests, keyed by String(stepIndex) or the literal
  // 'unattributed' (for requests with a null step index). Each group is kept
  // sorted by `initiatedAt`.
  networkRequests: Record<string, CapturedRequest[]>;
  // True while capture is attached and the run is in progress with no
  // completion yet known; used to drive the per-step count loading placeholder.
  networkCapturePending: boolean;
  runSummary: { total: number; passed: number; failed: number; stopped?: boolean; reason?: string } | null;
  contextStore: Record<string, unknown>;
  automationParams: Record<string, unknown> | null;
  resolvedTestData: Record<string, string | number> | null;
  resolvedDataSeeds: Record<string, number> | null;

  // UI state
  playgroundPromptDismissed: boolean;
  lastKnownTabUrl: string | null;
  errorMessage: string | null;

  // Live reload (connects to the `tomation watch` dev server)
  liveReload: {
    active: boolean;
    port: number | null;
    error: string | null;
  };
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
  setStepPlan(steps: StepPlanEntry[]): void;
  setStepStatus(stepIndex: number, status: StepStatus, meta?: Partial<LogEntry>): void;
  setRunComplete(summary: { total: number; passed: number; failed: number }): void;
  addNetworkRequest(request: CapturedRequest): void;
  networkRequestCount(stepIndex: number): number;
  setPaused(paused: boolean): void;
  stopRun(): void;

  // Context
  updateContext(key: string, value: unknown): void;
  setContextStore(store: Record<string, unknown>): void;

  // Tab & search
  setActiveTab(tab: 'tests' | 'automations' | 'lab'): void;
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
