import type { RunConfig } from './store';
import type { Spec } from './spec';
import type { AIConfig } from './lab';
import type { StepCondition } from './store';
import type { FindTrace } from './findTrace';

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
  | { type: 'GENERATE_POM'; htmlContext: string; contextMode: 'full' | 'inspect'; aiConfig: AIConfig }
  | { type: 'GET_PAGE_HTML' };

// Messages sent FROM background TO panel
export type BackgroundMessage =
  | { type: 'STEP_PLAN'; steps: StepPlanEntry[] }
  | { type: 'STEP_STARTING'; stepIndex: number; action: string; target?: string; value?: string; url?: string; ms?: number; description?: string; name?: string; params?: Record<string, unknown>; taskDepth?: number; taskPath?: Array<{ name: string; label?: string; params?: Record<string, unknown> }> }
  | { type: 'LOG'; stepIndex: number; action: string; target?: string; value?: string; ok: boolean; error?: string; retryAttempt?: number; contextKey?: string; savedValue?: unknown; resolvedContext?: Array<{ key: string; value: unknown }>; condition?: StepCondition; taken?: boolean; taskDepth?: number; taskPath?: Array<{ name: string; label?: string; params?: Record<string, unknown> }>; findTrace?: FindTrace }
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
  | { type: 'POM_GENERATION_TIMEOUT' }
  | { type: 'DATA_RESOLVED'; data: Record<string, string | number>; seeds?: Record<string, number> };

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
  condition?: StepCondition;
  taken?: boolean;
}
// --- Content-script hover contract (panel → content script, via api.tabs.sendMessage) ---
// These are a distinct content-script contract and are intentionally NOT part of
// PanelMessage / BackgroundMessage (which cover the panel↔background channel).

// Messages sent FROM panel TO the content script
export interface HoverHighlightMessage {
  type: 'HOVER_HIGHLIGHT';
  key: string;
}

// Highlight by XPath expression — used by the find-trace disclosure to
// highlight a resolved parent element when the child could not be found.
export interface HoverHighlightXPathMessage {
  type: 'HOVER_HIGHLIGHT_XPATH';
  xpath: string;
}

// Highlight by a spec element descriptor (tag+where or xpath). Used by the
// ElementInfoCard to highlight any spec-defined element — including a childOf
// parent that was never tagged — using the finder's matching semantics.
export interface HoverHighlightDescriptorMessage {
  type: 'HOVER_HIGHLIGHT_DESCRIPTOR';
  descriptor: {
    tag?: string;
    where?: Record<string, string>;
    xpath?: string;
  };
}

export interface HoverClearMessage {
  type: 'HOVER_CLEAR';
}

export type ContentScriptHoverMessage =
  | HoverHighlightMessage
  | HoverHighlightXPathMessage
  | HoverHighlightDescriptorMessage
  | HoverClearMessage;

// Responses returned by the content script
export interface HoverResult {
  type: 'HOVER_RESULT';
  found: number;
}

export interface HoverClearResult {
  ok: true;
}
