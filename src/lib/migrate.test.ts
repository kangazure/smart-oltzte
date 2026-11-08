import { describe, expect, it } from 'vitest'
import { detectKind, parseBackup, parseGeneric, parseVsol } from './migrate'

const vsol = [
  '!',
  'profile line id 1 name line_1',
  '  tcont 1 name T1 dba default1',
  'exit',
  'interface gpon 0/1',
  '  onu auto-learn',
  '  onu add 1 profile default sn ZTEGdc79ec52',
  '  onu 1 desc budi-sb11',
  '  onu 1 profile line name line_1',
  '  onu add 3 profile default sn VSOL0033614a',
  '  onu 3 desc ari sb10',
  '  onu add 4 profile default pw 12345',
  'exit',
  'interface gpon 0/1',
  '  onu add 2 profile default sn ZTEGd336c732',
  'exit',
  'interface gpon 0/2',
  '  onu add 1 profile default sn ZTEGaabb0011',
  '  onu 1 desc "Siti Aminah"',
  'exit',
].join('\r\n')

describe('parseVsol', () => {
  it('membaca SN, nama, port, dan ONU ID dari backup VSOL', () => {
    const r = parseVsol(vsol)
    expect(r.onus).toEqual([
      { sn: 'ZTEGDC79EC52', name: 'budi-sb11', port: '0/1', onuId: 1 },
      { sn: 'ZTEGD336C732', name: '', port: '0/1', onuId: 2 },
      { sn: 'VSOL0033614A', name: 'ari sb10', port: '0/1', onuId: 3 },
      { sn: 'ZTEGAABB0011', name: 'Siti Aminah', port: '0/2', onuId: 1 },
    ])
  })

  it('ONU tanpa SN dihitung terpisah', () => {
    expect(parseVsol(vsol).noSn).toBe(1)
  })

  it('profile line name tidak dianggap nama pelanggan', () => {
    const r = parseVsol(vsol)
    expect(r.onus.some((o) => o.name === 'line_1')).toBe(false)
  })
})

describe('detectKind', () => {
  it('mengenali VSOL dan sisanya generic', () => {
    expect(detectKind(vsol)).toBe('vsol')
    expect(detectKind('hostname x\nonu 1 sn GPON1A2B3C4D')).toBe('generic')
  })
  it('parseBackup auto memilih parser yang sesuai', () => {
    expect(parseBackup(vsol, 'auto').kind).toBe('vsol')
    expect(parseBackup(vsol, 'generic').kind).toBe('generic')
  })
})

describe('parseGeneric', () => {
  it('nama di baris yang sama', () => {
    const r = parseGeneric('interface gpon-olt_1/2\n onu 5 sn GPON1A2B3C4D name Siti Aminah')
    expect(r.onus).toEqual([{ sn: 'GPON1A2B3C4D', name: 'Siti Aminah', port: '1/2', onuId: 5 }])
  })

  it('nama di baris sesudahnya dalam blok yang sama', () => {
    const r = parseGeneric('onu 7 sn ZTEGC1234567\n  description "Andi Wijaya"\n  vlan 100\nexit')
    expect(r.onus[0]).toMatchObject({ sn: 'ZTEGC1234567', name: 'Andi Wijaya', onuId: 7 })
  })

  it('tidak mengambil nama dari ONU berikutnya', () => {
    const r = parseGeneric('onu 1 sn ZTEGC1234567\nonu 2 sn GPON1A2B3C4D\n  name Dua')
    expect(r.onus.find((o) => o.sn === 'ZTEGC1234567')?.name).toBe('')
    expect(r.onus.find((o) => o.sn === 'GPON1A2B3C4D')?.name).toBe('Dua')
  })

  it('mengabaikan nama profile dan kata biasa', () => {
    const r = parseGeneric('onu 1 sn ZTEGC1234567\n  onu 1 profile line name line_9\n  gemport 1 name Internet tcont 1')
    expect(r.onus[0].name).toBe('')
  })

  it('SN dobel hanya diambil sekali', () => {
    const r = parseGeneric('onu 1 sn ZTEGC1234567 name A\nonu 2 sn ztegc1234567 name B')
    expect(r.onus).toHaveLength(1)
  })
})
