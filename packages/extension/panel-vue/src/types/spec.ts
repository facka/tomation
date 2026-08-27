import type { StepCondition } from './store';

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
  name?: string; // for task action
  params?: Record<string, unknown>;
  gone?: boolean;
  contextKey?: string;
  // Conditional (if / When) steps
  condition?: StepCondition;
  then?: Step[];
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
