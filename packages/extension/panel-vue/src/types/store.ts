import type { Spec, SpecEntry, Project, TestEntry, AutomationEntry } from './spec';
import type { StepPlanEntry } from './messages';

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
  resolvedContext?: Array<{ key: string; value: unknown }>;
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
  runSummary: { total: number; passed: number; failed: number } | null;
  contextStore: Record<string, unknown>;
  automationParams: Record<string, unknown> | null;
  resolvedTestData: Record<string, string | number> | null;
  resolvedDataSeeds: Record<string, number> | null;

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
  setStepPlan(steps: StepPlanEntry[]): void;
  setStepStatus(stepIndex: number, status: StepStatus, meta?: Partial<LogEntry>): void;
  setRunComplete(summary: { total: number; passed: number; failed: number }): void;
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
