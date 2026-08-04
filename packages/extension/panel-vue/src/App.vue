<script setup lang="ts">
import { useStore } from '@/store';
import HomeView from '@/components/HomeView.vue';
import TestPlanView from '@/components/TestPlanView.vue';

const store = useStore();
</script>

<template>
  <div class="app">
    <!-- HomeView -->
    <HomeView v-if="store.state.currentView === 'home'" />

    <!-- TestPlanView -->
    <TestPlanView v-if="store.state.currentView === 'test-plan'" />

    <!-- RunView placeholder -->
    <div v-if="store.state.currentView === 'run'" class="view active">
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
