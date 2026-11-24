import HttpUtils from '@/plugins/httputil'
import Data from '@/store/modules/data'

export interface ZapretBinding {
  outboundRef: string
  enabled: boolean
  strategyRef: string
}

export type ZapretOutboundConflict = 'zapretDial.detoured' | 'zapretDial.conflict' | 'zapretDial.realm' |
  'zapretDial.portHopping' | 'zapretDial.fixedEndpoint' | 'zapretDial.noSocket'

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

export function isZapretDNSTransport(type: unknown): boolean {
  return type === 'tcp' || type === 'udp' || type === 'https' || type === 'tls' || type === 'quic' || type === 'h3'
}

export function isZapretSocketOwner(type: unknown): type is 'direct' | 'http' | 'hysteria2' {
  return type === 'direct' || type === 'http' || type === 'hysteria2'
}

export function zapretOutboundConflict(dial: Record<string, unknown>): ZapretOutboundConflict | undefined {
  if (!isZapretSocketOwner(dial.type)) return 'zapretDial.noSocket'
  if (dial.detour) return 'zapretDial.detoured'
  if (['protect_path', 'routing_mark', 'netns'].some(field => dial[field] !== undefined)) return 'zapretDial.conflict'
  if (dial.type === 'hysteria2') {
    if (dial.realm != null) return 'zapretDial.realm'
    if (Array.isArray(dial.server_ports) && dial.server_ports.length > 0) return 'zapretDial.portHopping'
  }
  if (dial.type !== 'direct') {
    const port = typeof dial.server_port === 'number' || typeof dial.server_port === 'string' ? Number(dial.server_port) : NaN
    if (typeof dial.server !== 'string' || !dial.server.trim() || !Number.isInteger(port) || port < 1 || port > 65535) return 'zapretDial.fixedEndpoint'
  }
}
