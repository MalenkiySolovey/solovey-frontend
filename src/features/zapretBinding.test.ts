import { describe, expect, it, vi } from 'vitest'
import { boundDirect, hasZapretComponent, isZapretDNSTransport, isZapretSocketOwner, zapretOutboundConflict } from './zapretBinding'
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

  it('derives DNS status strictly from the selected enabled Direct', () => {
    const binding = { outboundRef: 'a', enabled: true, strategyRef: 'example-strategy' }
    const rows = [{ type: 'direct', tag: 'a', zapret: binding }, { type: 'socks', tag: 'b', zapret: binding }, { type: 'direct', tag: 'c' }]
    expect(boundDirect(rows, 'a')).toBe(binding)
    expect(boundDirect(rows, 'b')).toBeUndefined()
    expect(boundDirect(rows, 'c')).toBeUndefined()
    expect(boundDirect(rows, '')).toBeUndefined()
    expect(boundDirect([{ type: 'direct', tag: 'a', zapret: { ...binding, enabled: false } }], 'a')).toBeUndefined()
  })

  it('does not erase conflicting explicit dial intent', () => {
    expect(zapretOutboundConflict({ type: 'direct', detour: '' })).toBeUndefined()
    expect(zapretOutboundConflict({ type: 'direct', detour: 'proxy' })).toBe('zapretDial.detoured')
    for (const intent of [{ routing_mark: 0 }, { netns: 'separate' }, { protect_path: '/run/custom.sock' }]) {
      expect(zapretOutboundConflict({ type: 'direct', ...intent })).toBe('zapretDial.conflict')
    }
  })

  it('lets the installed Host validate source addresses and interface together', () => {
    const bound = { type: 'direct', bind_interface: 'eth0', inet4_bind_address: '198.18.0.5', inet6_bind_address: '2001:db8:1::5' }
    expect(zapretOutboundConflict(bound)).toBeUndefined()
    expect(zapretOutboundConflict({ ...bound, routing_mark: 12 })).toBe('zapretDial.conflict')
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
})
