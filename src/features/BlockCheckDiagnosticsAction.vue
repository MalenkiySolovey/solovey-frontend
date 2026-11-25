<template>
  <div v-if="route.name === 'component.observability-extra.diagnostics' && canOpenBlockCheck" class="d-flex justify-end px-4 pt-2">
    <v-btn variant="text" prepend-icon="mdi-lan-check" @click="openBlockCheck()">BlockCheck</v-btn>
  </div>
</template>

<script setup lang="ts">
import { useRoute } from 'vue-router'
import { useBlockCheckLink } from './useBlockCheckLink'

const route = useRoute()
const { canOpenBlockCheck, openBlockCheck } = useBlockCheckLink()
</script>
