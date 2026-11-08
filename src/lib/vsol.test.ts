import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS, DEFAULT_TEMPLATES } from './defaults'
import { analyze, generateConfig } from './generator'
import { parseExistingConfig } from './importCfg'
import type { Customer } from './types'

// cuplikan format backup OLT VSOL (CRLF), data contoh
const backup = [
  '!',
  'hostname test-olt',
  'profile line id 1 name line_1',
  '  tcont 1 name T1 dba default1',
  'commit',
  'exit',
  '!',
  'interface gpon 0/1',
  '  no shutdown',
  'exit',
  '!',
  'interface gpon 0/1',
  '  onu auto-learn',
  '  onu add 1 profile default sn ZTEGdc79ec52',
  '  onu 1 desc budi-sb11',
  '  onu 1 profile line name line_1',
  '  onu add 3 profile default sn VSOL0033614a',
  '  onu 3 desc ari-sb10',
  '  onu 3 profile line name line_1',
  '  onu 3 pri equid VSOLV711',
  'exit',
  '!',
  'interface gpon 0/2',
  '  onu add 1 profile default sn ZTEGd336c732',
  '  onu 1 desc misinah',
  'exit',
  '!',
].join('\r\n')

const c = (sn: string, name: string, pon = 1): Customer => ({ id: sn + name, sn, name, pon, onuId: null })

describe('format VSOL', () => {
  it('membaca backup: ONU ID terpakai, SN, dan line profile', () => {
    const r = parseExistingConfig(backup)
    expect(r.used).toEqual({ '0/1': [1, 3], '0/2': [1] })
    expect(r.sns.sort()).toEqual(['VSOL0033614A', 'ZTEGD336C732', 'ZTEGDC79EC52'])
    expect(r.lineProfiles).toEqual(['line_1'])
  })

  it('template bawaan menghasilkan sintaks VSOL dan mengisi ID kosong', () => {
    const existing = parseExistingConfig(backup)
    const rows = analyze([c('ZTEGC1234567', 'Budi Santoso')], DEFAULT_PARAMS, existing)
    expect(rows[0].onuId).toBe(2)
    expect(generateConfig(rows, DEFAULT_PARAMS, DEFAULT_TEMPLATES)).toBe(`configure terminal

interface gpon 0/1
onu add 2 profile default sn ZTEGc1234567
onu 2 desc Budi_Santoso
onu 2 profile line name line_1
exit

end
write
`)
  })

  it('SN yang sudah ada di backup ditolak walau huruf besar/kecil beda', () => {
    const existing = parseExistingConfig(backup)
    const rows = analyze([c('ZTEGDC79EC52', 'Dobel')], DEFAULT_PARAMS, existing)
    expect(rows[0].ok).toBe(false)
    expect(rows[0].issues[0].msg).toContain('sudah terdaftar')
  })

  it('opsi huruf SN kapital semua', () => {
    const params = { ...DEFAULT_PARAMS, snCase: 'upper' as const }
    const rows = analyze([c('ZTEGC1234567', 'A')], params, { used: {}, sns: [] })
    expect(generateConfig(rows, params, DEFAULT_TEMPLATES)).toContain('sn ZTEGC1234567')
  })

  it('hasil generate bisa dibaca balik', () => {
    const rows = analyze([c('ZTEGC1234567', 'A', 4)], DEFAULT_PARAMS, { used: {}, sns: [] })
    const r = parseExistingConfig(generateConfig(rows, DEFAULT_PARAMS, DEFAULT_TEMPLATES))
    expect(r.used).toEqual({ '0/4': [1] })
    expect(r.sns).toEqual(['ZTEGC1234567'])
  })
})
