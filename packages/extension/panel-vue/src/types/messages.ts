import type { RunConfig } from './store';
import type { Spec } from './spec';
import type { AIConfig } from './lab';

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
  | { type: 'GET_CONTEXT' }
  | { type: 'INJECT_INSPECTOR' }
  | { type: 'REMOVE_INSPECTOR' }
  | { type: 'GENERATE_POM'; htmlContext: string; contextMode: 'full' | 'subtree'; aiConfig: AIConfig }
  | { type: 'GET_PAGE_HTML' };

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
  | { type: 'CONTEXT_STATE'; store: Record<string, unknown> }
  | { type: 'INSPECTOR_INJECTED'; success: boolean; error?: string }
  | { type: 'NODE_SELECTED'; tagName: string; attributes: Record<string, string>; outerHTML: string; childElementCount: number }
  | { type: 'INSPECT_CANCELLED' }
  | { type: 'PAGE_HTML'; html?: string; error?: string }
  | { type: 'POM_GENERATED'; code: string; pomName: string }
  | { type: 'POM_GENERATION_ERROR'; provider: string; status?: number; error: string }
  | { type: 'POM_GENERATION_TIMEOUT' };

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
