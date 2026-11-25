import { describe, expect, it, vi } from 'vitest'
import { hasZapretComponent, isZapretDNSTransport, isZapretSocketOwner, zapretDialScope, zapretEgress, zapretOutboundConflict } from './zapretBinding'
import en from '@/locales/en/zapretDial'
import ru from '@/locales/ru/zapretDial'

const fixture = vi.hoisted(() => ({ components: [] as object[] }))
vi.mock('@/store/modules/data', () => ({ default: () => fixture }))
vi.mock('@/plugins/httputil', () => ({ default: { get: vi.fn() } }))

describe('Zapret Dial Options', () => {
  it('exposes the feature only for an admitted active component', () => {
    expect(hasZapretComponent()).toBe(false)
    fixture.components = [{ id: 'zapret', installed: true, active: true, availableInBinary: false }]
    expect(hasZapretComponent()).toBe(false)
    fixture.components = [{ id: 'zapret', installed: true, active: true, availableInBinary: true }]
    expect(hasZapretComponent()).toBe(true)
  })

  it('derives status from the configured Direct or fixed proxy socket owner', () => {
    const binding = { outboundRef: 'a', enabled: true, strategyRef: 'example-strategy' }
    const proxy = { type: 'http', tag: 'b', server: 'proxy.example.test', server_port: 443, zapret: { ...binding, outboundRef: 'b' } }
    const rows = [{ type: 'direct', tag: 'a', zapret: binding }, proxy,
      { ...proxy, tag: 'hop', detour: 'a' }, { type: 'direct', tag: 'off', zapret: { ...binding, outboundRef: 'off', enabled: false } },
      { type: 'selector', tag: 'group', outbounds: ['b'] }, { type: 'selector', tag: 'dynamic', outbounds: ['a', 'b'], default: 'a' }]
    expect(zapretEgress(rows, 'a')).toMatchObject({ state: 'known', kind: 'direct', binding })
    expect(zapretEgress(rows, 'b')).toMatchObject({ state: 'known', kind: 'proxy', binding: proxy.zapret })
    expect(zapretEgress(rows, 'group')).toMatchObject({ state: 'known', tag: 'b', binding: proxy.zapret })
    expect(zapretEgress(rows, 'hop')).toMatchObject({ state: 'known', tag: 'a', proxied: true, binding })
    expect(zapretEgress(rows, 'off')).toMatchObject({ state: 'known', binding: undefined })
    expect(zapretEgress(rows, 'dynamic')).toEqual({ state: 'dynamic' })
    expect(zapretEgress(rows, { type: 'selector', tag: 'draft', outbounds: ['a'], providers: ['remote'] })).toEqual({ state: 'dynamic' })
    expect(zapretEgress(rows, '')).toEqual({ state: 'unresolved' })
    expect(zapretEgress([...rows, { type: 'direct', tag: 'a' }], 'a')).toEqual({ state: 'unresolved' })
    expect(zapretEgress(rows, { ...proxy, tag: 'hop', detour: 'hop' })).toEqual({ state: 'unresolved' })
    expect(zapretEgress(rows, { ...proxy, tag: 'hop', type: 'socks', detour: 'b' })).toEqual({ state: 'unqualified' })
  })

  it('does not erase conflicting explicit dial intent', () => {
    expect(zapretOutboundConflict({ type: 'direct', detour: '' })).toBeUndefined()
    expect(zapretOutboundConflict({ type: 'direct', detour: 'proxy' })).toBe('zapretDial.detoured')
    for (const mark of [0, '0', '0x000', '0O_00', '0b_0', '0_0']) {
      expect(zapretOutboundConflict({ type: 'direct', routing_mark: mark, netns: '' })).toBeUndefined()
    }
    for (const mark of [1, '0x1', '0x', '0_', '00e0', null, '', false, ' 0', '+0', '0\n']) {
      expect(zapretOutboundConflict({ type: 'direct', routing_mark: mark })).toBe('zapretDial.markConflict')
    }
    expect(zapretOutboundConflict({ type: 'direct', netns: 'separate' })).toBe('zapretDial.namespaceConflict')
    expect(zapretOutboundConflict({ type: 'direct', netns: null })).toBe('zapretDial.namespaceConflict')
    expect(zapretOutboundConflict({ type: 'direct', protect_path: '' })).toBe('zapretDial.protectPathConflict')
  })

  it('lets the installed Host validate source addresses and interface together', () => {
    const bound = { type: 'direct', bind_interface: 'eth0', inet4_bind_address: '198.18.0.5', inet6_bind_address: '2001:db8:1::5' }
    expect(zapretOutboundConflict(bound)).toBeUndefined()
    expect(zapretOutboundConflict({ ...bound, routing_mark: 12 })).toBe('zapretDial.markConflict')
  })

  it('keeps the binding on fixed proxy sockets, including their exact endpoint requirements', () => {
    const http = { type: 'http', server: 'proxy.example.test', server_port: 443 }
    const hy2 = { ...http, type: 'hysteria2' }
    expect(zapretOutboundConflict(http)).toBeUndefined()
    expect(zapretOutboundConflict({ ...hy2, server_ports: [], realm: null })).toBeUndefined()
    expect(zapretOutboundConflict({ ...http, detour: 'underlay' })).toBe('zapretDial.detoured')
    expect(zapretOutboundConflict({ ...hy2, server_ports: ['443:445'] })).toBe('zapretDial.portHopping')
    expect(zapretOutboundConflict({ ...hy2, realm: {} })).toBe('zapretDial.realm')
    expect(zapretOutboundConflict({ ...http, server_port: '' })).toBe('zapretDial.fixedEndpoint')
    for (const type of ['selector', 'urltest', 'failover', 'wireguard', undefined]) expect(isZapretSocketOwner(type)).toBe(false)
    expect(Object.keys(ru.zapretDial).sort()).toEqual(Object.keys(en.zapretDial).sort())
  })

  it('uses one explicit detour control for plain and encrypted remote DNS', () => {
    for (const type of ['tcp', 'udp', 'quic', 'h3', 'https', 'tls']) expect(isZapretDNSTransport(type)).toBe(true)
    for (const type of ['local', 'hosts', 'fakeip', 'resolved', undefined]) expect(isZapretDNSTransport(type)).toBe(false)
  })

  it('projects the actual outer network, not the logical proxy network', () => {
    const endpoint = { server: 'proxy.example.test', server_port: 443 }
    for (const type of ['vless', 'vmess', 'trojan', 'anytls', 'shadowtls', 'ssh']) {
      expect(zapretDialScope({ ...endpoint, type, network: 'udp' })).toBe('zapretDial.outerProxyTCP')
    }
    for (const type of ['vless', 'vmess', 'trojan']) {
      expect(zapretDialScope({ ...endpoint, type, transport: {} })).toBe('zapretDial.outerProxyTCP')
      expect(zapretDialScope({ ...endpoint, type, transport: { type: 'ws' } })).toBe('zapretDial.outerProxyTCP')
      expect(zapretDialScope({ ...endpoint, type, transport: { type: 'quic' } })).toBe('zapretDial.outerProxyQUIC')
      expect(zapretOutboundConflict({ ...endpoint, type, transport: { type: 'xhttp' } })).toBe('zapretDial.variableTransport')
      expect(zapretOutboundConflict({ ...endpoint, type, transport: { path: '/socket' } })).toBe('zapretDial.variableTransport')
    }
    expect(zapretDialScope({ ...endpoint, type: 'tuic', network: 'tcp' })).toBe('zapretDial.outerProxyQUIC')
    const socks = { ...endpoint, type: 'socks', network: 'tcp' }
    expect(zapretOutboundConflict(socks)).toBe('zapretDial.socksRelay')
    expect(zapretDialScope(socks)).toBeUndefined()
    expect(zapretDialScope({ ...socks, version: '4a' })).toBe('zapretDial.outerProxyTCP')
    expect(zapretDialScope({ ...socks, udp_over_tcp: true })).toBe('zapretDial.outerProxyTCP')
    const shadowsocks = { ...endpoint, type: 'shadowsocks', network: 'tcp' }
    expect(zapretDialScope(shadowsocks)).toBe('zapretDial.outerProxyTCPUDP')
    expect(zapretDialScope({ ...shadowsocks, multiplex: { enabled: true } })).toBe('zapretDial.outerProxyTCP')
    expect(zapretDialScope({ ...shadowsocks, udp_over_tcp: { enabled: true } })).toBe('zapretDial.outerProxyTCP')
    expect(zapretOutboundConflict({ ...shadowsocks, plugin: 'v2ray-plugin' })).toBe('zapretDial.shadowsocksPlugin')
  })
})
