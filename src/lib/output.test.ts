import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS, ZTE_TEMPLATES } from './defaults'
import { analyze, buildFiles, groupByPon } from './generator'
import type { Customer, Params } from './types'
import { crc32, makeZip } from './zip'

const P: Params = { ...DEFAULT_PARAMS, slot: 1, snCase: 'upper' }
const sn = (i: number) => `ZTEG${String(i).padStart(8, '0')}`
const make = (n: number, pon: number, from = 0): Customer[] =>
  Array.from({ length: n }, (_, i) => ({ id: `${pon}-${from + i}`, sn: sn(pon * 1000 + from + i), name: `Pelanggan ${from + i}`, pon, onuId: null }))
const none = { used: {}, sns: [] }

describe('nama huruf besar', () => {
  it('mengubah nama jadi kapital tanpa memunculkan peringatan palsu', () => {
    const rows = analyze(make(1, 1), { ...P, nameCase: 'upper' }, none)
    expect(rows[0].cleanName).toBe('PELANGGAN_0')
    expect(rows[0].issues).toEqual([])
  })
  it('bawaan tetap apa adanya', () => {
    expect(analyze(make(1, 1), P, none)[0].cleanName).toBe('Pelanggan_0')
  })
  it('muncul di config', () => {
    const rows = analyze([{ id: 'a', sn: sn(1), name: 'Budi Santoso', pon: 1, onuId: null }], { ...P, nameCase: 'upper' }, none)
    expect(buildFiles(rows, { ...P, nameCase: 'upper' }, ZTE_TEMPLATES, 'all', 'all')[0].config).toContain('name BUDI_SANTOSO')
  })
})

describe('buildFiles', () => {
  const rows = analyze([...make(25, 1), ...make(7, 2)], P, none)

  it('groupByPon mengelompokkan dan mengurutkan', () => {
    const g = groupByPon(rows)
    expect([...g.keys()]).toEqual([1, 2])
    expect(g.get(1)).toHaveLength(25)
  })

  it('satu file per PON jika chunk = all', () => {
    const f = buildFiles(rows, P, ZTE_TEMPLATES, 'all', 'all')
    expect(f.map((x) => [x.name, x.count])).toEqual([['pon-1', 25], ['pon-2', 7]])
  })

  it('PON 1 dipecah 10 pelanggan: 10, 10, 5', () => {
    const f = buildFiles(rows, P, ZTE_TEMPLATES, 1, 10)
    expect(f.map((x) => x.count)).toEqual([10, 10, 5])
    expect(f.map((x) => [x.minId, x.maxId])).toEqual([[1, 10], [11, 20], [21, 25]])
    expect(f[1].name).toBe('pon-1_bagian-2-dari-3_onu-11-20')
  })

  it('setiap file punya header, footer, dan PON yang benar', () => {
    const f = buildFiles(rows, P, ZTE_TEMPLATES, 'all', 10)
    for (const file of f) {
      expect(file.config.startsWith('configure terminal')).toBe(true)
      expect(file.config.trimEnd().endsWith('write')).toBe(true)
      expect(file.config).toContain(`interface gpon-olt_1/${file.pon}\n`)
      expect(file.config.match(/^interface gpon-olt_/gm)).toHaveLength(file.count)
    }
    expect(f).toHaveLength(3 + 1)
  })

  it('semua bagian bersama-sama memuat setiap pelanggan tepat satu kali', () => {
    const f = buildFiles(rows, P, ZTE_TEMPLATES, 'all', 20)
    const all = f.map((x) => x.config).join('\n')
    expect(all.match(/^onu \d+ type /gm)).toHaveLength(32)
  })

  it('ukuran bagian lebih besar dari jumlah pelanggan jadi satu file', () => {
    expect(buildFiles(rows, P, ZTE_TEMPLATES, 1, 50)).toHaveLength(1)
  })

  it('PON yang tidak ada menghasilkan daftar kosong', () => {
    expect(buildFiles(rows, P, ZTE_TEMPLATES, 9, 10)).toEqual([])
  })

  it('pelanggan bermasalah tidak ikut', () => {
    const r = analyze([...make(2, 1), { id: 'x', sn: 'BAD', name: 'X', pon: 1, onuId: null }], P, none)
    expect(buildFiles(r, P, ZTE_TEMPLATES, 1, 'all')[0].count).toBe(2)
  })
})

describe('zip', () => {
  it('crc32 sesuai nilai baku', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
  })
  it('struktur ZIP benar', () => {
    const z = makeZip([
      { name: 'a.cfg', text: 'halo' },
      { name: 'PON-1/b.cfg', text: 'dunia' },
    ])
    const dv = new DataView(z.buffer)
    expect(dv.getUint32(0, true)).toBe(0x04034b50)
    expect(dv.getUint32(z.length - 22, true)).toBe(0x06054b50)
    expect(dv.getUint16(z.length - 22 + 10, true)).toBe(2)
  })
})
