import { describe, expect, it } from 'vitest'
import { parseBulk } from './parse'

describe('parseBulk', () => {
  it('membaca format koma', () => {
    const { rows } = parseBulk('GPON1A2B3C4D,Budi Santoso\nZTEGC1234567,Siti Aminah')
    expect(rows).toEqual([
      { sn: 'GPON1A2B3C4D', name: 'Budi Santoso', pon: null, onuId: null },
      { sn: 'ZTEGC1234567', name: 'Siti Aminah', pon: null, onuId: null },
    ])
  })

  it('membaca paste Excel (tab), titik koma, dan spasi', () => {
    const { rows } = parseBulk('GPON1A2B3C4D\tBudi\nZTEGC1234567;Siti\nGPON00000001 Andi Wijaya')
    expect(rows.map((r) => r.name)).toEqual(['Budi', 'Siti', 'Andi Wijaya'])
  })

  it('melewati baris header dan baris kosong', () => {
    const { rows } = parseBulk('SN,Nama\n\nGPON1A2B3C4D,Budi\n')
    expect(rows).toHaveLength(1)
  })

  it('membaca kolom PON dan ONU ID, termasuk format slot/pon', () => {
    const { rows } = parseBulk('GPON1A2B3C4D,Budi,3,10\nZTEGC1234567,Siti,1/4')
    expect(rows[0]).toMatchObject({ pon: 3, onuId: 10 })
    expect(rows[1]).toMatchObject({ pon: 4, onuId: null })
  })

  it('mendukung nama dalam tanda kutip yang mengandung koma', () => {
    const { rows } = parseBulk('GPON1A2B3C4D,"Budi, S.Kom"')
    expect(rows[0].name).toBe('Budi, S.Kom')
  })

  it('menghitung baris tanpa SN sebagai dilewati', () => {
    const { rows, skipped } = parseBulk(',Tanpa SN\nGPON1A2B3C4D,Budi')
    expect(rows).toHaveLength(1)
    expect(skipped).toBe(1)
  })
})
