import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS, ZTE_TEMPLATES } from './defaults'
import { analyze, generateConfig } from './generator'
import { parseExistingConfig } from './importCfg'
import type { Params } from './types'

const P: Params = { ...DEFAULT_PARAMS, slot: 1, snCase: 'upper' }

const sample = `
interface gpon-olt_1/1
  onu 1 type ZTE-F609 sn GPON1A2B3C4D
  onu 2 type ZTE-F660 sn ZTEGC1234567
exit
interface gpon-olt_1/2
  onu 5 type ZTE-F609 sn gpon0000aaaa
exit
interface gpon-onu_1/3:7
  name Seseorang
  sn-bind enable sn
exit
`

describe('parseExistingConfig', () => {
  it('mengumpulkan ONU ID terpakai per PON dan SN', () => {
    const r = parseExistingConfig(sample)
    expect(r.used['1/1']).toEqual([1, 2])
    expect(r.used['1/2']).toEqual([5])
    expect(r.used['1/3']).toEqual([7])
    expect(r.sns).toEqual(expect.arrayContaining(['GPON1A2B3C4D', 'ZTEGC1234567', 'GPON0000AAAA']))
  })

  it('hasil generate bisa dibaca balik (round trip)', () => {
    const rows = analyze(
      [{ id: '1', sn: 'GPON1A2B3C4D', name: 'Budi', pon: 1, onuId: null }],
      P,
      { used: {}, sns: [] },
    )
    const r = parseExistingConfig(generateConfig(rows, P, ZTE_TEMPLATES))
    expect(r.used['1/1']).toEqual([1])
    expect(r.sns).toEqual(['GPON1A2B3C4D'])
  })

  it('mengembalikan kosong untuk teks tanpa ONU', () => {
    expect(parseExistingConfig('hello world')).toEqual({ used: {}, sns: [], lineProfiles: [] })
  })
})
