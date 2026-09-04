<script setup lang="ts">
import { computed, ref } from 'vue';
import type { LogEntry } from '@/types/store';
import type { PageElement } from '@/types/spec';
import type { WhereBreakdownEntry } from '@/types/findTrace';
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

// --- Find-trace disclosure ("Why did this fail?") ---

const PASSED_MATCHER_CAP = 50;

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

const scopeLabel = computed(() => {
  const scope = trace.value?.scope;
  if (scope === 'parent-scoped') return 'Parent-scoped';
  if (scope === 'whole-document') return 'Whole document';
  return scope ?? null;
});

// The runtime may expose a precomputed `passedMatchers` array; otherwise derive
// passed matchers from the whereBreakdown (entries with passed === true).
const passedMatchers = computed<WhereBreakdownEntry[]>(() => {
  const t = trace.value as (typeof trace.value & { passedMatchers?: unknown }) | null;
  const explicit = t?.passedMatchers;
  if (Array.isArray(explicit)) return explicit as WhereBreakdownEntry[];
  const breakdown = trace.value?.whereBreakdown;
  if (!Array.isArray(breakdown)) return [];
  return breakdown.filter((m) => m?.passed === true);
});

// Cap helper (Task 12.2 / Req 10.5): first 50 + count of the rest.
const cappedPassedMatchers = computed(() => {
  const all = passedMatchers.value ?? [];
  return {
    shown: all.slice(0, PASSED_MATCHER_CAP),
    remaining: Math.max(0, all.length - PASSED_MATCHER_CAP),
  };
});

// The single failing matcher. Prefer an explicit `failedMatcher` field if the
// runtime provides one; otherwise the first whereBreakdown entry with passed === false.
// May be null when the element appeared after the timeout (absence === 'appeared-after-timeout').
const failingMatcher = computed<WhereBreakdownEntry | null>(() => {
  const t = trace.value as (typeof trace.value & { failedMatcher?: unknown }) | null;
  const explicit = t?.failedMatcher;
  if (explicit && typeof explicit === 'object') return explicit as WhereBreakdownEntry;
  const breakdown = trace.value?.whereBreakdown;
  if (!Array.isArray(breakdown)) return null;
  return breakdown.find((m) => m?.passed === false) ?? null;
});

function isTextMatcher(key: string | undefined): boolean {
  return key === 'textIs' || key === 'textContains';
}

// Render whitespace visibly for text-matcher actual values (Req 10.4 / Req 2.5):
// replace spaces with a middot and tabs/newlines with visible markers.
function visibleWhitespace(value: string): string {
  return value
    .replace(/ /g, '\u00B7')
    .replace(/\t/g, '\u2192')
    .replace(/\n/g, '\u21B5');
}

const absenceLabel = computed(() => {
  switch (trace.value?.absence) {
    case 'absent-full-window':
      return 'Element was absent for the full wait window';
    case 'present-unmatched':
      return 'Candidates were present but none matched the conditions';
    case 'appeared-after-timeout':
      return 'A matching element appeared after the wait window elapsed';
    default:
      return null;
  }
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
      <!-- Scope + candidate count (Req 10.3) -->
      <div v-if="scopeLabel || trace?.candidateCount != null" class="ft-row">
        <span class="ft-label">Search scope:</span>
        <span class="ft-value">{{ scopeLabel ?? 'unknown' }}</span>
        <span v-if="trace?.candidateCount != null" class="ft-value">
          · {{ trace.candidateCount }} candidate{{ trace.candidateCount === 1 ? '' : 's' }}
        </span>
      </div>

      <!-- Passed Where_Matchers (first 50 + remaining count, Req 10.4, 10.5) -->
      <div v-if="cappedPassedMatchers.shown.length > 0" class="ft-row">
        <span class="ft-label">Passed conditions:</span>
        <span
          v-for="m in cappedPassedMatchers.shown"
          :key="'passed-' + m.key"
          class="ft-matcher pass"
        >{{ m.key }}</span>
        <span v-if="cappedPassedMatchers.remaining > 0" class="ft-more">
          and {{ cappedPassedMatchers.remaining }} more
        </span>
      </div>

      <!-- Failing Where_Matcher with expected vs actual (Req 10.4) -->
      <div v-if="failingMatcher" class="ft-row ft-failing">
        <span class="ft-label">Failing condition:</span>
        <span class="ft-matcher fail">{{ failingMatcher.key }}</span>
        <span class="ft-expected">expected {{ failingMatcher.expected }}</span>
        <template v-if="failingMatcher.actualUnavailable">
          <span class="ft-actual-label">actual</span>
          <span class="ft-actual unavailable">(unavailable)</span>
        </template>
        <template v-else>
          <span class="ft-actual-label">actual</span>
          <span
            v-if="isTextMatcher(failingMatcher.key)"
            class="ft-actual ft-actual-text"
          >{{ failingMatcher.actual != null ? visibleWhitespace(failingMatcher.actual) : '(none)' }}</span>
          <span v-else class="ft-actual">{{ failingMatcher.actual ?? '(none)' }}</span>
        </template>
      </div>

      <!-- Absence classification (Req 10.8) -->
      <div v-if="absenceLabel" class="ft-row">
        <span class="ft-label">Availability:</span>
        <span class="ft-value">{{ absenceLabel }}</span>
        <span
          v-if="trace?.absence === 'present-unmatched' && trace?.finalFrameCandidateCount != null"
          class="ft-value"
        >
          ({{ trace.finalFrameCandidateCount }} in final frame)
        </span>
      </div>

      <!-- Parent (childOf) resolution outcome (Req 10.7) -->
      <div v-if="trace?.parent" class="ft-row">
        <span class="ft-label">Parent:</span>
        <template v-if="trace.parent.resolved">
          <span class="ft-value">resolved</span>
          <span v-if="trace.parent.scopedToParent" class="ft-value">· child search scoped to parent subtree</span>
          <span v-if="trace.parent.identifier" class="ft-value ft-mono">· {{ trace.parent.identifier }}</span>
          <span v-if="trace.parent.matchCount != null" class="ft-value">· {{ trace.parent.matchCount }} match{{ trace.parent.matchCount === 1 ? '' : 'es' }}</span>
        </template>
        <template v-else>
          <span class="ft-value ft-fail-text">not resolved</span>
          <span v-if="trace.parent.descriptorId" class="ft-value ft-mono">· {{ trace.parent.descriptorId }}</span>
        </template>
      </div>

      <!-- closestLabel outcome (Req 10.9) -->
      <div v-if="trace?.closestLabel" class="ft-row">
        <span class="ft-label">closestLabel:</span>
        <span class="ft-value">&lt;{{ trace.closestLabel.labelTag }}&gt;</span>
        <span class="ft-value">
          {{ trace.closestLabel.labelTextAbsent ? '(absent)' : (trace.closestLabel.labelText ?? '(absent)') }}
        </span>
        <span class="ft-value">· {{ trace.closestLabel.bounded ? 'bounded to parent' : 'unbounded' }}</span>
        <span
          v-for="s in (trace.closestLabel.strategies ?? [])"
          :key="'cl-' + s.name"
          class="ft-matcher"
          :class="s.outcome === 'matched' ? 'pass' : 'fail'"
        >{{ s.name }}: {{ s.outcome }}</span>
      </div>

      <!-- navigate outcome (Req 10.9) -->
      <div v-if="trace?.navigate" class="ft-row">
        <span class="ft-label">Navigate:</span>
        <span class="ft-value">anchor {{ trace.navigate.anchorResolved ? 'resolved' : 'not resolved' }}</span>
        <span v-if="trace.navigate.failedHopType != null" class="ft-value ft-fail-text">
          · failed hop {{ trace.navigate.failedHopType }} (index {{ trace.navigate.failedHopIndex }})
        </span>
        <span v-if="trace.navigate.hopCount != null" class="ft-value">· {{ trace.navigate.hopCount }} hop{{ trace.navigate.hopCount === 1 ? '' : 's' }}</span>
      </div>

      <!-- xpath outcome (Req 10.9) -->
      <div v-if="trace?.xpath" class="ft-row">
        <span class="ft-label">XPath:</span>
        <span class="ft-value ft-mono">{{ trace.xpath.expression }}</span>
        <span class="ft-value">· {{ trace.xpath.outcome }}</span>
        <span v-if="trace.xpath.matchedNodeCount != null" class="ft-value">· {{ trace.xpath.matchedNodeCount }} node{{ trace.xpath.matchedNodeCount === 1 ? '' : 's' }}</span>
        <span v-if="trace.xpath.elapsedMs != null" class="ft-value">· {{ trace.xpath.elapsedMs }}ms</span>
        <span v-if="trace.xpath.configuredWaitMs != null" class="ft-value">/ {{ trace.xpath.configuredWaitMs }}ms wait</span>
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

.ft-row {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px;
  font-size: 10px;
  color: var(--text-secondary, #aaa);
}

.ft-label {
  color: var(--text-muted, #888);
  font-weight: 600;
}

.ft-value {
  color: var(--text-secondary, #aaa);
}

.ft-mono {
  font-family: var(--font-mono, monospace);
}

.ft-fail-text {
  color: var(--error, #ef4444);
}

.ft-matcher {
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  padding: 0 4px;
  border-radius: 3px;
}

.ft-matcher.pass {
  color: var(--success, #22c55e);
  border: 1px solid var(--success, #22c55e);
}

.ft-matcher.fail {
  color: var(--error, #ef4444);
  border: 1px solid var(--error, #ef4444);
}

.ft-more {
  color: var(--text-muted, #888);
  font-style: italic;
}

.ft-expected {
  color: var(--text-secondary, #aaa);
}

.ft-actual-label {
  color: var(--text-muted, #888);
}

.ft-actual {
  color: var(--error, #ef4444);
}

.ft-actual.unavailable {
  font-style: italic;
  color: var(--text-muted, #888);
}

/* Text-matcher actuals: render whitespace visibly with a bordered mono span */
.ft-actual-text {
  font-family: var(--font-mono, monospace);
  white-space: pre;
  padding: 0 4px;
  border: 1px solid var(--border, #444);
  border-radius: 3px;
}
</style>
