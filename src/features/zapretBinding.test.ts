import { describe, expect, it, vi } from 'vitest'
import { boundDirect, hasZapretComponent, isZapretDNSTransport, zapretDialConflict } from './zapretBinding'

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
    expect(zapretDialConflict({ detour: '' })).toBe(false)
    expect(zapretDialConflict({ detour: 'proxy' })).toBe(true)
    expect(zapretDialConflict({ routing_mark: 0 })).toBe(true)
    expect(zapretDialConflict({ bind_interface: '' })).toBe(true)
  })

  it('uses the existing DNS detour control for encrypted QUIC and TCP transports', () => {
    for (const type of ['quic', 'h3', 'https', 'tls']) expect(isZapretDNSTransport(type)).toBe(true)
    for (const type of ['udp', 'tcp', 'local', 'hosts', undefined]) expect(isZapretDNSTransport(type)).toBe(false)
  })
})
