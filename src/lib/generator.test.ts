import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS, ZTE_TEMPLATES } from './defaults'
import { analyze, generateConfig, sanitizeName } from './generator'
import type { Customer, ExistingConfig, Params } from './types'

const P: Params = { ...DEFAULT_PARAMS, slot: 1, snCase: 'upper' }

const c = (sn: string, name: string, pon = 1, onuId: number | null = null): Customer => ({
  id: `${sn}-${name}-${pon}-${onuId}`,
  sn,
  name,
  pon,
  onuId,
})
const none: ExistingConfig = { used: {}, sns: [] }

describe('sanitizeName', () => {
  it('mengganti spasi dengan underscore', () => {
    expect(sanitizeName('Budi Santoso')).toBe('Budi_Santoso')
  })
  it('membuang karakter berbahaya dan aksen', () => {
    expect(sanitizeName('  Siti "Aminah"; rm -rf /  ')).toBe('Siti_Aminah_rm_-rf')
    expect(sanitizeName('Édo Ñandú')).toBe('Edo_Nandu')
  })
  it('spasi biasa tidak dianggap perubahan, simbol dianggap peringatan', () => {
    const rows = analyze([c('GPON1A2B3C4D', 'Budi Santoso'), c('ZTEGC1234567', 'Siti "Aminah"')], P, none)
    expect(rows[0].issues).toEqual([])
    expect(rows[1].issues).toHaveLength(1)
    expect(rows[1].issues[0].level).toBe('warn')
    expect(rows[1].ok).toBe(true)
  })
  it('dibatasi 32 karakter', () => {
    expect(sanitizeName('a'.repeat(50))).toHaveLength(32)
  })
})

describe('analyze', () => {
  it('auto-increment per PON', () => {
    const rows = analyze(
      [c('GPON1A2B3C4D', 'A'), c('ZTEGC1234567', 'B'), c('GPON00000001', 'C', 2)],
      P,
      none,
    )
    expect(rows.map((r) => r.onuId)).toEqual([1, 2, 1])
    expect(rows.every((r) => r.ok)).toBe(true)
  })

  it('melewati ONU ID yang sudah dipakai di OLT', () => {
    const existing: ExistingConfig = { used: { '1/1': [1, 2, 4] }, sns: [] }
    const rows = analyze([c('GPON1A2B3C4D', 'A'), c('ZTEGC1234567', 'B')], P, existing)
    expect(rows.map((r) => r.onuId)).toEqual([3, 5])
  })

  it('menandai SN tidak valid, duplikat, dan nama kosong', () => {
    const rows = analyze(
      [c('XYZ', 'A'), c('GPON1A2B3C4D', 'B'), c('gpon1a2b3c4d', 'C'), c('ZTEGC1234567', '   ')],
      P,
      none,
    )
    expect(rows[0].ok).toBe(false)
    expect(rows[1].issues.some((i) => i.msg.includes('duplikat'))).toBe(true)
    expect(rows[2].issues.some((i) => i.msg.includes('duplikat'))).toBe(true)
    expect(rows[3].issues.some((i) => i.msg.includes('Nama'))).toBe(true)
  })

  it('menandai SN yang sudah terdaftar di OLT', () => {
    const rows = analyze([c('GPON1A2B3C4D', 'A')], P, { used: {}, sns: ['GPON1A2B3C4D'] })
    expect(rows[0].ok).toBe(false)
  })

  it('ONU ID manual yang bentrok ditolak, auto tidak ikut bentrok', () => {
    const rows = analyze(
      [c('GPON1A2B3C4D', 'A', 1, 1), c('ZTEGC1234567', 'B', 1, 1), c('GPON00000001', 'C')],
      P,
      none,
    )
    expect(rows[0].ok).toBe(false)
    expect(rows[1].ok).toBe(false)
    expect(rows[2].onuId).toBe(2)
  })

  it('PON penuh setelah 128 ONU', () => {
    const existing: ExistingConfig = { used: { '1/1': Array.from({ length: 128 }, (_, i) => i + 1) }, sns: [] }
    const rows = analyze([c('GPON1A2B3C4D', 'A')], P, existing)
    expect(rows[0].ok).toBe(false)
    expect(rows[0].issues[0].msg).toContain('penuh')
  })

  it('baris bermasalah tidak menghabiskan ONU ID', () => {
    const rows = analyze([c('BAD', 'A'), c('GPON1A2B3C4D', 'B')], P, none)
    expect(rows[1].onuId).toBe(1)
  })
})

describe('generateConfig', () => {
  it('menghasilkan config sesuai template untuk satu pelanggan', () => {
    const rows = analyze([c('GPON1A2B3C4D', 'Budi Santoso')], P, none)
    const out = generateConfig(rows, P, ZTE_TEMPLATES)
    expect(out).toBe(`configure terminal

interface gpon-olt_1/1
onu 1 type ZTE-F609 sn GPON1A2B3C4D
exit

interface gpon-onu_1/1:1
name Budi_Santoso
sn-bind enable sn
tcont 1 profile 30M
gemport 1 name Internet tcont 1
gemport 1 traffic-limit upstream 30M downstream 30M
encrypt 1 enable downstream
service-port 1 vport 1 user-vlan 444 vlan 444
service-port 1 description PPPoE
exit

pon-onu-mng gpon-onu_1/1:1
service Internet gemport 1 vlan 444
vlan port veip_1 mode hybrid
vlan port veip_1 vlan 444
security-mgmt 1 state enable mode forward protocol web http
interface wifi wifi_0/1 state unlock
exit

end
write
`)
  })

  it('header dan footer hanya muncul sekali untuk banyak pelanggan', () => {
    const rows = analyze([c('GPON1A2B3C4D', 'A'), c('ZTEGC1234567', 'B')], P, none)
    const out = generateConfig(rows, P, ZTE_TEMPLATES)
    expect(out.match(/configure terminal/g)).toHaveLength(1)
    expect(out.match(/^write$/gm)).toHaveLength(1)
    expect(out.match(/^interface gpon-olt_1\/1$/gm)).toHaveLength(2)
  })

  it('tipe ONU per vendor SN menimpa tipe umum', () => {
    const params = { ...P, typeByVendor: { VSOL: 'VSOL-V711', ZTEG: '  ' } }
    const rows = analyze([c('VSOL0033614A', 'A'), c('ZTEGC1234567', 'B')], params, none)
    const out = generateConfig(rows, params, ZTE_TEMPLATES)
    expect(out).toContain('onu 1 type VSOL-V711 sn VSOL0033614A')
    expect(out).toContain('onu 2 type ZTE-F609 sn ZTEGC1234567')
  })

  it('mengembalikan string kosong jika tidak ada baris valid', () => {
    const rows = analyze([c('BAD', 'A')], P, none)
    expect(generateConfig(rows, P, ZTE_TEMPLATES)).toBe('')
  })

  it('parameter VLAN, kecepatan, slot, dan tipe ikut berubah', () => {
    const params = { ...P, slot: 2, vlan: 100, speed: '50M', onuType: 'ZTE-F660' }
    const rows = analyze([c('GPON1A2B3C4D', 'A', 3)], params, none)
    const out = generateConfig(rows, params, ZTE_TEMPLATES)
    expect(out).toContain('interface gpon-olt_2/3')
    expect(out).toContain('onu 1 type ZTE-F660 sn GPON1A2B3C4D')
    expect(out).toContain('user-vlan 100 vlan 100')
    expect(out).toContain('tcont 1 profile 50M')
  })
})
