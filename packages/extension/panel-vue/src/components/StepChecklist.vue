<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import type { Step, PageElement } from '@/types/spec';
import { resolveTargetLabel, getAssertSuffix, describeCondition } from '@/logic/stepLabel';

const props = defineProps<{
  steps: Step[];
  tasks?: Record<string, { steps: Step[]; label?: string }>;
  pageElements?: Record<string, PageElement>;
}>();

const emit = defineEmits<{
  (e: 'update:checkedSteps', value: number[]): void;
}>();

// --- Types ---

interface ChecklistItem {
  stepIndex: number; // top-level step index (sent to background)
  depth: number;
  isTask: boolean;
  isCondition?: boolean;
  step: Step;
  taskLabel?: string;
  conditionLabel?: string;
  childIndex?: number; // index within task sub-steps
}

// --- Flatten steps into a renderable list ---

const flatItems = computed(() => {
  const items: ChecklistItem[] = [];
  const tasks = props.tasks || {};

  function flattenSteps(stepsArr: Step[], parentIndex: number | null, depth: number) {
    for (let si = 0; si < stepsArr.length; si++) {
      const step = stepsArr[si];
      const topIndex = parentIndex !== null ? parentIndex : si;

      if (step.action === 'task' && step.name && tasks[step.name]) {
        // Task header
        const taskDef = tasks[step.name];
        const taskLabel = taskDef.label
          ? taskDef.label
          : step.name.replace(/__/g, '.').replace(/\//g, ' > ');
        items.push({
          stepIndex: topIndex,
          depth,
          isTask: true,
          step,
          taskLabel,
        });
        // Recurse into child steps
        const childSteps = taskDef.steps || [];
        flattenSteps(childSteps, topIndex, depth + 1);
      } else if (step.action === 'if' || step.action === 'condition' || step.action === 'ctxIf') {
        // Conditional header — show the condition, then nest its body
        items.push({
          stepIndex: topIndex,
          depth,
          isTask: false,
          isCondition: true,
          step,
          conditionLabel: describeCondition(step.condition),
          childIndex: parentIndex !== null ? si : undefined,
        });
        // Recurse into the conditional body (nested under the condition)
        const thenSteps = step.then || [];
        flattenSteps(thenSteps, topIndex, depth + 1);
      } else {
        items.push({
          stepIndex: topIndex,
          depth,
          isTask: false,
          step,
          childIndex: parentIndex !== null ? si : undefined,
        });
      }
    }
  }

  flattenSteps(props.steps, null, 0);
  return items;
});

// --- Checkbox state ---

const checkedState = ref<boolean[]>([]);

// Initialize all checked when items change
watch(flatItems, (items) => {
  checkedState.value = items.map(() => true);
  emitCheckedSteps();
}, { immediate: true });

function emitCheckedSteps() {
  // Collect unique top-level step indices that are checked
  const checked = new Set<number>();
  for (let i = 0; i < flatItems.value.length; i++) {
    if (checkedState.value[i]) {
      const item = flatItems.value[i];
      // Only include top-level items (depth 0, not child indices)
      if (item.depth === 0) {
        checked.add(item.stepIndex);
      }
    }
  }
  emit('update:checkedSteps', Array.from(checked));
}

function onCheckboxChange(index: number) {
  const item = flatItems.value[index];

  if (item.isTask) {
    // Toggle all children of this task
    const taskDepth = item.depth;
    const isChecked = checkedState.value[index];
    for (let i = index + 1; i < flatItems.value.length; i++) {
      if (flatItems.value[i].depth <= taskDepth) break;
      checkedState.value[i] = isChecked;
    }
  } else if (item.depth > 0) {
    // Child checkbox changed — sync parent task checkbox
    syncParentTask(index);
  }

  emitCheckedSteps();
}

function syncParentTask(childIndex: number) {
  const childDepth = flatItems.value[childIndex].depth;
  // Walk backwards to find the parent task
  for (let i = childIndex - 1; i >= 0; i--) {
    const candidate = flatItems.value[i];
    if (candidate.depth < childDepth && candidate.isTask) {
      // Check if any sibling is checked
      const parentDepth = candidate.depth;
      let anyChecked = false;
      for (let j = i + 1; j < flatItems.value.length; j++) {
        if (flatItems.value[j].depth <= parentDepth) break;
        if (checkedState.value[j]) {
          anyChecked = true;
          break;
        }
      }
      checkedState.value[i] = anyChecked;
      break;
    }
  }
}

// --- Label rendering helpers ---

function getActionLabel(step: Step): string {
  if (step.action === 'task' && step.name) {
    return 'Task';
  }
  return capitalize(step.action);
}

function getTargetLabel(step: Step): string {
  return resolveTargetLabel(step.target, props.pageElements);
}

function getElementTooltip(target: string): string {
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
}

function getValueDisplay(step: Step): string | null {
  if (step.action === 'typePassword') return '****';
  if (step.value) return '"' + step.value + '"';
  if (step.action === 'navigate' && step.url) return step.url;
  if (step.action === 'wait' && step.ms !== undefined) return step.ms + 'ms';
  if (step.action === 'manual' && step.description) return '"' + step.description + '"';
  return null;
}

/**
 * Returns the preposition to display between action/value and the target element.
 * e.g. "in" for click/type, "has text" for assertions, "to" for navigate.
 */
function getPreposition(step: Step): string | null {
  const action = step.action.toLowerCase();
  if (action === 'navigate') return null;
  if (action === 'wait') return null;
  if (action === 'manual') return null;
  if (action === 'asserthastext' || action === 'assertcontainstext') return 'in';
  if (action === 'assertexists' || action === 'assertnotexists') return null;
  if (action === 'assertgone') return null;
  if (action === 'savetext' || action === 'savevalue' || action === 'saveattribute') return 'from';
  // Default: actions with a target use "in"
  if (step.target) return 'in';
  return null;
}

/**
 * Whether the value should be displayed BEFORE the target (with preposition between).
 * e.g. Type "admin" in [input] → value before target
 * vs. Click in [button] → no value before target
 */
function hasTargetPreposition(step: Step): boolean {
  const action = step.action.toLowerCase();
  // Actions where value comes before the target
  return (action === 'type' || action === 'typepassword' || action === 'select') && !!step.target;
}

/**
 * Whether this step is an assert action with special sentence formatting.
 */
function isAssertStep(step: Step): boolean {
  return getAssertSuffix(step.action.toLowerCase()) !== null;
}

/**
 * Get the human-readable suffix for an assert step (e.g. "has text", "exists").
 */
function getAssertStepSuffix(step: Step): string {
  return getAssertSuffix(step.action.toLowerCase()) || '';
}

function getParamsDisplay(params: Record<string, unknown> | undefined): { type: 'inline' | 'badge'; text: string; tooltip?: string } | null {
  if (!params || typeof params !== 'object') return null;
  const keys = Object.keys(params);
  if (keys.length === 0) return null;

  const sensitiveKeys = /password|secret|token|key|auth/i;

  function maskValue(key: string, val: unknown): string {
    if (sensitiveKeys.test(key)) return '****';
    const str = String(val);
    if (typeof val === 'string' && str.length > 30) return str.slice(0, 27) + '...';
    return str;
  }

  if (keys.length <= 2) {
    const parts = keys.map((k) => k + ': "' + maskValue(k, params[k]) + '"');
    return { type: 'inline', text: '{ ' + parts.join(', ') + ' }' };
  }

  const tooltipParts = keys.map((k) => k + ': ' + maskValue(k, params[k]));
  return { type: 'badge', text: '(' + keys.length + ' params)', tooltip: tooltipParts.join('\n') };
}

function capitalize(str: string): string {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}
</script>

<template>
  <ul class="step-checklist">
    <li
      v-for="(item, index) in flatItems"
      :key="index"
      :style="item.depth > 0 ? { paddingLeft: (item.depth * 16 + 12) + 'px' } : undefined"
    >
      <input
        type="checkbox"
        :checked="checkedState[index]"
        @change="checkedState[index] = ($event.target as HTMLInputElement).checked; onCheckboxChange(index)"
      />
      <label>
        <!-- Task header -->
        <template v-if="item.isTask">
          <span class="step-action">Task</span>
          {{ item.taskLabel }}
          <template v-if="item.step.params">
            <span
              v-if="getParamsDisplay(item.step.params)?.type === 'inline'"
              class="step-params"
            >{{ getParamsDisplay(item.step.params)!.text }}</span>
            <span
              v-else-if="getParamsDisplay(item.step.params)?.type === 'badge'"
              class="step-params-badge"
              :title="getParamsDisplay(item.step.params)!.tooltip"
            >{{ getParamsDisplay(item.step.params)!.text }}</span>
          </template>
        </template>

        <!-- Conditional (if / When) header -->
        <template v-else-if="item.isCondition">
          <span class="step-action">If</span>
          <span class="condition-expr">{{ item.conditionLabel }}</span>
        </template>

        <!-- Assert step (sentence format) -->
        <template v-else-if="isAssertStep(item.step)">
          <span class="step-action">Assert that</span>
          <span
            v-if="item.step.target"
            class="element-badge"
            :title="getElementTooltip(item.step.target)"
          >{{ getTargetLabel(item.step) }}</span>
          <span class="step-preposition">{{ getAssertStepSuffix(item.step) }}</span>
          <span
            v-if="getValueDisplay(item.step)"
            class="step-value"
          >{{ getValueDisplay(item.step) }}</span>
        </template>

        <!-- Regular step -->
        <template v-else>
          <span class="step-action">{{ getActionLabel(item.step) }}</span>
          <span
            v-if="getValueDisplay(item.step) && hasTargetPreposition(item.step)"
            class="step-value"
          >{{ getValueDisplay(item.step) }}</span>
          <span
            v-if="item.step.target && getPreposition(item.step)"
            class="step-preposition"
          >{{ getPreposition(item.step) }}</span>
          <span
            v-if="item.step.target"
            class="element-badge"
            :title="getElementTooltip(item.step.target)"
          >{{ getTargetLabel(item.step) }}</span>
          <span
            v-if="getValueDisplay(item.step) && !hasTargetPreposition(item.step)"
            class="step-value"
          >{{ getValueDisplay(item.step) }}</span>
          <template v-if="item.step.params && !item.isTask">
            <span
              v-if="getParamsDisplay(item.step.params)?.type === 'inline'"
              class="step-params"
            >{{ getParamsDisplay(item.step.params)!.text }}</span>
            <span
              v-else-if="getParamsDisplay(item.step.params)?.type === 'badge'"
              class="step-params-badge"
              :title="getParamsDisplay(item.step.params)!.tooltip"
            >{{ getParamsDisplay(item.step.params)!.text }}</span>
          </template>
        </template>
      </label>
    </li>
  </ul>
</template>
