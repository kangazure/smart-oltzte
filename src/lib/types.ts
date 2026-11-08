export interface Customer {
  id: string
  sn: string
  name: string
  pon: number
  /** null = ONU ID dipilih otomatis */
  onuId: number | null
}

export interface Params {
  slot: number
  pon: number
  onuType: string
  vlan: number
  speed: string
  startOnuId: number
  /** nama line profile OLT (template VSOL), mis. line_1 */
  lineProfile: string
  /** 'olt' = ZTEGdc79ec52 (seperti tampilan OLT), 'upper' = ZTEGDC79EC52 */
  snCase: 'olt' | 'upper'
  /** tipe ONU per 4 huruf awal SN (mis. VSOL -> nama tipe di OLT); kosong = pakai onuType */
  typeByVendor?: Record<string, string>
}

export interface Templates {
  header: string
  block: string
  footer: string
}

/** key "slot/pon" -> daftar ONU ID yang sudah terpakai */
export type UsedMap = Record<string, number[]>

export interface ExistingConfig {
  used: UsedMap
  sns: string[]
  lineProfiles?: string[]
}

export interface Issue {
  level: 'error' | 'warn'
  msg: string
}

export interface AnalyzedRow {
  customer: Customer
  sn: string
  cleanName: string
  onuId: number | null
  issues: Issue[]
  ok: boolean
}

export interface HistoryItem {
  id: string
  at: number
  count: number
  config: string
  customers: Customer[]
  params: Params
  templates: Templates
}

export type ToastType = 'ok' | 'err' | 'info'
export type Notify = (text: string, type?: ToastType) => void
