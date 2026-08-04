import { computed } from 'vue';
import { useStore } from '@/store';
import { useMessaging } from './useMessaging';

/**
 * Composable for run execution state and controller actions.
 * Exposes computed refs for run status and actions wired to messaging + store.
 */
export function useRunExecution() {
  const store = useStore();
  const { send } = useMessaging();

  const isRunning = computed(() => store.state.isRunning);
  const isPaused = computed(() => store.state.isPaused);
  const logEntries = computed(() => store.state.logEntries);
  const summary = computed(() => store.state.runSummary);

  /**
   * Pause the current execution run.
   */
  function pause(): void {
    send({ type: 'PAUSE' });
    store.setPaused(true);
  }

  /**
   * Resume a paused execution run.
   */
  function resume(): void {
    send({ type: 'CONTINUE' });
    store.setPaused(false);
  }

  /**
   * Stop the current execution run.
   */
  function stop(): void {
    send({ type: 'STOP' });
  }

  /**
   * Retry a failed step (debug mode).
   */
  function retry(stepIndex: number): void {
    send({ type: 'RETRY_STEP', stepIndex });
    store.setStepStatus(stepIndex, 'in-progress');
  }

  /**
   * Skip a failed step (debug mode).
   */
  function skip(stepIndex: number): void {
    send({ type: 'SKIP_STEP', stepIndex });
    store.setStepStatus(stepIndex, 'skipped');
  }

  return { isRunning, isPaused, logEntries, summary, pause, resume, stop, retry, skip };
}
