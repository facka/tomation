<script setup lang="ts">
import { computed } from 'vue';
import type { LogEntry } from '@/types/store';
import type { PageElement } from '@/types/spec';
import { resolveTargetLabel, getAssertSuffix, describeCondition } from '@/logic/stepLabel';

const props = defineProps<{
  entry: LogEntry;
  pageElements?: Record<string, PageElement>;
  debugMode?: boolean;
  awaitingAction?: boolean;
}>();

const emit = defineEmits<{
  (e: 'retry', stepIndex: number): void;
  (e: 'skip', stepIndex: number): void;
}>();

// --- Computed ---

const statusClass = computed(() => {
  switch (props.entry.status) {
    case 'queued': return 'queued';
    case 'in-progress': return 'in-progress';
    case 'pass': return 'pass';
    case 'fail': return 'fail';
    case 'skipped': return 'skipped';
    default: return '';
  }
});

const indentStyle = computed(() => {
  const depth = props.entry.taskDepth || 0;
  if (depth > 0) {
    return { paddingLeft: (12 + depth * 12) + 'px' };
  }
  return undefined;
});

const actionLabel = computed(() => {
  const action = props.entry.action;
  if (!action) return '';
  return action.charAt(0).toUpperCase() + action.slice(1);
});

const targetLabel = computed(() => {
  if (!props.entry.target) return '';
  return resolveTargetLabel(props.entry.target, props.pageElements);
});

const targetTooltip = computed(() => {
  const target = props.entry.target;
  if (!target || !props.pageElements || !props.pageElements[target]) return target || '';
  const el = props.pageElements[target];
  const lines: string[] = [];
  lines.push('Key: ' + target);
  lines.push('Tag: ' + (el.tag || '*'));
  if (el.xpath) {
    lines.push('XPath: ' + el.xpath);
  } else if (el.where && Object.keys(el.where).length > 0) {
    const matchers = Object.keys(el.where)
      .map((k) => k + '=' + JSON.stringify(el.where![k]))
      .join(', ');
    lines.push('Where: ' + matchers);
  }
  if (el.childOf) {
    lines.push('Child of: ' + el.childOf);
  }
  return lines.join('\n');
});

const valueDisplay = computed(() => {
  const entry = props.entry;
  if (entry.action === 'typePassword') return '****';
  if (entry.action === 'navigate' && !entry.value) return entry.target || '';
  if (entry.action === 'wait' && !entry.value) return '';
  if (entry.action === 'manual' && !entry.value) return '';
  if (entry.value) {
    let displayValue = entry.value;
    // Replace {{ctx.key}} placeholders with resolved values
    if (entry.resolvedContext && entry.resolvedContext.length > 0) {
      for (const { key, value } of entry.resolvedContext) {
        const placeholder = '{{ctx.' + key + '}}';
        const replacement = value != null ? String(value) : '';
        displayValue = displayValue.split(placeholder).join(replacement);
      }
    }
    return '"' + displayValue + '"';
  }
  return '';
});

const resolvedContextKeys = computed(() => {
  const ctx = props.entry.resolvedContext;
  if (!ctx || ctx.length === 0) return null;
  return 'from ' + ctx.map(({ key }) => 'ctx.' + key).join(', ');
});

const preposition = computed(() => {
  const action = props.entry.action?.toLowerCase() || '';
  if (action === 'navigate') return null;
  if (action === 'wait') return null;
  if (action === 'manual') return null;
  if (action === 'asserthastext' || action === 'assertcontainstext') return 'in';
  if (action === 'assertexists' || action === 'assertnotexists') return null;
  if (action === 'assertgone') return null;
  if (action === 'savetext' || action === 'savevalue' || action === 'saveattribute') return 'from';
  if (props.entry.target) return 'in';
  return null;
});

const hasTargetPreposition = computed(() => {
  const action = props.entry.action?.toLowerCase() || '';
  return (action === 'type' || action === 'typepassword' || action === 'select') && !!props.entry.target;
});

const isAssert = computed(() => {
  const action = props.entry.action?.toLowerCase() || '';
  return getAssertSuffix(action) !== null;
});

const isCondition = computed(() => {
  const action = props.entry.action?.toLowerCase() || '';
  return action === 'condition' || action === 'ctxif';
});

const conditionDescription = computed(() => describeCondition(props.entry.condition));

const conditionTaken = computed(() => props.entry.taken === true);

const assertSuffix = computed(() => {
  const action = props.entry.action?.toLowerCase() || '';
  return getAssertSuffix(action) || '';
});

const showRetrySkip = computed(() => {
  return props.awaitingAction && props.debugMode && props.entry.status === 'fail';
});

const attemptBadgeClass = computed(() => {
  if (!props.entry.retryAttempt) return '';
  return props.entry.status === 'pass' ? 'pass' : 'fail';
});
</script>

<template>
  <div class="log-entry" :class="statusClass" :style="indentStyle">
    <!-- Conditional steps: "If [condition] → taken / not taken" -->
    <template v-if="isCondition">
      <span class="step-action">If</span>
      <span class="condition-expr">{{ conditionDescription }}</span>
      <span class="condition-outcome" :class="conditionTaken ? 'taken' : 'not-taken'">
        <template v-if="conditionTaken">
          <font-awesome-icon :icon="['fas', 'check']" /> condition met
        </template>
        <template v-else>
          <font-awesome-icon :icon="['fas', 'ban']" /> skipped
        </template>
      </span>
    </template>

    <!-- Assert steps: "Assert that [element] has text "value"" -->
    <template v-else-if="isAssert">
      <span class="step-action">Assert that</span>

      <span
        v-if="entry.target"
        class="element-badge"
        :title="targetTooltip"
      >{{ targetLabel }}</span>

      <span class="step-preposition">{{ assertSuffix }}</span>

      <span v-if="valueDisplay" class="step-value">{{ valueDisplay }}</span>
    </template>

    <!-- Regular steps -->
    <template v-else>
      <span class="step-action">{{ actionLabel }}</span>

      <span
        v-if="valueDisplay && hasTargetPreposition"
        class="step-value"
      >{{ valueDisplay }}</span>

      <span
        v-if="preposition"
        class="step-preposition"
      >{{ preposition }}</span>

      <span
        v-if="entry.target && entry.action !== 'navigate'"
        class="element-badge"
        :title="targetTooltip"
      >{{ targetLabel }}</span>

      <span
        v-if="valueDisplay && !hasTargetPreposition"
        class="step-value"
      >{{ valueDisplay }}</span>
    </template>

    <span v-if="resolvedContextKeys" class="ctx-source">{{ resolvedContextKeys }}</span>

    <!-- Status indicators (condition rows render their own outcome badge) -->
    <template v-if="!isCondition && entry.status === 'in-progress'">
      <span class="spinner"><font-awesome-icon :icon="['fas', 'spinner']" spin /></span>
    </template>

    <template v-if="!isCondition && entry.status === 'pass'">
      <span> <font-awesome-icon :icon="['fas', 'check']" /></span>
      <span v-if="entry.retryAttempt" class="attempt-badge" :class="attemptBadgeClass">
        Attempt {{ entry.retryAttempt }}
      </span>
    </template>

    <template v-if="!isCondition && entry.status === 'fail'">
      <span> <font-awesome-icon :icon="['fas', 'xmark']" /></span>
      <span v-if="entry.retryAttempt" class="attempt-badge" :class="attemptBadgeClass">
        Attempt {{ entry.retryAttempt }}
      </span>
      <span v-if="entry.error" class="error-text"> {{ entry.error }}</span>
    </template>

    <template v-if="entry.status === 'skipped'">
      <span class="skipped-badge"> <font-awesome-icon :icon="['fas', 'ban']" /> Skipped</span>
    </template>
  </div>

  <!-- Retry / Skip action buttons (shown inline after the failed entry in debug mode) -->
  <div v-if="showRetrySkip" class="log-entry action-buttons">
    <button class="btn btn-primary" @click="emit('retry', entry.stepIndex)">Try Again</button>
    <button class="btn" @click="emit('skip', entry.stepIndex)">Skip</button>
  </div>
</template>

<style scoped>
.error-text {
  color: var(--error);
  font-size: 11px;
}

.ctx-source {
  color: var(--text-muted, #888);
  font-size: 10px;
  font-style: italic;
  margin-left: 4px;
}

.condition-expr {
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  color: var(--text-secondary, #aaa);
  margin: 0 4px;
}

.condition-outcome {
  font-size: 10px;
  margin-left: 4px;
}

.condition-outcome.taken {
  color: var(--success, #22c55e);
}

.condition-outcome.not-taken {
  color: var(--text-muted, #888);
}
</style>
