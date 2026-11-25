<template>
  <v-alert v-if="shown" class="mt-2" density="compact" variant="tonal" :type="status === 'blocked' ? 'warning' : 'info'">
    <template v-if="egress.state === 'known'">
      <div v-if="binding">{{ t('zapretDial.uses', { outbound: egress.tag, strategy: name }) }}</div>
      <div v-else>{{ t('zapretDial.noBinding', { outbound: egress.tag }) }}</div>
      <template v-if="binding">
        <div>{{ t(`zapretDial.states.${status}`) }}</div>
        <div v-if="dnsType">{{ t(coverage) }}</div>
      </template>
    </template>
    <div v-else>{{ t(`zapretDial.path.${egress.state}`) }}</div>
    <v-btn v-if="canOpenStrategies" size="small" variant="text" class="px-0" :to="{ name: 'component.zapret', params: { hostId } }" target="_blank" rel="noopener">
      {{ t('zapretDial.openStrategies') }}
    </v-btn>
  </v-alert>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import Data from '@/store/modules/data'
import { hasZapretComponent, readZapretSummary, zapretEgress, type ZapretCatalogSummary } from '@/features/zapretBinding'

const props = defineProps<{ selected: Parameters<typeof zapretEgress>[1]; dnsType?: string }>()
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const hostId = computed(() => route.params.hostId)
const canOpenStrategies = computed(() => hasZapretComponent() && router.hasRoute('component.zapret'))
const catalog = ref<ZapretCatalogSummary>()
const egress = computed(() => zapretEgress([...(Data().outbounds ?? []), ...(Data().endpoints ?? [])], props.selected))
const binding = computed(() => egress.value.state === 'known' ? egress.value.binding : undefined)
const shown = computed(() => hasZapretComponent() || !!binding.value)
const name = computed(() => {
  const ref = binding.value?.strategyRef ?? ''
  return catalog.value?.catalog.records[ref]?.name ?? ref
})
const status = computed(() => catalog.value?.references.find(ref =>
  ref.enabled && ref.outboundRef === binding.value?.outboundRef && ref.strategyRef === binding.value?.strategyRef)?.state ?? 'blocked')
const coverage = computed(() => {
  if (egress.value.state !== 'known') return 'zapretDial.path.unresolved'
  if (egress.value.kind === 'proxy' || egress.value.proxied) return 'zapretDial.dnsOuter'
  if (props.selected !== egress.value.tag) return 'zapretDial.dnsDelegated'
  switch (props.dnsType) {
    case 'udp': return 'zapretDial.requiresUDPAndTCP'
    case 'quic': case 'h3': return 'zapretDial.requiresQUIC'
    default: return 'zapretDial.requiresTCP'
  }
})

watch([hostId, () => hasZapretComponent() && binding.value?.outboundRef, () => binding.value?.strategyRef], async ([, load], _, cleanup) => {
  let stale = false
  cleanup(() => { stale = true })
  catalog.value = undefined
  if (!load) return
  const response = await readZapretSummary()
  if (!stale) catalog.value = response
}, { immediate: true })
</script>
