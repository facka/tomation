/**
 * Project Symbol Index.
 *
 * PLACEHOLDER — task 6.1 owns the real implementation (per-folder element/task
 * symbol maps, cross-file resolution, incremental maintenance). This minimal
 * version defines the symbol shapes and the `ProjectIndex` contract the server
 * bootstrap and providers wire against, with no-op maintenance hooks.
 */

/** A declared element symbol, keyed by its resolved namespaced key. */
export interface ElementSymbol {
  variableName: string;
  namespacedKey: string;
  tag: string;
  label: string | null;
  whereSummary: string;
  filePath: string;
  line: number;
}

/** A declared task symbol, keyed by its resolved namespaced key. */
export interface TaskSymbol {
  name: string;
  namespacedKey: string;
  label: string | null;
  paramNames: string[];
  filePath: string;
  line: number;
}

/**
 * Per-workspace-folder in-memory model of declared elements and tasks. The
 * server bootstrap drives `updateFile`/`removeFile` through the scheduler and
 * the providers read `elements`/`tasks`.
 */
export interface ProjectIndex {
  elements: Map<string, ElementSymbol>;
  tasks: Map<string, TaskSymbol>;
  byFile: Map<string, { elements: string[]; tasks: string[] }>;
  /** Re-parse a single file and refresh its symbols. */
  updateFile(uri: string): void;
  /** Remove a file's symbols (on delete). */
  removeFile(uri: string): void;
}

/**
 * Create an empty Project Index. The real implementation (task 6.1) fills in
 * parsing, namespace resolution, and incremental maintenance.
 */
export function createProjectIndex(): ProjectIndex {
  return {
    elements: new Map(),
    tasks: new Map(),
    byFile: new Map(),
    updateFile(_uri: string): void {
      // No-op until task 6.1 implements index building.
    },
    removeFile(_uri: string): void {
      // No-op until task 6.1 implements incremental removal.
    },
  };
}
