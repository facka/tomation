<script setup lang="ts">
import { ref } from 'vue';

export type ViewName = 'home' | 'test-plan' | 'run';

const currentView = ref<ViewName>('home');

function setView(view: ViewName) {
  currentView.value = view;
}
</script>

<template>
  <div class="app">
    <!-- HomeView placeholder -->
    <div v-if="currentView === 'home'" class="view">
      <p>HomeView placeholder</p>
    </div>

    <!-- TestPlanView placeholder -->
    <div v-if="currentView === 'test-plan'" class="view">
      <p>TestPlanView placeholder</p>
    </div>

    <!-- RunView placeholder -->
    <div v-if="currentView === 'run'" class="view">
      <p>RunView placeholder</p>
    </div>
  </div>
</template>

<style scoped>
.app {
  width: 100%;
  height: 100%;
}
</style>
