<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue';

type Speed = 'FAST' | 'NORMAL' | 'SLOW';

const props = defineProps<{
  modelValue: Speed;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: Speed): void;
}>();

interface SpeedOption {
  value: Speed;
  label: string;
  icon: string;
}

// Slow → stopwatch, Normal → gauge, Fast → bolt
const OPTIONS: SpeedOption[] = [
  { value: 'SLOW', label: 'Slow', icon: 'stopwatch' },
  { value: 'NORMAL', label: 'Normal', icon: 'gauge' },
  { value: 'FAST', label: 'Fast', icon: 'bolt' },
];

const open = ref(false);
const rootRef = ref<HTMLElement | null>(null);

const selected = computed<SpeedOption>(
  () => OPTIONS.find((o) => o.value === props.modelValue) ?? OPTIONS[1],
);

function toggle() {
  open.value = !open.value;
}

function choose(value: Speed) {
  emit('update:modelValue', value);
  open.value = false;
}

function onDocumentClick(event: MouseEvent) {
  if (rootRef.value && !rootRef.value.contains(event.target as Node)) {
    open.value = false;
  }
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') open.value = false;
}

onMounted(() => {
  document.addEventListener('click', onDocumentClick);
  document.addEventListener('keydown', onKeydown);
});

onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick);
  document.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <div ref="rootRef" class="speed-selector">
    <button
      type="button"
      class="speed-selector-trigger"
      :class="{ open }"
      :title="'Execution speed: ' + selected.label + ' — click to change'"
      :aria-label="'Execution speed: ' + selected.label"
      :aria-expanded="open"
      aria-haspopup="listbox"
      @click.stop="toggle"
    >
      <font-awesome-icon :icon="['fas', selected.icon]" class="speed-selector-icon" aria-hidden="true" />
      <font-awesome-icon :icon="['fas', 'chevron-down']" class="speed-selector-caret" aria-hidden="true" />
    </button>

    <Transition name="speed-popup">
      <ul v-if="open" class="speed-selector-popup" role="listbox">
        <li
          v-for="opt in OPTIONS"
          :key="opt.value"
          class="speed-selector-option"
          :class="{ active: opt.value === props.modelValue }"
          role="option"
          :aria-selected="opt.value === props.modelValue"
          @click.stop="choose(opt.value)"
        >
          <font-awesome-icon :icon="['fas', opt.icon]" class="speed-option-icon" aria-hidden="true" />
          <span class="speed-option-label">{{ opt.label }}</span>
          <font-awesome-icon
            v-if="opt.value === props.modelValue"
            :icon="['fas', 'check']"
            class="speed-option-check"
            aria-hidden="true"
          />
        </li>
      </ul>
    </Transition>
  </div>
</template>

<style scoped>
.speed-selector {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.speed-selector-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm, 4px);
  background: var(--bg-surface);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 12px;
  transition: color 0.15s, border-color 0.15s, background 0.15s;
}

.speed-selector-trigger:hover,
.speed-selector-trigger.open {
  color: var(--accent, #4f9eff);
  border-color: var(--accent, #4f9eff);
}

.speed-selector-icon {
  font-size: 13px;
}

.speed-selector-caret {
  font-size: 9px;
  transition: transform 0.2s ease;
}

.speed-selector-trigger.open .speed-selector-caret {
  transform: rotate(180deg);
}

.speed-selector-popup {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 50;
  min-width: 128px;
  margin: 0;
  padding: 4px;
  list-style: none;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm, 4px);
  background: var(--bg-surface);
  box-shadow: var(--shadow-md);
  transform-origin: top right;
}

.speed-selector-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: var(--radius-sm, 4px);
  font-size: 12px;
  color: var(--text-primary);
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}

.speed-selector-option:hover {
  background: var(--bg-elevated);
}

.speed-selector-option.active {
  color: var(--accent, #4f9eff);
}

.speed-option-icon {
  font-size: 13px;
  width: 16px;
  text-align: center;
}

.speed-option-label {
  flex: 1;
}

.speed-option-check {
  font-size: 10px;
}

/* Expand / collapse animation */
.speed-popup-enter-active,
.speed-popup-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.speed-popup-enter-from,
.speed-popup-leave-to {
  opacity: 0;
  transform: scaleY(0.85) translateY(-4px);
}
</style>
