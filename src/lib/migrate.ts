import { normalizeSn } from './sn'

export type SourceKind = 'vsol' | 'generic'

/** Satu ONU yang dibaca dari backup OLT lama. */
export interface SourceOnu {
  sn: string
  name: string
  /** port asal, mis. "0/1" */
  port: string
  onuId: number | null
}

export interface ParsedBackup {
  kind: SourceKind
  onus: SourceOnu[]
  /** ONU yang ada di config tapi tanpa SN (mis. auth pakai password / MAC) */
  noSn: number
}

const portNum = (p: string): number[] => p.split('/').map(Number)
const byPortThenId = (a: SourceOnu, b: SourceOnu): number => {
  const pa = portNum(a.port)
  const pb = portNum(b.port)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d
  }
  return (a.onuId ?? 0) - (b.onuId ?? 0)
}

/** Backup VSOL: `interface gpon 0/1` + `onu add <id> ... sn <SN>` + `onu <id> desc <nama>` */
export function detectKind(text: string): SourceKind {
  return /^\s*interface\s+gpon\s+\d+\/\d+/im.test(text) && /^\s*onu\s+add\s+\d+\b/im.test(text) ? 'vsol' : 'generic'
}

export function parseVsol(text: string): ParsedBackup {
  const map = new Map<string, SourceOnu>()
  let port: string | null = null

  const get = (id: number): SourceOnu => {
    const key = `${port}:${id}`
    let o = map.get(key)
    if (!o) {
      o = { sn: '', name: '', port: port as string, onuId: id }
      map.set(key, o)
    }
    return o
  }

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('!')) continue

    const p = /^interface\s+gpon\s+(\d+)\/(\d+)\s*$/i.exec(line)
    if (p) {
      port = `${Number(p[1])}/${Number(p[2])}`
      continue
    }
    if (/^(interface|exit|profile|commit)\b/i.test(line)) {
      port = null
      continue
    }
    if (!port) continue

    const add = /^onu\s+add\s+(\d+)\b(.*)$/i.exec(line)
    if (add) {
      const o = get(Number(add[1]))
      const sn = /\bsn\s+(\S+)/i.exec(add[2])
      if (sn) o.sn = normalizeSn(sn[1])
      continue
    }

    const desc = /^onu\s+(\d+)\s+desc(?:ription)?\s+(.+)$/i.exec(line)
    if (desc) {
      get(Number(desc[1])).name = desc[2].trim().replace(/^"(.*)"$/, '$1')
    }
  }

  const all = [...map.values()]
  const onus = all.filter((o) => o.sn).sort(byPortThenId)
  return { kind: 'vsol', onus, noSn: all.length - onus.length }
}

// ---------------------------------------------------------------------------
// Parser umum (perkiraan) untuk OLT lain, mis. OLT "Global".
// Mencari token SN (4 huruf + 8 hex) lalu nama di baris yang sama atau beberapa
// baris sesudahnya (kata kunci name / desc / description / alias / remark).
// ---------------------------------------------------------------------------

const SN_TOKEN = /\b([A-Za-z]{4}[0-9A-Fa-f]{8})\b/g
const NAME_KEY = /\b(?:name|desc|descr|description|alias|remark|label)\b\s*[:=]?\s*"?([^"\r\n]+?)"?\s*$/i
const PORT_RE = /^\s*interface\s+(?:epon|gpon)[-_ ]?(?:olt|onu)?[-_ ]?(\d+(?:\/\d+){1,2})/i
const ONU_ID_RES = [/\bonu\s+(?:add\s+)?(\d+)\b/i, /\bgpon-onu_\d+\/\d+(?:\/\d+)?:(\d+)/i, /\bont\s+(?:add\s+)?(?:\d+\s+){0,2}(\d+)\b/i]

function snTokens(line: string): string[] {
  const out: string[] = []
  for (const m of line.matchAll(SN_TOKEN)) {
    // SN asli hampir selalu memuat angka; ini membuang kata biasa yang kebetulan 12 huruf
    if (/\d/.test(m[1].slice(4))) out.push(m[1])
  }
  return out
}

function nameFromLine(line: string): string {
  const cleaned = line
    .replace(/\bprofile\s+(?:line|service|srv|dba|traffic)?\s*name\s+\S+/gi, ' ')
    .replace(/\b(?:tcont|gemport)\b.*$/i, '')
  const m = NAME_KEY.exec(cleaned)
  if (!m) return ''
  return m[1]
    .replace(SN_TOKEN, '')
    .replace(/\bsn(?:-auth)?\b\s*$/i, '')
    .trim()
}

export function parseGeneric(text: string): ParsedBackup {
  const lines = text.split(/\r?\n/)
  const seen = new Set<string>()
  const onus: SourceOnu[] = []
  let port = '0/0'

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const pm = PORT_RE.exec(line)
    if (pm) port = pm[1]

    const tokens = snTokens(line)
    if (tokens.length === 0) continue

    let onuId: number | null = null
    for (const re of ONU_ID_RES) {
      const m = re.exec(line)
      if (m) {
        onuId = Number(m[1])
        break
      }
    }

    let name = nameFromLine(line)
    if (!name) {
      for (let j = i + 1; j < Math.min(lines.length, i + 9); j++) {
        const nx = lines[j]
        if (snTokens(nx).length > 0 || /^\s*(exit|!)/i.test(nx) || PORT_RE.test(nx)) break
        const n = nameFromLine(nx)
        if (n) {
          name = n
          break
        }
      }
    }

    const sn = normalizeSn(tokens[0])
    if (seen.has(sn)) continue
    seen.add(sn)
    onus.push({ sn, name, port, onuId })
  }

  return { kind: 'generic', onus: onus.sort(byPortThenId), noSn: 0 }
}

export function parseBackup(text: string, kind: 'auto' | SourceKind): ParsedBackup {
  const k = kind === 'auto' ? detectKind(text) : kind
  return k === 'vsol' ? parseVsol(text) : parseGeneric(text)
}
