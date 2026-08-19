<script setup lang="ts">
import { ref, computed, watch } from 'vue';

const props = defineProps<{
  data: Record<string, string | number>;
  seeds?: Record<string, number | undefined>;
  readonly?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:seeds', seeds: Record<string, number | null>): void;
}>();

const collapsed = ref(false);
const selectedGroup = ref<string | null>(null);
const copiedField = ref<string | null>(null);
const copiedGroup = ref(false);

// Group keys by the prefix before the first dot
const groups = computed(() => {
  const map: Record<string, { key: string; shortKey: string; value: string | number }[]> = {};
  for (const fullKey of Object.keys(props.data)) {
    const dotIdx = fullKey.indexOf('.');
    const group = dotIdx !== -1 ? fullKey.slice(0, dotIdx) : fullKey;
    const shortKey = dotIdx !== -1 ? fullKey.slice(dotIdx + 1) : fullKey;
    if (!map[group]) map[group] = [];
    map[group].push({ key: fullKey, shortKey, value: props.data[fullKey] });
  }
  return map;
});

const groupNames = computed(() => Object.keys(groups.value));

// Auto-select first group when data changes
watch(() => props.data, () => {
  if (groupNames.value.length > 0) {
    if (!selectedGroup.value || !groupNames.value.includes(selectedGroup.value)) {
      selectedGroup.value = groupNames.value[0];
    }
  } else {
    selectedGroup.value = null;
  }
}, { immediate: true });

const selectedFields = computed(() => {
  if (!selectedGroup.value) return [];
  return groups.value[selectedGroup.value] || [];
});

const selectedGroupJson = computed(() => {
  if (!selectedGroup.value) return '{}';
  const obj: Record<string, string | number> = {};
  for (const field of selectedFields.value) {
    obj[field.shortKey] = field.value;
  }
  return JSON.stringify(obj, null, 2);
});

function getSeed(groupName: string): number | undefined {
  return props.seeds?.[groupName];
}

function isSeeded(groupName: string): boolean {
  return getSeed(groupName) !== undefined;
}

function toggle() {
  collapsed.value = !collapsed.value;
}

function selectGroup(name: string) {
  selectedGroup.value = name;
}

function copyValue(field: { key: string; value: string | number }) {
  navigator.clipboard.writeText(String(field.value)).then(() => {
    copiedField.value = field.key;
    setTimeout(() => { copiedField.value = null; }, 1200);
  });
}

function copyGroupJson() {
  navigator.clipboard.writeText(selectedGroupJson.value).then(() => {
    copiedGroup.value = true;
    setTimeout(() => { copiedGroup.value = false; }, 1200);
  });
}

function pinSeed() {
  if (!selectedGroup.value) return;
  const seed = Math.floor(Math.random() * 2147483647);
  const newSeeds: Record<string, number | null> = {};
  if (props.seeds) {
    for (const [k, v] of Object.entries(props.seeds)) {
      if (v !== undefined) newSeeds[k] = v;
    }
  }
  newSeeds[selectedGroup.value] = seed;
  emit('update:seeds', newSeeds);
}

function clearSeed() {
  if (!selectedGroup.value) return;
  const newSeeds: Record<string, number | null> = {};
  if (props.seeds) {
    for (const [k, v] of Object.entries(props.seeds)) {
      if (v !== undefined) newSeeds[k] = v;
    }
  }
  newSeeds[selectedGroup.value] = null;
  emit('update:seeds', newSeeds);
}
</script>

<template>
  <div class="test-data-panel">
    <div class="test-data-header" @click="toggle">
      <h3>
        <font-awesome-icon :icon="['fas', collapsed ? 'chevron-right' : 'chevron-down']" aria-hidden="true" />
        Test Data
      </h3>
      <span class="test-data-count">{{ groupNames.length }} template{{ groupNames.length !== 1 ? 's' : '' }}</span>
    </div>
    <div v-if="!collapsed" class="test-data-body">
      <div class="test-data-groups-row">
        <div class="test-data-groups">
          <button
            v-for="name in groupNames"
            :key="name"
            class="test-data-group-btn"
            :class="{ active: selectedGroup === name }"
            @click="selectGroup(name)"
          >
            <font-awesome-icon v-if="isSeeded(name)" :icon="['fas', 'lock']" class="seed-icon" />
            {{ name }}
          </button>
        </div>
        <button
          class="test-data-copy-all-btn"
          title="Copy group as JSON"
          @click.stop="copyGroupJson"
        >
          <font-awesome-icon :icon="['fas', copiedGroup ? 'check' : 'copy']" />
        </button>
      </div>
      <div v-if="selectedFields.length > 0" class="test-data-fields">
        <div v-for="field in selectedFields" :key="field.key" class="test-data-field-row">
          <span class="test-data-field-key">{{ field.shortKey }}</span>
          <span class="test-data-field-value">{{ field.value }}</span>
          <button
            class="test-data-copy-btn"
            title="Copy value"
            @click.stop="copyValue(field)"
          >
            <font-awesome-icon :icon="['fas', copiedField === field.key ? 'check' : 'copy']" />
          </button>
        </div>
      </div>
      <div v-if="selectedGroup" class="test-data-seed-actions">
        <template v-if="!props.readonly">
          <button
            v-if="!isSeeded(selectedGroup)"
            class="seed-action-btn"
            title="Pin a seed for reproducible values"
            @click="pinSeed"
          >
            <font-awesome-icon :icon="['fas', 'thumbtack']" /> Pin seed
          </button>
          <template v-else>
            <button
              class="seed-action-btn seed-action-clear"
              title="Remove seed, use random values"
              @click="clearSeed"
            >
              <font-awesome-icon :icon="['fas', 'lock-open']" /> Randomize
            </button>
            <span class="seed-value-label">Seed: {{ getSeed(selectedGroup) }}</span>
          </template>
        </template>
        <span v-else-if="isSeeded(selectedGroup)" class="seed-label">
          <font-awesome-icon :icon="['fas', 'lock']" /> Seed: {{ getSeed(selectedGroup) }}
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.test-data-panel {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}

.test-data-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  cursor: pointer;
  user-select: none;
  background: var(--bg-elevated);
  border-bottom: 1px solid var(--border-subtle);
}

.test-data-header h3 {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 12px;
  font-weight: 600;
}

.test-data-count {
  font-size: 11px;
  color: var(--text-muted);
}

.test-data-body {
  max-height: 250px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.test-data-groups-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border-subtle);
}

.test-data-groups {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  flex: 1;
}

.test-data-copy-all-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm, 4px);
  background: var(--bg-surface);
  color: var(--text-muted);
  cursor: pointer;
  font-size: 11px;
  flex-shrink: 0;
  transition: color 0.15s, border-color 0.15s;
}

.test-data-copy-all-btn:hover {
  color: var(--accent, #4f9eff);
  border-color: var(--accent, #4f9eff);
}

.test-data-group-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm, 4px);
  background: var(--bg-surface);
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-secondary);
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}

.test-data-group-btn:hover {
  background: var(--bg-elevated);
  border-color: var(--accent, #4f9eff);
  color: var(--text-primary);
}

.test-data-group-btn.active {
  background: var(--accent-subtle, rgba(79, 158, 255, 0.1));
  border-color: var(--accent, #4f9eff);
  color: var(--accent, #4f9eff);
  font-weight: 600;
}

.seed-icon {
  font-size: 9px;
  opacity: 0.7;
}

.seed-value-label {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-muted);
}

.test-data-fields {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 4px 0;
}

.test-data-field-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 4px 12px;
}

.test-data-field-row:hover {
  background: var(--bg-elevated);
}

.test-data-field-row:hover .test-data-copy-btn {
  opacity: 1;
}

.test-data-field-key {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  white-space: nowrap;
  min-width: 70px;
}

.test-data-field-key::after {
  content: ':';
}

.test-data-field-value {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-primary);
  word-break: break-all;
  line-height: 1.4;
  flex: 1;
}

.test-data-copy-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: var(--radius-sm, 4px);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 10px;
  opacity: 0;
  flex-shrink: 0;
  transition: opacity 0.15s, color 0.15s;
}

.test-data-copy-btn:hover {
  color: var(--accent, #4f9eff);
}

.test-data-seed-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-top: 1px solid var(--border-subtle);
}

.seed-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm, 4px);
  background: var(--bg-surface);
  font-size: 11px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s, background 0.15s;
}

.seed-action-btn:hover {
  color: var(--accent, #4f9eff);
  border-color: var(--accent, #4f9eff);
  background: var(--accent-subtle, rgba(79, 158, 255, 0.05));
}

.seed-action-clear:hover {
  color: var(--warning, #f59e0b);
  border-color: var(--warning, #f59e0b);
  background: rgba(245, 158, 11, 0.05);
}

.seed-label {
  font-size: 11px;
  color: var(--text-muted);
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
</style>
