import { describe, expect, it } from 'vitest'
import { parseExistingConfig } from './importCfg'
import { parseRunningConfig } from './zteRunning'

const running = `*************************************************************************
Welcome to ZXAN product C320 of ZTE Corporation
*************************************************************************
OLT-POP-PURBOLINGGO#
> show running-config

Building configuration...
!
interface gpon-olt_1/2/1
  no shutdown
  linktrap disable
  onu 1 type ALL sn ZTEGDBA27224
  onu 2 type F670L sn ZTEGD778D675
  onu 4 type ZTE-F609 sn VSOL00B32C07
!
interface gpon-olt_1/2/2
  no shutdown
!
interface gpon-onu_1/2/1:1
  name muhyana-t.harjo
  sn-bind enable sn
  tcont 1 name T profile 50M
  gemport 1 name G tcont 1
  service-port 1 vport 1 user-vlan 500 vlan 500
!
interface gpon-onu_1/2/1:2
  name arif-t.harjo
  tcont 1 profile 1G
  service-port 1 vport 1 user-vlan 450 vlan 450
!
interface gpon-onu_1/2/1:4
  sn-bind enable sn
!
pon-onu-mng gpon-onu_1/2/1:1
  service servicename gemport 1 vlan 500
`

describe('parseRunningConfig (ZTE C320/C300)', () => {
  const p = parseRunningConfig(running)
  it('membaca hostname, model, dan port termasuk yang kosong', () => {
    expect(p.hostname).toBe('OLT-POP-PURBOLINGGO')
    expect(p.model).toBe('C320')
    expect(p.ports).toEqual(['1/2/1', '1/2/2'])
  })
  it('membaca ONU lengkap dengan nama, VLAN, dan profil', () => {
    expect(p.onus).toHaveLength(3)
    expect(p.onus[0]).toEqual({ port: '1/2/1', onuId: 1, type: 'ALL', sn: 'ZTEGDBA27224', name: 'muhyana-t.harjo', vlan: 500, profile: '50M' })
    expect(p.onus[1]).toMatchObject({ onuId: 2, type: 'F670L', name: 'arif-t.harjo', vlan: 450, profile: '1G' })
  })
  it('ONU tanpa nama / VLAN / profil tetap terbaca', () => {
    expect(p.onus[2]).toMatchObject({ onuId: 4, sn: 'VSOL00B32C07', name: null, vlan: null, profile: null })
  })
  it('port diurutkan secara numerik', () => {
    const q = parseRunningConfig('interface gpon-olt_1/2/10\n  onu 1 type ALL sn ZTEGAAAAAAAA\n!\ninterface gpon-olt_1/2/2\n  onu 1 type ALL sn ZTEGBBBBBBBB\n!\n')
    expect(q.ports).toEqual(['1/2/2', '1/2/10'])
  })
  it('SN ganda dilaporkan', () => {
    const q = parseRunningConfig('interface gpon-olt_1/1/1\n  onu 1 type ALL sn ZTEGAAAAAAAA\n  onu 2 type ALL sn ZTEGAAAAAAAA\n!\n')
    expect(q.duplicateSn).toEqual(['ZTEGAAAAAAAA'])
  })
})

describe('parseExistingConfig dengan interface 3-level', () => {
  it('kunci port memuat rack/slot/pon', () => {
    const r = parseExistingConfig(running)
    expect(r.used['1/2/1']).toEqual([1, 2, 4])
    expect(r.sns).toContain('ZTEGDBA27224')
  })
})
