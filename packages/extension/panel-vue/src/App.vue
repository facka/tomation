<script setup lang="ts">
import { useStore } from '@/store';
import HomeView from '@/components/HomeView.vue';
import TestPlanView from '@/components/TestPlanView.vue';
import RunView from '@/components/RunView.vue';

const store = useStore();
</script>

<template>
  <div class="app">
    <!-- HomeView -->
    <HomeView v-if="store.state.currentView === 'home'" />

    <!-- TestPlanView -->
    <TestPlanView v-if="store.state.currentView === 'test-plan'" />

    <!-- RunView -->
    <RunView v-if="store.state.currentView === 'run'" />
  </div>
</template>

<style scoped>
.app {
  width: 100%;
  height: 100%;
}
</style>
