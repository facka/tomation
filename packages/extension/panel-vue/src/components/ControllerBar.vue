<script setup lang="ts">
import { useRunExecution } from '@/composables/useRunExecution';
import SpeedSelector from './SpeedSelector.vue';

type Speed = 'FAST' | 'NORMAL' | 'SLOW';

const props = defineProps<{
  speed: Speed;
}>();

const emit = defineEmits<{
  (e: 'toggleContext'): void;
  (e: 'update:speed', value: Speed): void;
}>();

const { isRunning, isPaused, pause, resume, stop } = useRunExecution();

function onSpeedChange(value: Speed) {
  emit('update:speed', value);
}
</script>

<template>
  <div class="controller-bar">
    <button
      class="btn btn-sm"
      :disabled="!isRunning || isPaused"
      title="Pause"
      @click="pause"
    ><font-awesome-icon :icon="['fas', 'pause']" aria-hidden="true" /> <span class="btn-label">Pause</span></button>

    <button
      class="btn btn-sm"
      :disabled="!isRunning || !isPaused"
      title="Resume"
      @click="resume"
    ><font-awesome-icon :icon="['fas', 'play']" aria-hidden="true" /> <span class="btn-label">Resume</span></button>

    <button
      class="btn btn-sm btn-danger"
      :disabled="!isRunning"
      title="Stop"
      @click="stop"
    ><font-awesome-icon :icon="['fas', 'stop']" aria-hidden="true" /> <span class="btn-label">Stop</span></button>

    <button
      class="btn btn-sm btn-ghost"
      title="Context"
      @click="emit('toggleContext')"
    ><font-awesome-icon :icon="['fas', 'clipboard-list']" aria-hidden="true" /> <span class="btn-label">Context</span></button>

    <div class="controller-bar-speed">
      <SpeedSelector :model-value="props.speed" @update:model-value="onSpeedChange" />
    </div>
  </div>
</template>

<style scoped>
.controller-bar-speed {
  margin-left: auto;
}

/* On narrow panels (< 500px), the pause/resume/stop/context buttons collapse
   to icon-only to save horizontal space. */
@media (max-width: 499px) {
  .controller-bar :deep(.btn-label) {
    display: none;
  }
}
</style>
