<script setup lang="ts">
import { computed, ref } from 'vue';
import type { LogEntry } from '@/types/store';
import type { PageElement } from '@/types/spec';
import { resolveTargetLabel, getAssertSuffix, describeCondition } from '@/logic/stepLabel';
import { buildFinderSnippet } from '@/logic/finderSnippet';

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

// --- Find-trace disclosure ("Why did this fail?") ---

// Render the disclosure only for failed entries that carry a trace (Req 10.1, 10.10).
const hasFindTrace = computed(() => {
  return props.entry.status === 'fail' && !!props.entry.findTrace;
});

// Local, initially-collapsed toggle state (Req 10.1).
const traceExpanded = ref(false);

function toggleTrace() {
  traceExpanded.value = !traceExpanded.value;
}

const trace = computed(() => props.entry.findTrace ?? null);

// One-line diagnosis derived from the trace (Req 10.3). All fields read defensively.
const diagnosis = computed(() => {
  const t = trace.value;
  if (!t) return '';

  // Parent could not be located.
  if (t.parent && t.parent.resolved === false) {
    return 'The parent element could not be located.';
  }

  // XPath strategy.
  if (t.xpath) {
    const n = t.xpath.matchedNodeCount ?? 0;
    return 'XPath matched ' + n + ' node(s).';
  }

  const tag = t.tag ?? 'element';

  switch (t.absence) {
    case 'absent-full-window':
      return 'No <' + tag + '> element was present during the 5s wait window.';
    case 'present-unmatched': {
      const n = t.candidateCount ?? t.finalFrameCandidateCount ?? 0;
      return 'Found ' + n + ' <' + tag + '> candidate(s) but none matched the conditions.';
    }
    case 'appeared-after-timeout':
      return 'A matching <' + tag + '> appeared only after the 5s wait window.';
    default:
      // Fall back to the preserved human-readable error string.
      return t.error ?? '';
  }
});

// Generated Finder_Snippet from the failed step's descriptor (Req 10.4-10.7).
const finderSnippet = computed(() => {
  const target = props.entry.target ?? '';
  const descriptor = props.pageElements?.[target];
  if (!descriptor) return '';
  const parent = descriptor.childOf ? props.pageElements?.[descriptor.childOf] : null;
  return buildFinderSnippet(descriptor, parent);
});

// Copy-to-clipboard state (Req 10.8). Briefly toggles a "Copied!" label.
const copyState = ref(false);

async function copySnippet() {
  try {
    await navigator.clipboard.writeText(finderSnippet.value);
    copyState.value = true;
    setTimeout(() => { copyState.value = false; }, 1500);
  } catch {
    // Clipboard unavailable — silently ignore.
  }
}
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

  <!-- "Why did this fail?" find-trace disclosure (Req 10). Rendered beneath the
       error line only for failed entries that carry a trace. Initially collapsed. -->
  <div v-if="hasFindTrace" class="find-trace">
    <button
      type="button"
      class="find-trace-toggle"
      :aria-expanded="traceExpanded"
      @click="toggleTrace"
    >
      <font-awesome-icon :icon="['fas', traceExpanded ? 'chevron-down' : 'chevron-right']" />
      <span>Why did this fail?</span>
    </button>

    <div v-if="traceExpanded" class="find-trace-body">
      <!-- One-line diagnosis (Req 10.3) -->
      <div v-if="diagnosis" class="ft-diagnosis">{{ diagnosis }}</div>

      <!-- Copy-pasteable DevTools finder snippet (Req 10.4-10.8) -->
      <div v-if="finderSnippet" class="ft-snippet">
        <div class="ft-snippet-head">
          <span class="ft-snippet-label">Run this in DevTools to reproduce:</span>
          <button type="button" class="copy-btn" @click="copySnippet">
            <font-awesome-icon :icon="['fas', 'copy']" />
            <span>{{ copyState ? 'Copied!' : 'Copy' }}</span>
          </button>
        </div>
        <pre class="ft-snippet-code"><code>{{ finderSnippet }}</code></pre>
      </div>
    </div>
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

/* --- "Why did this fail?" find-trace disclosure --- */
.find-trace {
  padding: 2px 0 4px 24px;
}

.find-trace-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: none;
  border: none;
  padding: 2px 0;
  cursor: pointer;
  color: var(--text-muted, #888);
  font-size: 10px;
  font-family: inherit;
}

.find-trace-toggle:hover {
  color: var(--text-secondary, #aaa);
}

.find-trace-body {
  margin-top: 2px;
  padding: 4px 8px;
  border-left: 2px solid var(--error, #ef4444);
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.ft-diagnosis {
  font-size: 11px;
  color: var(--text-secondary, #aaa);
}

.ft-snippet {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.ft-snippet-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.ft-snippet-label {
  font-size: 10px;
  color: var(--text-muted, #888);
}

.copy-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: none;
  border: 1px solid var(--border, #444);
  border-radius: 3px;
  padding: 1px 6px;
  cursor: pointer;
  color: var(--text-secondary, #aaa);
  font-size: 10px;
  font-family: inherit;
}

.copy-btn:hover {
  color: var(--text-primary, #ddd);
  border-color: var(--text-muted, #888);
}

.ft-snippet-code {
  margin: 0;
  padding: 6px 8px;
  background: var(--bg-secondary, rgba(0, 0, 0, 0.25));
  border: 1px solid var(--border, #444);
  border-radius: 4px;
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  line-height: 1.4;
  color: var(--text-secondary, #aaa);
  white-space: pre;
  overflow-x: auto;
}
</style>
