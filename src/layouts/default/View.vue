<template>
  <v-main>
    <BlockCheckDiagnosticsAction />
    <router-view />
  </v-main>
</template>

<script lang="ts" setup>
import BlockCheckDiagnosticsAction from '@/features/BlockCheckDiagnosticsAction.vue'
</script>

<style>
.v-main {
  margin: 10px;
}
</style>
