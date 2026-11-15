import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS, VSOL_TEMPLATES, ZTE_TEMPLATES } from './defaults'
import { analyze, generateConfig } from './generator'
import type { Customer, Params } from './types'

const P: Params = { ...DEFAULT_PARAMS, slot: 1, snCase: 'upper' }
const none = { used: {}, sns: [] }
const c = (extra: Partial<Customer> = {}): Customer => ({
  id: 'x',
  sn: 'ZTEGC1234567',
  name: 'Budi Santoso',
  pon: 1,
  onuId: null,
  ...extra,
})

describe('VLAN dan profil per pelanggan', () => {
  it('menimpa VLAN dan profil di template ZTE', () => {
    const rows = analyze([c({ vlan: 100, profile: '50M' })], P, none)
    const out = generateConfig(rows, P, ZTE_TEMPLATES)
    expect(out).toContain('user-vlan 100 vlan 100')
    expect(out).toContain('service Internet gemport 1 vlan 100')
    expect(out).toContain('tcont 1 profile 50M')
    expect(out).toContain('traffic-limit upstream 50M downstream 50M')
    expect(out).not.toContain('444')
    expect(out).not.toContain('30M')
  })

  it('profil menggantikan line profile di template VSOL', () => {
    const rows = analyze([c({ profile: 'line_2' })], P, none)
    expect(generateConfig(rows, P, VSOL_TEMPLATES)).toContain('onu 1 profile line name line_2')
  })

  it('tanpa override memakai nilai Parameter', () => {
    const rows = analyze([c()], P, none)
    const out = generateConfig(rows, P, ZTE_TEMPLATES)
    expect(out).toContain('user-vlan 444 vlan 444')
    expect(out).toContain('tcont 1 profile 30M')
  })

  it('pelanggan berbeda boleh punya VLAN berbeda dalam satu config', () => {
    const rows = analyze([c({ vlan: 100 }), c({ id: 'y', sn: 'GPON1A2B3C4D', name: 'Siti' })], P, none)
    const out = generateConfig(rows, P, ZTE_TEMPLATES)
    expect(out).toContain('user-vlan 100 vlan 100')
    expect(out).toContain('user-vlan 444 vlan 444')
  })

  it('VLAN di luar 1-4094 dan profil berbahaya ditolak', () => {
    expect(analyze([c({ vlan: 0 })], P, none)[0].ok).toBe(false)
    expect(analyze([c({ vlan: 5000 })], P, none)[0].ok).toBe(false)
    expect(analyze([c({ profile: '50M; reload' })], P, none)[0].ok).toBe(false)
    expect(analyze([c({ vlan: 4094, profile: 'Paket_50M-A' })], P, none)[0].ok).toBe(true)
  })
})
