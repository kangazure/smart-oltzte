export interface ParsedRow {
  sn: string
  name: string
  pon: number | null
  onuId: number | null
}

const HEADER_WORDS = new Set(['sn', 'serial', 'serialnumber', 'serial number', 'sn onu', 'sn_onu', 'no sn'])

function splitQuoted(line: string, delim: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"'
        i++
      } else {
        quoted = !quoted
      }
    } else if (ch === delim && !quoted) {
      out.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out.map((s) => s.trim())
}

/** Terima "3" atau "1/3" (slot/pon) -> 3 */
function parseNum(s: string | undefined): number | null {
  if (!s) return null
  const m = /^(?:\d+\/)?(\d+)$/.exec(s.trim())
  return m ? Number(m[1]) : null
}

/**
 * Baca teks hasil paste dari Excel / CSV.
 * Format per baris: SN, Nama, [PON], [ONU ID]
 * Pemisah: tab, titik koma, pipa, koma, atau spasi (SN lalu sisanya jadi nama).
 */
export function parseBulk(text: string): { rows: ParsedRow[]; skipped: number } {
  const rows: ParsedRow[] = []
  let skipped = 0

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue

    const delim = ['\t', ';', '|', ','].find((d) => line.includes(d))
    let parts: string[]
    if (delim) {
      parts = splitQuoted(line, delim)
    } else {
      const m = /^(\S+)\s+(.+)$/.exec(line)
      parts = m ? [m[1], m[2]] : [line]
    }

    const sn = parts[0] ?? ''
    if (HEADER_WORDS.has(sn.toLowerCase())) continue
    if (!sn) {
      skipped++
      continue
    }

    rows.push({
      sn,
      name: parts[1] ?? '',
      pon: parseNum(parts[2]),
      onuId: parseNum(parts[3]),
    })
  }

  return { rows, skipped }
}
