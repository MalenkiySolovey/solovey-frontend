import HttpUtils from '@/plugins/httputil'
import Data from '@/store/modules/data'
import { isNativeTCPTransportDraft } from '@/types/transport'

export interface ZapretBinding {
  outboundRef: string
  enabled: boolean
  strategyRef: string
}

export type ZapretOutboundConflict = 'zapretDial.detoured' | 'zapretDial.markConflict' | 'zapretDial.namespaceConflict' |
  'zapretDial.protectPathConflict' | 'zapretDial.realm' |
  'zapretDial.portHopping' | 'zapretDial.fixedEndpoint' | 'zapretDial.noSocket' |
  'zapretDial.variableTransport' | 'zapretDial.socksRelay' | 'zapretDial.shadowsocksPlugin'

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

export function isZapretDNSTransport(type: unknown): boolean {
  return type === 'tcp' || type === 'udp' || type === 'https' || type === 'tls' || type === 'quic' || type === 'h3'
}

const socketOwners = ['direct', 'http', 'hysteria2', 'tuic', 'vless', 'vmess', 'trojan', 'anytls', 'shadowtls', 'ssh', 'socks', 'shadowsocks', 'snell'] as const

export function isZapretSocketOwner(type: unknown): type is (typeof socketOwners)[number] {
  return socketOwners.some(owner => owner === type)
}

type EgressRow = Record<string, unknown> & { tag?: string; type?: string; zapret?: ZapretBinding }
type Egress = { state: 'known'; tag: string; kind: 'direct' | 'proxy'; proxied: boolean; binding?: ZapretBinding } |
  { state: 'dynamic' | 'unresolved' | 'unqualified' }

export function isZapretLogicalGroup(type: unknown): boolean {
  return type === 'selector' || type === 'urltest' || type === 'failover' || type === 'core-failover' || type === 'bond'
}

// This describes desired wiring, never a routing decision or a live connection.
export function zapretEgress(rows: readonly EgressRow[], selected: string | EgressRow): Egress {
  const visited = new Set<string>()
  const byTag = new Map<string, EgressRow | undefined>()
  for (const row of rows) {
    if (row.tag) byTag.set(row.tag, byTag.has(row.tag) ? undefined : row)
  }
  let row = typeof selected === 'string' ? byTag.get(selected) : selected
  let proxied = false
  while (row?.tag && !visited.has(row.tag)) {
    const tag = row.tag
    visited.add(tag)
    if (isZapretLogicalGroup(row.type)) {
      // Default order is not the current member; native providers can also
      // populate these groups dynamically. A sole static member is unambiguous.
      if (row.type !== 'selector' && row.type !== 'urltest' || row.use_all_providers === true ||
        (Array.isArray(row.providers) ? row.providers.length > 0 : Boolean(row.providers)) || row.include || row.exclude ||
        !Array.isArray(row.outbounds) || row.outbounds.length !== 1 || typeof row.outbounds[0] !== 'string') return { state: 'dynamic' }
      row = byTag.get(row.outbounds[0])
      continue
    }
    if (!isZapretSocketOwner(row.type)) return { state: 'unqualified' }
    if (row.type !== 'direct' && typeof row.detour === 'string' && row.detour) {
      // A separate, negotiated or plugin-owned socket is not resolved here.
      if ('conflict' in fixedSocket(row)) return { state: 'unqualified' }
      proxied = true
      row = byTag.get(row.detour)
      continue
    }
    if (zapretOutboundConflict(row)) return { state: 'unqualified' }
    return { state: 'known', kind: row.type === 'direct' ? row.type : 'proxy', tag, proxied,
      binding: row.zapret?.enabled && row.zapret.outboundRef === tag ? row.zapret : undefined }
  }
  return { state: 'unresolved' }
}

function enabledOption(value: unknown): boolean {
  return typeof value === 'object' && value !== null && 'enabled' in value && value.enabled === true
}

function fixedSocket(dial: Record<string, unknown>): { network: 'tcp' | 'quic' | 'tcp+udp' } | { conflict: ZapretOutboundConflict } {
  const uot = dial.udp_over_tcp === true || enabledOption(dial.udp_over_tcp)
  switch (dial.type) {
    case 'hysteria2':
      if (dial.realm != null) return { conflict: 'zapretDial.realm' }
      if ((Array.isArray(dial.server_ports) || typeof dial.server_ports === 'string') && dial.server_ports.length > 0) {
        return { conflict: 'zapretDial.portHopping' }
      }
      return { network: 'quic' }
    case 'tuic': return { network: 'quic' }
    case 'vless': case 'vmess': case 'trojan': {
      // The editor uses an empty object for native TCP and omits it on save.
      if (dial.transport == null || isNativeTCPTransportDraft(dial.transport)) return { network: 'tcp' }
      const transport = dial.transport as { type?: unknown }
      switch (transport.type) {
        case 'http': case 'ws': case 'grpc': case 'httpupgrade': return { network: 'tcp' }
        case 'quic': return { network: 'quic' }
        default: return { conflict: 'zapretDial.variableTransport' }
      }
    }
    case 'socks':
      if (dial.version === '4' || dial.version === '4a' ||
        ((dial.version == null || dial.version === '' || dial.version === '5') && uot)) return { network: 'tcp' }
      return { conflict: 'zapretDial.socksRelay' }
    case 'shadowsocks':
      if (dial.plugin) return { conflict: 'zapretDial.shadowsocksPlugin' }
      return { network: uot || enabledOption(dial.multiplex) ? 'tcp' : 'tcp+udp' }
    default: return { network: 'tcp' }
  }
}

export function zapretDialScope(dial: Record<string, unknown>): string | undefined {
  if (zapretOutboundConflict(dial)) return
  if (dial.type === 'direct') return 'zapretDial.scope'
  if (dial.type === 'http') return 'zapretDial.outerTCP'
  if (dial.type === 'hysteria2') return 'zapretDial.outerQUIC'
  const socket = fixedSocket(dial)
  if ('conflict' in socket) return
  switch (socket.network) {
    case 'tcp': return 'zapretDial.outerProxyTCP'
    case 'quic': return 'zapretDial.outerProxyQUIC'
    case 'tcp+udp': return 'zapretDial.outerProxyTCPUDP'
  }
}

export function zapretOutboundConflict(dial: Record<string, unknown>): ZapretOutboundConflict | undefined {
  if (!isZapretSocketOwner(dial.type)) return 'zapretDial.noSocket'
  if (dial.detour) return 'zapretDial.detoured'
  if (dial.protect_path !== undefined) return 'zapretDial.protectPathConflict'
  // Match the zero spellings of the pinned providers' base-0 FwMark parser.
  // Do not coerce null, an empty string, a sign, or malformed hex into zero.
  const mark = dial.routing_mark
  if (mark !== undefined && mark !== 0 && (typeof mark !== 'string' || mark.trim() !== mark ||
      !/^(?:0(?:_?0)*|0[xXbBoO]_?0(?:_?0)*)$/.test(mark))) {
    return 'zapretDial.markConflict'
  }
  if (dial.netns !== undefined && dial.netns !== '') return 'zapretDial.namespaceConflict'
  if (dial.type !== 'direct') {
    const socket = fixedSocket(dial)
    if ('conflict' in socket) return socket.conflict
    const port = typeof dial.server_port === 'number' || typeof dial.server_port === 'string' ? Number(dial.server_port) : NaN
    if (typeof dial.server !== 'string' || !dial.server.trim() || !Number.isInteger(port) || port < 1 || port > 65535) return 'zapretDial.fixedEndpoint'
  }
}
