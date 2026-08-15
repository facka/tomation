<script setup lang="ts">
import { ref } from 'vue';

defineProps<{
  data: Record<string, string | number>;
}>();

const collapsed = ref(false);

function toggle() {
  collapsed.value = !collapsed.value;
}
</script>

<template>
  <div class="test-data-panel">
    <div class="test-data-header" @click="toggle">
      <h3>
        <font-awesome-icon :icon="['fas', collapsed ? 'chevron-right' : 'chevron-down']" aria-hidden="true" />
        Test Data
      </h3>
    </div>
    <table v-if="!collapsed" class="test-data-table">
      <tbody>
        <tr v-for="(value, key) in data" :key="key">
          <td class="test-data-key">{{ key }}</td>
          <td class="test-data-value">{{ value }}</td>
        </tr>
      </tbody>
    </table>
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
  padding: 10px 12px;
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
}

.test-data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.test-data-table tr {
  border-bottom: 1px solid var(--border-subtle);
}

.test-data-table tr:last-child {
  border-bottom: none;
}

.test-data-key {
  padding: 6px 12px;
  font-family: var(--font-mono);
  font-weight: 600;
  color: var(--text-secondary);
  white-space: nowrap;
  width: 1%;
}

.test-data-value {
  padding: 6px 12px;
  font-family: var(--font-mono);
  color: var(--text-primary);
  word-break: break-all;
}
</style>
