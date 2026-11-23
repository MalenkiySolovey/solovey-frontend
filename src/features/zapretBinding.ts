import HttpUtils from '@/plugins/httputil'
import Data from '@/store/modules/data'

export interface ZapretBinding {
  outboundRef: string
  enabled: boolean
  strategyRef: string
}

export interface ZapretCatalogSummary {
  ready: boolean
  catalog: { records: Record<string, { name: string }> }
  references: Array<ZapretBinding & { state: 'off' | 'applied' | 'pending' | 'blocked' }>
}

export function hasZapretComponent() {
  return (Data().components ?? []).some(component => component.id === 'zapret' && component.installed && component.active && component.availableInBinary !== false)
}

export async function readZapretSummary(): Promise<ZapretCatalogSummary | undefined> {
  if (!hasZapretComponent()) return
  const response = await HttpUtils.get('api/components/zapret/strategies')
  if (response.success) return response.obj as ZapretCatalogSummary
}

export function boundDirect(rows: readonly { tag?: string; type?: string; zapret?: ZapretBinding }[], tag: string | undefined) {
  if (!tag) return undefined
  const row = rows.find(outbound => outbound.tag === tag && outbound.type === 'direct')
  return row?.zapret?.enabled && row.zapret.outboundRef === tag ? row.zapret : undefined
}

export function zapretDialConflict(dial: Record<string, unknown>): boolean {
  return Boolean(dial.detour) || ['protect_path', 'routing_mark', 'bind_interface', 'netns', 'inet4_bind_address', 'inet6_bind_address']
    .some(field => dial[field] !== undefined)
}
