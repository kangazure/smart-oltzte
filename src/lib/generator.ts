import { isValidSn, normalizeSn } from './sn'
import type { AnalyzedRow, Customer, ExistingConfig, Issue, Params, Templates } from './types'

export const MAX_ONU_PER_PON = 128

export const ponKey = (slot: number, pon: number): string => `${slot}/${pon}`

/** 'olt' = vendor kapital + hex huruf kecil (seperti tampilan OLT VSOL); 'upper' = kapital semua. */
export function formatSn(sn: string, mode: Params['snCase']): string {
  return mode === 'olt' ? sn.slice(0, 4) + sn.slice(4).toLowerCase() : sn
}

/** Bersihkan nama agar aman dipakai di CLI: tanpa aksen/simbol, spasi jadi underscore, maks 32 karakter. */
export function sanitizeName(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^A-Za-z0-9_.-]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32)
}

/** Validasi tiap pelanggan dan tentukan ONU ID (auto-increment per PON, melewati ID yang sudah terpakai). */
export function analyze(customers: Customer[], params: Params, existing: ExistingConfig): AnalyzedRow[] {
  const upper = params.nameCase === 'upper'
  const rows: AnalyzedRow[] = customers.map((customer) => {
    const name = sanitizeName(customer.name)
    return {
      customer,
      sn: normalizeSn(customer.sn),
      cleanName: upper ? name.toUpperCase() : name,
      onuId: null,
      issues: [],
      ok: true,
    }
  })

  const snCount = new Map<string, number>()
  for (const r of rows) if (r.sn) snCount.set(r.sn, (snCount.get(r.sn) ?? 0) + 1)
  const existingSn = new Set(existing.sns)

  const taken = new Map<number, Set<number>>()
  const manualCount = new Map<string, number>()
  const setFor = (pon: number): Set<number> => {
    let s = taken.get(pon)
    if (!s) {
      s = new Set(existing.used[ponKey(params.slot, pon)] ?? [])
      taken.set(pon, s)
    }
    return s
  }

  // Pass 1: cadangkan ONU ID manual supaya tidak bentrok dengan penomoran otomatis
  for (const r of rows) {
    const { pon, onuId } = r.customer
    if (onuId != null) {
      setFor(pon).add(onuId)
      const k = `${pon}:${onuId}`
      manualCount.set(k, (manualCount.get(k) ?? 0) + 1)
    }
  }

  // Pass 2: validasi + penomoran
  for (const r of rows) {
    const c = r.customer
    const add = (level: Issue['level'], msg: string) => r.issues.push({ level, msg })

    if (!r.sn) {
      add('error', 'SN kosong')
    } else {
      if (!isValidSn(r.sn)) add('error', 'Format SN tidak valid (4 huruf + 8 hex)')
      if ((snCount.get(r.sn) ?? 0) > 1) add('error', 'SN duplikat di daftar')
      if (existingSn.has(r.sn)) add('error', 'SN sudah terdaftar di OLT')
    }

    if (!r.cleanName) add('error', 'Nama kosong / tidak valid')
    else if (sanitizeName(c.name) !== c.name.trim().replace(/\s+/g, '_')) add('warn', `Nama disesuaikan: ${r.cleanName}`)

    if (!Number.isInteger(c.pon) || c.pon < 1) add('error', 'PON tidak valid')

    if (c.onuId != null) {
      if (c.onuId < 1 || c.onuId > MAX_ONU_PER_PON) {
        add('error', `ONU ID harus 1-${MAX_ONU_PER_PON}`)
      } else if ((manualCount.get(`${c.pon}:${c.onuId}`) ?? 0) > 1) {
        add('error', 'ONU ID duplikat di PON yang sama')
      } else if (existing.used[ponKey(params.slot, c.pon)]?.includes(c.onuId)) {
        add('error', 'ONU ID sudah dipakai di OLT')
      } else if (!r.issues.some((i) => i.level === 'error')) {
        r.onuId = c.onuId
      }
    } else if (!r.issues.some((i) => i.level === 'error')) {
      const set = setFor(c.pon)
      let id = Math.max(1, params.startOnuId)
      while (set.has(id)) id++
      if (id > MAX_ONU_PER_PON) {
        add('error', `PON ${c.pon} penuh (maks ${MAX_ONU_PER_PON} ONU)`)
      } else {
        r.onuId = id
        set.add(id)
      }
    }

    r.ok = !r.issues.some((i) => i.level === 'error') && r.onuId != null
  }

  return rows
}

/** Ganti placeholder <NAMA> dengan nilainya; placeholder tak dikenal dibiarkan apa adanya. */
export function render(tpl: string, vars: Record<string, string | number>): string {
  return tpl.replace(/<([A-Z_]+)>/g, (m, key: string) => (key in vars ? String(vars[key]) : m))
}

const clean = (s: string): string => s.replace(/\r\n/g, '\n').replace(/^\n+/, '').replace(/\s+$/, '')

/** Susun config akhir: header + satu blok per pelanggan valid + footer. */
export function generateConfig(rows: AnalyzedRow[], params: Params, templates: Templates): string {
  const ok = rows.filter((r) => r.ok && r.onuId != null)
  if (ok.length === 0) return ''

  const base = {
    SLOT: params.slot,
    PON: params.pon,
    TYPE: params.onuType,
    VLAN: params.vlan,
    SPEED: params.speed,
    LINE_PROFILE: params.lineProfile,
  }

  const parts: string[] = [render(clean(templates.header), base)]
  for (const r of ok) {
    parts.push(
      render(clean(templates.block), {
        ...base,
        PON: r.customer.pon,
        ONU_ID: r.onuId as number,
        SN: formatSn(r.sn, params.snCase),
        TYPE: params.typeByVendor?.[r.sn.slice(0, 4)]?.trim() || params.onuType,
        CUSTOMER_NAME: r.cleanName,
      }),
    )
  }
  parts.push(render(clean(templates.footer), base))

  return parts.filter((p) => p.length > 0).join('\n\n') + '\n'
}

// ---------------------------------------------------------------------------
// Output per PON, dipecah per N pelanggan
// ---------------------------------------------------------------------------

export interface OutputFile {
  id: string
  /** nama file tanpa ekstensi */
  name: string
  pon: number
  part: number
  parts: number
  count: number
  minId: number
  maxId: number
  config: string
}

/** Pelanggan valid dikelompokkan per PON, urut ONU ID. */
export function groupByPon(rows: AnalyzedRow[]): Map<number, AnalyzedRow[]> {
  const map = new Map<number, AnalyzedRow[]>()
  for (const r of rows) {
    if (!r.ok || r.onuId == null) continue
    const list = map.get(r.customer.pon)
    if (list) list.push(r)
    else map.set(r.customer.pon, [r])
  }
  for (const list of map.values()) list.sort((a, b) => (a.onuId as number) - (b.onuId as number))
  return new Map([...map.entries()].sort((a, b) => a[0] - b[0]))
}

/**
 * Buat daftar file config.
 * scope: nomor PON, atau 'all' untuk semua PON. chunk: jumlah pelanggan per file, atau 'all' untuk satu file per PON.
 * Tiap file lengkap dengan header dan footer, jadi bisa langsung dipaste sendiri-sendiri.
 */
export function buildFiles(
  rows: AnalyzedRow[],
  params: Params,
  templates: Templates,
  scope: number | 'all',
  chunk: number | 'all',
): OutputFile[] {
  const files: OutputFile[] = []
  const size = chunk === 'all' ? Number.MAX_SAFE_INTEGER : Math.max(1, Math.floor(chunk))

  for (const [pon, list] of groupByPon(rows)) {
    if (scope !== 'all' && scope !== pon) continue
    const parts = Math.ceil(list.length / size)
    const width = String(parts).length
    for (let p = 0; p < parts; p++) {
      const slice = list.slice(p * size, p * size + size)
      const minId = slice[0].onuId as number
      const maxId = slice[slice.length - 1].onuId as number
      const name =
        parts === 1
          ? `pon-${pon}`
          : `pon-${pon}_bagian-${String(p + 1).padStart(width, '0')}-dari-${parts}_onu-${minId}-${maxId}`
      files.push({
        id: `${pon}:${p}`,
        name,
        pon,
        part: p + 1,
        parts,
        count: slice.length,
        minId,
        maxId,
        config: generateConfig(slice, { ...params, pon }, templates),
      })
    }
  }
  return files
}
