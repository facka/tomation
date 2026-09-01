/**
 * Scheduler / debouncer.
 *
 * PLACEHOLDER — task 2.3 owns the real implementation (per-key debounce with
 * cancellation, project coalescing, redundant-run avoidance). This minimal
 * version defines the `Scheduler` interface the server bootstrap wires against
 * and a bare-bones per-key timer implementation so the wiring compiles and
 * behaves sensibly. The real scheduler will replace the internals.
 */

import { CancellationToken, CancellationTokenSource } from 'vscode-languageserver/node';

/**
 * Coalesces edits and cancels superseded work. Keys are document URIs (file
 * validation) or workspace-folder URIs (project validation).
 */
export interface Scheduler {
  /**
   * Schedule per-URI file validation. A newer call for the same URI cancels
   * the pending/in-flight run for that URI.
   */
  scheduleFile(uri: string, run: (token: CancellationToken) => Promise<void>): void;
  /**
   * Schedule per-workspace-folder project validation, coalesced so multiple
   * saves in a folder collapse into a single pass.
   */
  scheduleProject(folder: string, run: (token: CancellationToken) => Promise<void>): void;
  /** Dispose all pending timers and cancel in-flight work. */
  dispose(): void;
}

interface PendingEntry {
  timer: ReturnType<typeof setTimeout>;
  source: CancellationTokenSource;
}

/**
 * Create a minimal debounce scheduler. `getDelay` is read lazily so a settings
 * change to `debounceInterval` takes effect on the next schedule.
 */
export function createScheduler(getDelay: () => number): Scheduler {
  const pending = new Map<string, PendingEntry>();

  function schedule(
    key: string,
    run: (token: CancellationToken) => Promise<void>
  ): void {
    const existing = pending.get(key);
    if (existing) {
      clearTimeout(existing.timer);
      existing.source.cancel();
      existing.source.dispose();
    }

    const source = new CancellationTokenSource();
    const timer = setTimeout(() => {
      pending.delete(key);
      void Promise.resolve(run(source.token)).finally(() => source.dispose());
    }, getDelay());

    pending.set(key, { timer, source });
  }

  return {
    scheduleFile: schedule,
    scheduleProject: schedule,
    dispose(): void {
      for (const entry of pending.values()) {
        clearTimeout(entry.timer);
        entry.source.cancel();
        entry.source.dispose();
      }
      pending.clear();
    },
  };
}
