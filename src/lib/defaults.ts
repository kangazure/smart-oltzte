import type { Params, Templates } from './types'

export const DEFAULT_PARAMS: Params = {
  slot: 0,
  pon: 1,
  onuType: 'ZTE-F609',
  vlan: 444,
  speed: '30M',
  startOnuId: 1,
  lineProfile: 'line_1',
  snCase: 'olt',
  nameCase: 'asis',
}

/**
 * Template VSOL, disusun dari backup OLT (V1.4.8R):
 *   interface gpon 0/1
 *   onu add 1 profile default sn ZTEGdc79ec52
 *   onu 1 desc nama-pelanggan
 *   onu 1 profile line name line_1
 *   exit
 * Header / footer (configure terminal, end, write) adalah asumsi, sesuaikan dengan alur CLI OLT kamu.
 */
export const VSOL_TEMPLATES: Templates = {
  header: `configure terminal`,
  block: `interface gpon <SLOT>/<PON>
onu add <ONU_ID> profile default sn <SN>
onu <ONU_ID> desc <CUSTOMER_NAME>
onu <ONU_ID> profile line name <LINE_PROFILE>
exit`,
  footer: `end
write`,
}

/** Template ZTE (template awal dari pengguna). */
export const ZTE_TEMPLATES: Templates = {
  header: `configure terminal`,
  block: `interface gpon-olt_<SLOT>/<PON>
onu <ONU_ID> type <TYPE> sn <SN>
exit

interface gpon-onu_<SLOT>/<PON>:<ONU_ID>
name <CUSTOMER_NAME>
sn-bind enable sn
tcont 1 profile <SPEED>
gemport 1 name Internet tcont 1
gemport 1 traffic-limit upstream <SPEED> downstream <SPEED>
encrypt 1 enable downstream
service-port 1 vport 1 user-vlan <VLAN> vlan <VLAN>
service-port 1 description PPPoE
exit

pon-onu-mng gpon-onu_<SLOT>/<PON>:<ONU_ID>
service Internet gemport 1 vlan <VLAN>
vlan port veip_1 mode hybrid
vlan port veip_1 vlan <VLAN>
security-mgmt 1 state enable mode forward protocol web http
interface wifi wifi_0/1 state unlock
exit`,
  footer: `end
write`,
}

export const DEFAULT_TEMPLATES: Templates = VSOL_TEMPLATES

export interface Preset {
  id: string
  label: string
  desc: string
  templates: Templates
  params: Partial<Params>
}

export const PRESETS: Preset[] = [
  {
    id: 'vsol',
    label: 'VSOL',
    desc: 'Sesuai backup OLT: onu add, desc, profile line',
    templates: VSOL_TEMPLATES,
    params: { slot: 0, snCase: 'olt' },
  },
  {
    id: 'zte',
    label: 'ZTE',
    desc: 'Template awal: gpon-olt_, pon-onu-mng',
    templates: ZTE_TEMPLATES,
    params: { slot: 1, snCase: 'upper' },
  },
]

export const PLACEHOLDERS: { token: string; desc: string }[] = [
  { token: '<SLOT>', desc: 'Nomor slot (parameter)' },
  { token: '<PON>', desc: 'Nomor PON port pelanggan' },
  { token: '<ONU_ID>', desc: 'ONU ID (otomatis / manual)' },
  { token: '<SN>', desc: 'Serial number ONU' },
  { token: '<CUSTOMER_NAME>', desc: 'Nama pelanggan (sudah disanitasi)' },
  { token: '<LINE_PROFILE>', desc: 'Nama line profile (parameter)' },
  { token: '<TYPE>', desc: 'Tipe ONU (parameter, template ZTE)' },
  { token: '<VLAN>', desc: 'VLAN (parameter, template ZTE)' },
  { token: '<SPEED>', desc: 'Kecepatan / profile (parameter, template ZTE)' },
]
