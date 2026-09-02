/**
 * Scheduler / debouncer.
 *
 * Coalesces edits and cancels superseded work so validation stays responsive
 * and never piles up (Req 3.3, 11.2–11.5). Two key spaces are served:
 *
 *  - **file validation**, keyed by document URI — rapid edits to one buffer
 *    collapse to a single pass per debounce interval, and a newer edit cancels
 *    the pending/in-flight run for that URI (Req 3.3, 11.4);
 *  - **project validation**, keyed by workspace-folder URI — many saves in a
 *    folder collapse to a single project pass, coalesced so redundant re-runs
 *    are avoided (Req 11.3).
 *
 * File and project keys live in separate maps so a document URI can never
 * collide with a folder URI.
 *
 * Each scheduled run receives a `CancellationToken`. When a newer run is
 * scheduled for the same key, the prior run's token is cancelled — a pending
 * (not-yet-fired) run is dropped, and an in-flight run is signalled to bail
 * early (long project passes check the token between files). If a run is
 * in-flight when a newer schedule arrives, the newer request is remembered and
 * re-run exactly once after the current pass settles, so no work is lost while
 * duplicates are still coalesced (Req 11.3, 11.4).
 *
 * The debounce interval is read lazily via `getDelay` so a change to the
 * `tomation.validation.debounceInterval` setting takes effect on the next
 * schedule without recreating the scheduler (Req 11.2).
 *
 * Requirements: 3.3, 11.2, 11.3, 11.4, 11.5.
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

/** The work a scheduled key runs. */
type Run = (token: CancellationToken) => Promise<void>;

/**
 * Per-key state. At most one timer and one in-flight run exist per key.
 * `pending` holds the latest run requested while another run is either waiting
 * on its debounce timer or in flight — it supersedes any earlier pending run,
 * which is how duplicate schedules coalesce.
 */
interface KeyState {
  /** The debounce timer, if a run is waiting to fire. */
  timer?: ReturnType<typeof setTimeout>;
  /** The cancellation source for the timer/in-flight run. */
  source?: CancellationTokenSource;
  /** True while a run is executing for this key. */
  running: boolean;
  /** The latest run to execute once the current timer fires or run settles. */
  pending?: Run;
}

/**
 * Create a debounce scheduler. `getDelay` is read lazily so a settings change
 * to `debounceInterval` takes effect on the next schedule (Req 11.2).
 */
export function createScheduler(getDelay: () => number): Scheduler {
  const files = new Map<string, KeyState>();
  const projects = new Map<string, KeyState>();
  let disposed = false;

  function stateFor(map: Map<string, KeyState>, key: string): KeyState {
    let state = map.get(key);
    if (!state) {
      state = { running: false };
      map.set(key, state);
    }
    return state;
  }

  /** Cancel and clear any pending timer + token for a key's current run. */
  function cancelCurrent(state: KeyState): void {
    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = undefined;
    }
    if (state.source) {
      state.source.cancel();
      state.source.dispose();
      state.source = undefined;
    }
  }

  function schedule(map: Map<string, KeyState>, key: string, run: Run): void {
    if (disposed) {
      return;
    }
    const state = stateFor(map, key);

    // A newer schedule always supersedes the prior one for this key: cancel the
    // pending timer / in-flight token (Req 11.4).
    cancelCurrent(state);

    // If a run is currently executing, remember this as the latest pending run
    // and let it fire once the in-flight run settles. This coalesces a burst of
    // schedules into a single follow-up pass (Req 11.3).
    if (state.running) {
      state.pending = run;
      return;
    }

    startTimer(map, key, state, run);
  }

  function startTimer(
    map: Map<string, KeyState>,
    key: string,
    state: KeyState,
    run: Run
  ): void {
    const source = new CancellationTokenSource();
    state.source = source;
    state.pending = undefined;

    state.timer = setTimeout(() => {
      state.timer = undefined;
      // The token may already be cancelled if a newer schedule landed between
      // the timer firing and this callback; honor it.
      if (source.token.isCancellationRequested) {
        source.dispose();
        return;
      }

      state.running = true;
      void Promise.resolve()
        .then(() => run(source.token))
        .catch(() => {
          // Runs own their own error reporting (diagnostics/output channel);
          // the scheduler only guarantees the chain keeps going.
        })
        .finally(() => {
          state.running = false;
          source.dispose();
          if (state.source === source) {
            state.source = undefined;
          }
          // If a newer schedule arrived while this run was in flight, run it now
          // (single follow-up pass — redundant intermediate requests were
          // already collapsed into `pending`).
          const next = state.pending;
          state.pending = undefined;
          if (next && !disposed) {
            startTimer(map, key, state, next);
          } else if (!next && !state.timer && !state.source) {
            // Nothing left for this key; drop its state to avoid unbounded growth.
            map.delete(key);
          }
        });
    }, Math.max(0, getDelay()));
  }

  function disposeMap(map: Map<string, KeyState>): void {
    for (const state of map.values()) {
      cancelCurrent(state);
      state.pending = undefined;
    }
    map.clear();
  }

  return {
    scheduleFile(uri, run): void {
      schedule(files, uri, run);
    },
    scheduleProject(folder, run): void {
      schedule(projects, folder, run);
    },
    dispose(): void {
      disposed = true;
      disposeMap(files);
      disposeMap(projects);
    },
  };
}
