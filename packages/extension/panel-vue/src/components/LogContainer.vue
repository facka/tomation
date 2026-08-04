<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import { useStore } from '@/store';
import { useRunExecution } from '@/composables/useRunExecution';
import type { TaskHeaderStatus } from '@/types/store';
import LogEntryComponent from './LogEntry.vue';
import TaskHeader from './TaskHeader.vue';

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
}

interface RenderItem {
  type: 'task-header' | 'log-entry';
  key: string;
  taskHeader?: TaskHeaderInfo;
  logEntry?: LogEntry;
  awaitingAction?: boolean;
}

const renderItems = computed(() => {
  const items: RenderItem[] = [];
  const renderedHeaders = new Set<string>();

  for (const entry of logEntries.value) {
    const taskPath = entry.taskPath || [];

    // Insert task headers for new path levels
    for (let d = 0; d < taskPath.length; d++) {
      let pathKey = '';
      for (let pk = 0; pk <= d; pk++) {
        pathKey += (pk > 0 ? '>' : '') + taskPath[pk].name;
      }

      if (!renderedHeaders.has(pathKey)) {
        renderedHeaders.add(pathKey);
        const headerStatus = computeTaskHeaderStatus(pathKey);
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
          },
        });
      }
    }

    // Determine if this entry is awaiting action (fail + debug mode)
    const isAwaitingAction = entry.status === 'fail' && debugMode.value && store.state.isRunning;

    items.push({
      type: 'log-entry',
      key: 'entry-' + entry.stepIndex,
      logEntry: entry,
      awaitingAction: isAwaitingAction,
    });
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

// --- Auto-scroll ---

watch(
  () => logEntries.value.map((e) => e.status),
  () => {
    nextTick(() => {
      if (containerRef.value) {
        containerRef.value.scrollTop = containerRef.value.scrollHeight;
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
    <!-- Parameter banner -->
    <div v-if="paramBannerItems.length > 0" class="log-entry param-banner">
      <span class="step-action">Params</span>
      <span v-for="(item, idx) in paramBannerItems" :key="item.name">
        <span class="param-name">{{ item.name }}</span>:
        <span class="param-val">"{{ item.value }}"</span>
        <span v-if="idx < paramBannerItems.length - 1">, </span>
      </span>
    </div>

    <!-- Render items (task headers + log entries) -->
    <template v-for="item in renderItems" :key="item.key">
      <TaskHeader
        v-if="item.type === 'task-header' && item.taskHeader"
        :name="item.taskHeader.name"
        :label="item.taskHeader.label"
        :depth="item.taskHeader.depth"
        :params="item.taskHeader.params"
        :status="item.taskHeader.status"
      />
      <LogEntryComponent
        v-else-if="item.type === 'log-entry' && item.logEntry"
        :entry="item.logEntry"
        :page-elements="pageElements"
        :debug-mode="debugMode"
        :awaiting-action="item.awaitingAction"
        @retry="onRetry"
        @skip="onSkip"
      />
    </template>
  </div>
</template>
