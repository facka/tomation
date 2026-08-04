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
    >⏸ Pause</button>

    <button
      class="btn btn-sm"
      :disabled="!isRunning || !isPaused"
      @click="resume"
    >▶ Resume</button>

    <button
      class="btn btn-sm btn-danger"
      :disabled="!isRunning"
      @click="stop"
    >⏹ Stop</button>

    <button
      class="btn btn-sm btn-ghost"
      @click="emit('toggleContext')"
    >📋 Context</button>
  </div>
</template>
