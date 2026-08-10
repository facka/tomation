<script setup lang="ts">
import { useRunExecution } from '@/composables/useRunExecution';

const { isRunning, isPaused, pause, resume, stop } = useRunExecution();

const emit = defineEmits<{
  (e: 'toggleContext'): void;
}>();
</script>

<template>
  <div class="controller-bar">
    <button
      class="btn btn-sm"
      :disabled="!isRunning || isPaused"
      @click="pause"
    ><font-awesome-icon :icon="['fas', 'pause']" aria-hidden="true" /> Pause</button>

    <button
      class="btn btn-sm"
      :disabled="!isRunning || !isPaused"
      @click="resume"
    ><font-awesome-icon :icon="['fas', 'play']" aria-hidden="true" /> Resume</button>

    <button
      class="btn btn-sm btn-danger"
      :disabled="!isRunning"
      @click="stop"
    ><font-awesome-icon :icon="['fas', 'stop']" aria-hidden="true" /> Stop</button>

    <button
      class="btn btn-sm btn-ghost"
      @click="emit('toggleContext')"
    ><font-awesome-icon :icon="['fas', 'clipboard-list']" aria-hidden="true" /> Context</button>
  </div>
</template>
