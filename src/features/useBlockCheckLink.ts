import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { componentRoutes } from '@/componentSystem/registry'
import { syncEnabledComponents } from '@/componentSystem/loader'
import Data from '@/store/modules/data'
import { LOCAL_HOST, routeHostID } from '@/router/hostContext'

type BlockCheckContext = { outbound?: string; resolver?: string }

export const canSelectBlockCheckResolver = (type: unknown) => typeof type === 'string' && ['udp', 'tcp', 'tls', 'https', 'quic', 'h3'].includes(type)

export function useBlockCheckLink() {
  const router = useRouter()
  const route = useRoute()
  const name = 'component.blockcheck'
  const available = computed(() => routeHostID(route) === LOCAL_HOST.id && componentRoutes.value.some(candidate => candidate.name === name) &&
    (Data().components ?? []).some(item => item.id === 'blockcheck' && item.installed && item.active && item.availableInBinary !== false))
  async function open(context: BlockCheckContext = {}) {
    if (!available.value) return
    if (!router.hasRoute(name)) await syncEnabledComponents(router)
    if (available.value && router.hasRoute(name)) {
      await router.push({ name, params: { hostId: route.params.hostId }, query: context })
    }
  }
  return { canOpenBlockCheck: available, openBlockCheck: open }
}
