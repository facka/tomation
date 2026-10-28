<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import { useStore } from '@/store';
import { useRunExecution } from '@/composables/useRunExecution';
import type { TaskHeaderStatus, StepStatus } from '@/types/store';
import type { LogEntry, CapturedRequest } from '@/types/store';
import LogEntryComponent from './LogEntry.vue';
import TaskHeader from './TaskHeader.vue';
import NetworkLogEntry from './NetworkLogEntry.vue';

const store = useStore();
const { retry, skip } = useRunExecution();

// --- Refs ---

const containerRef = ref<HTMLElement | null>(null);

// --- Computed ---

const logEntries = computed(() => store.state.logEntries);
const pageElements = computed(() => store.state.currentSpec?.spec.pageElements || {});
const automationParams = computed(() => store.state.automationParams);
const runConfig = computed(() => store.state.runConfig);

const debugMode = computed(() => {
  if (!runConfig.value) return false;
  return runConfig.value.allowRetryOnFailure || runConfig.value.allowContinueOnFailure;
});

// --- Parameter banner ---

const paramBannerItems = computed(() => {
  if (!automationParams.value) return [];
  const params = automationParams.value;
  const keys = Object.keys(params);
  if (keys.length === 0) return [];
  const sensitiveKeys = /password|secret|token|key|auth/i;
  return keys.map((key) => ({
    name: key,
    value: sensitiveKeys.test(key) ? '****' : String(params[key]),
  }));
});

// --- Task header rendering ---

interface TaskHeaderInfo {
  pathKey: string;
  name: string;
  label?: string;
  depth: number;
  params?: Record<string, unknown>;
  status: TaskHeaderStatus;
  // Component marker (COM): set when the taskPath node at this depth is
  // `isComponent`. Drives collapsible rendering. Absent/false for plain tasks.
  isComponent?: boolean;
  componentName?: string;
  // Whether this component group is currently collapsed (for the chevron).
  collapsed?: boolean;
}

// --- Component-group collapse state (COM) ---
//
// Local, per-`pathKey` expand/collapse state for component groups. A component
// header defaults to COLLAPSED. The map records only EXPLICIT user toggles
// (`true` = expanded, `false` = collapsed); an absent entry means "use the
// default". Plain (non-component) task headers are never collapsed.
const userToggled = ref<Record<string, boolean>>({});

/** Build the `pathKey` for the taskPath prefix of depth `d` (inclusive). */
function pathKeyAt(taskPath: Array<{ name: string }>, d: number): string {
  let key = '';
  for (let pk = 0; pk <= d; pk++) {
    key += (pk > 0 ? '>' : '') + taskPath[pk].name;
  }
  return key;
}

/**
 * The set of `pathKey`s that are component groups, i.e. whose taskPath node at
 * that depth carries `isComponent`. Derived from the live log entries so it
 * stays in sync as STEP messages arrive.
 */
const componentPathKeys = computed(() => {
  const set = new Set<string>();
  for (const entry of logEntries.value) {
    const taskPath = entry.taskPath || [];
    for (let d = 0; d < taskPath.length; d++) {
      if (taskPath[d].isComponent) {
        set.add(pathKeyAt(taskPath, d));
      }
    }
  }
  return set;
});

/** True when `pathKey` is a component group header. */
function isComponentPath(pathKey: string): boolean {
  return componentPathKeys.value.has(pathKey);
}

/** True when any descendant step under `pathKey` has failed. */
function hasFailingDescendant(pathKey: string): boolean {
  for (const entry of logEntries.value) {
    if (entry.status !== 'fail') continue;
    if (entryPathKeyUnder(entry, pathKey)) return true;
  }
  return false;
}

/** True when any descendant step under `pathKey` is currently in progress. */
function hasRunningDescendant(pathKey: string): boolean {
  for (const entry of logEntries.value) {
    if (entry.status !== 'in-progress') continue;
    if (entryPathKeyUnder(entry, pathKey)) return true;
  }
  return false;
}

/**
 * True when the entry's taskPath is strictly under `pathKey` (a descendant of
 * the component group), i.e. its full pathKey equals or starts with
 * `pathKey + '>'`.
 */
function entryPathKeyUnder(entry: { taskPath?: Array<{ name: string }> }, pathKey: string): boolean {
  const taskPath = entry.taskPath || [];
  if (taskPath.length === 0) return false;
  const full = pathKeyAt(taskPath, taskPath.length - 1);
  return full === pathKey || full.startsWith(pathKey + '>');
}

/**
 * Whether a group's children should be shown. A non-component header is always
 * expanded. For a component group the whole group's steps are shown while the
 * group is RUNNING (any descendant in progress) and kept shown if it FAILED
 * (force-expand down to the failing step). Once the group has PASSED — or before
 * it has started — it collapses to just its header, hiding the internal steps
 * that don't matter to the test narrative. An explicit user toggle always wins
 * over this automatic behavior.
 */
function effectiveExpanded(pathKey: string): boolean {
  if (!isComponentPath(pathKey)) return true;
  // Explicit user intent overrides the automatic running/pass/fail behavior.
  const toggled = userToggled.value[pathKey];
  if (toggled !== undefined) return toggled;
  // Auto: expanded while running or after a failure; collapsed otherwise
  // (passed, or not yet started).
  if (hasRunningDescendant(pathKey)) return true;
  if (hasFailingDescendant(pathKey)) return true;
  return false;
}

/**
 * The single "current step" descendant to show beneath a collapsed component
 * group while the run is in progress (Req 7.1): the in-progress descendant
 * under `pathKey`. Returns its stepIndex, or null when none is in-progress
 * (e.g. all queued, or completed — Req 7.2 shows header only).
 */
function currentStepIndexUnder(pathKey: string): number | null {
  for (const entry of logEntries.value) {
    if (entry.status !== 'in-progress') continue;
    if (entryPathKeyUnder(entry, pathKey)) return entry.stepIndex;
  }
  return null;
}

/**
 * Toggle a component group's collapse state. Keyed by `pathKey`; flips relative
 * to the current effective state so the first click always does the obvious
 * thing regardless of prior default.
 */
function toggleGroup(pathKey: string) {
  const next = !effectiveExpanded(pathKey);
  userToggled.value = { ...userToggled.value, [pathKey]: next };
}

/**
 * Decide whether a descendant row (log entry or nested header) at `fullPathKey`
 * should be suppressed because it lives inside a collapsed component group.
 *
 * Walk every ancestor prefix of `fullPathKey` that is a component group. If any
 * such ancestor is effectively collapsed, the row is hidden UNLESS it is the
 * single current-step line for that collapsed ancestor while running. The
 * `stepIndex` is provided for log-entry rows so the current-step exception can
 * apply; nested header rows pass `null` and are always suppressed under a
 * collapsed ancestor.
 */
function isSuppressed(fullPathKey: string, stepIndex: number | null): boolean {
  const parts = fullPathKey.split('>');
  let prefix = '';
  for (let i = 0; i < parts.length; i++) {
    prefix += (i > 0 ? '>' : '') + parts[i];

    const isSelfLevel = prefix === fullPathKey;
    // A HEADER row (stepIndex === null) must not treat its OWN path as an
    // enclosing collapse — a component header is always rendered (collapsed or
    // not); only a collapsed ancestor ABOVE it hides it. A LOG-ENTRY row
    // (stepIndex !== null) is a leaf step that lives INSIDE the task at
    // `fullPathKey`, so when that deepest task is a collapsed component the step
    // itself must be hidden. Hence we only stop early at the self level for
    // headers; for log entries we also evaluate the deepest (self) prefix.
    if (isSelfLevel && stepIndex === null) break;

    if (!isComponentPath(prefix)) {
      if (isSelfLevel) break;
      continue;
    }
    if (effectiveExpanded(prefix)) {
      if (isSelfLevel) break;
      continue;
    }
    // `prefix` is a collapsed component group enclosing this row. Allow only the
    // single current-step line (a log entry) to show beneath it while running.
    if (
      stepIndex !== null &&
      store.state.isRunning &&
      currentStepIndexUnder(prefix) === stepIndex
    ) {
      if (isSelfLevel) break;
      continue;
    }
    return true;
  }
  return false;
}

interface RenderItem {
  type: 'task-header' | 'log-entry' | 'network-entry';
  key: string;
  taskHeader?: TaskHeaderInfo;
  logEntry?: LogEntry;
  network?: CapturedRequest;
  awaitingAction?: boolean;
}

const renderItems = computed(() => {
  const items: RenderItem[] = [];
  const renderedHeaders = new Set<string>();

  for (const entry of logEntries.value) {
    const taskPath = entry.taskPath || [];
    const entryFullPathKey = taskPath.length > 0 ? pathKeyAt(taskPath, taskPath.length - 1) : '';

    // Insert task headers for new path levels
    for (let d = 0; d < taskPath.length; d++) {
      const pathKey = pathKeyAt(taskPath, d);

      if (!renderedHeaders.has(pathKey)) {
        renderedHeaders.add(pathKey);
        // A header row is itself suppressed when it lives under a collapsed
        // component ancestor. Headers never qualify as the current-step line
        // (stepIndex = null), so a nested header stays hidden while its parent
        // group is collapsed.
        if (isSuppressed(pathKey, null)) continue;

        const headerStatus = computeTaskHeaderStatus(pathKey);
        const isComponentHeader = isComponentPath(pathKey);
        items.push({
          type: 'task-header',
          key: 'header-' + pathKey,
          taskHeader: {
            pathKey,
            name: taskPath[d].name,
            label: taskPath[d].label,
            depth: d,
            params: taskPath[d].params,
            status: headerStatus,
            isComponent: isComponentHeader,
            componentName: taskPath[d].componentName,
            collapsed: isComponentHeader && !effectiveExpanded(pathKey),
          },
        });
      }
    }

    // Suppress this log entry when it lives under a collapsed component group
    // and is not the single current-step line (Req 6.4, 7.1, 7.2).
    if (isSuppressed(entryFullPathKey, entry.stepIndex)) continue;

    // Determine if this entry is awaiting action (fail + debug mode)
    const isAwaitingAction = entry.status === 'fail' && debugMode.value && store.state.isRunning;

    items.push({
      type: 'log-entry',
      key: 'entry-' + entry.stepIndex,
      logEntry: entry,
      awaitingAction: isAwaitingAction,
    });

    // Append the step's attributed network entries in `initiatedAt` order,
    // right after their originating step (Req 5.1). A step with zero captured
    // requests produces no entries (Req 5.9). Keyed as
    // `net-<stepIndex>-<requestId>`, preserving the `data-key` autoscroll
    // pattern used for steps.
    const group = store.state.networkRequests[String(entry.stepIndex)] || [];
    for (const req of [...group].sort((a, b) => a.initiatedAt - b.initiatedAt)) {
      items.push({
        type: 'network-entry',
        key: 'net-' + entry.stepIndex + '-' + req.requestId,
        network: req,
      });
    }
  }

  return items;
});

/**
 * Compute the aggregate status of a task header based on its child steps.
 */
function computeTaskHeaderStatus(pathKey: string): TaskHeaderStatus {
  const children = logEntries.value.filter((entry) => {
    if (!entry.taskPath || entry.taskPath.length === 0) return false;
    let entryPathKey = '';
    for (let i = 0; i < entry.taskPath.length; i++) {
      entryPathKey += (i > 0 ? '>' : '') + entry.taskPath[i].name;
    }
    return entryPathKey === pathKey || entryPathKey.startsWith(pathKey + '>');
  });

  if (children.length === 0) return 'queued';

  let allDone = true;
  let hasFailOrSkip = false;
  let anyStarted = false;

  for (const child of children) {
    const isCompleted = child.status === 'pass' || child.status === 'fail' || child.status === 'skipped';
    if (!isCompleted) {
      allDone = false;
    }
    if (child.status === 'fail' || child.status === 'skipped') {
      hasFailOrSkip = true;
    }
    if (child.status !== 'queued') {
      anyStarted = true;
    }
  }

  if (allDone) {
    return hasFailOrSkip ? 'warning' : 'pass';
  }

  if (anyStarted) {
    return 'in-progress';
  }

  return 'queued';
}

// --- Per-step network count ---

/**
 * Number of captured network requests attributed to a step, used to bind the
 * per-step count badge (Req 5.5). Returns undefined when no group exists yet so
 * the loading placeholder can distinguish "not determined" from "zero".
 */
function networkCountFor(stepIndex: number): number | undefined {
  const group = store.state.networkRequests[String(stepIndex)];
  return group ? group.length : undefined;
}

/**
 * True while capture is still pending for the CURRENT (in-progress) step and
 * its count has not yet been determined; drives the minimal loading indicator
 * (Req 5.11). Scoped to the in-progress step only so the indicator never
 * appears under multiple steps at once. Once a count is known (including zero),
 * the indicator is suppressed.
 */
function networkPendingFor(stepIndex: number, status: StepStatus): boolean {
  return (
    status === 'in-progress' &&
    store.state.networkCapturePending &&
    networkCountFor(stepIndex) === undefined
  );
}

// --- Auto-scroll to last updated step ---

watch(
  () => logEntries.value.map((e) => e.status),
  () => {
    nextTick(() => {
      if (!containerRef.value) return;
      const container = containerRef.value;
      const entries = logEntries.value;

      // Determine the currently-executing step to track: the last
      // 'in-progress' entry if one exists, otherwise the most recently
      // updated non-'queued' entry, otherwise NONE (-1 when all 'queued').
      let currentIndex = -1;
      for (let i = entries.length - 1; i >= 0; i--) {
        if (entries[i].status === 'in-progress') {
          currentIndex = i;
          break;
        }
      }
      if (currentIndex === -1) {
        for (let i = entries.length - 1; i >= 0; i--) {
          if (entries[i].status !== 'queued') {
            currentIndex = i;
            break;
          }
        }
      }
      // No target: all entries are 'queued' — perform no scroll.
      if (currentIndex === -1) return;

      // Find the corresponding DOM element via existing keying.
      const entryKey = 'entry-' + entries[currentIndex].stepIndex;
      const el = container.querySelector<HTMLElement>('[data-key="' + entryKey + '"]');
      if (!el) return;

      // Bring the target row fully into the visible area using explicit
      // container scrollTop math. No-op when the row is already fully visible.
      const rowTop = el.offsetTop;
      const rowBottom = rowTop + el.offsetHeight;
      const viewTop = container.scrollTop;
      const viewBottom = viewTop + container.clientHeight;

      let top: number | null = null;
      if (rowTop < viewTop) {
        // Row is above the top edge — align its top with the container top.
        top = rowTop;
      } else if (rowBottom > viewBottom) {
        // Row is below the bottom edge — align its bottom with the container bottom.
        top = rowBottom - container.clientHeight;
      }

      if (top !== null) {
        container.scrollTo({ top, behavior: 'smooth' });
      }
    });
  },
  { deep: true },
);

// --- Actions ---

function onRetry(stepIndex: number) {
  retry(stepIndex);
}

function onSkip(stepIndex: number) {
  skip(stepIndex);
}
</script>

<template>
  <div ref="containerRef" class="log-container">
    <!-- Run parameters: a distinct pre-run summary panel (not a step row) that
         shows the parameter values the automation was launched with. -->
    <section v-if="paramBannerItems.length > 0" class="param-summary">
      <div class="param-summary-title">Run parameters</div>
      <dl class="param-summary-list">
        <template v-for="item in paramBannerItems" :key="item.name">
          <dt class="param-summary-key">{{ item.name }}</dt>
          <dd class="param-summary-val">{{ item.value }}</dd>
        </template>
      </dl>
    </section>

    <!-- Render items (task headers + log entries) -->
    <template v-for="item in renderItems" :key="item.key">
      <TaskHeader
        v-if="item.type === 'task-header' && item.taskHeader"
        :name="item.taskHeader.name"
        :label="item.taskHeader.label"
        :depth="item.taskHeader.depth"
        :params="item.taskHeader.params"
        :status="item.taskHeader.status"
        :is-component="item.taskHeader.isComponent"
        :component-name="item.taskHeader.componentName"
        :collapsed="item.taskHeader.collapsed"
        @toggle="toggleGroup(item.taskHeader.pathKey)"
      />
      <template v-else-if="item.type === 'log-entry' && item.logEntry">
        <LogEntryComponent
          :data-key="item.key"
          :entry="item.logEntry"
          :page-elements="pageElements"
          :debug-mode="debugMode"
          :awaiting-action="item.awaitingAction"
          @retry="onRetry"
          @skip="onSkip"
        />
        <!-- Per-step network summary: a count badge bound to the attributed
             group length (Req 5.5), or a loading placeholder while capture is
             still pending and the count is not yet determined (Req 5.11). A
             step with zero requests shows neither (Req 5.9). -->
        <div
          v-if="networkPendingFor(item.logEntry.stepIndex, item.logEntry.status)"
          class="net-step-loading"
          aria-label="Capturing network"
          title="Capturing network"
        >
          <span class="net-loading-dot" />
        </div>
        <div
          v-else-if="(networkCountFor(item.logEntry.stepIndex) || 0) > 0"
          class="net-step-summary"
        >
          <font-awesome-icon class="net-glyph" :icon="['fas', 'arrow-right-arrow-left']" />
          <span class="net-step-count">{{ networkCountFor(item.logEntry.stepIndex) }}</span>
        </div>
      </template>
      <NetworkLogEntry
        v-else-if="item.type === 'network-entry' && item.network"
        :data-key="item.key"
        :request="item.network"
      />
    </template>
  </div>
</template>
