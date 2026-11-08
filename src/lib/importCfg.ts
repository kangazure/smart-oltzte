import type { ExistingConfig } from './types'

/**
 * Baca config OLT yang sudah ada (backup / show running-config) dan kumpulkan
 * ONU ID yang terpakai per "slot/pon", SN yang sudah terdaftar, dan nama line profile.
 *
 * Format yang dikenali:
 * - VSOL: `interface gpon 0/1` lalu `onu add <id> profile <p> sn <SN>`
 * - ZTE : `interface gpon-olt_1/1` lalu `onu <id> type <T> sn <SN>`, atau `interface gpon-onu_1/1:<id>`
 */
export function parseExistingConfig(text: string): ExistingConfig {
  const used = new Map<string, Set<number>>()
  const sns = new Set<string>()
  const lineProfiles = new Set<string>()
  let current: string | null = null

  const mark = (key: string, id: number) => {
    let s = used.get(key)
    if (!s) {
      s = new Set()
      used.set(key, s)
    }
    s.add(id)
  }

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('!')) continue

    // VSOL: interface gpon 0/1
    const vsolPort = /^interface\s+gpon\s+(\d+)\/(\d+)\s*$/i.exec(line)
    if (vsolPort) {
      current = `${Number(vsolPort[1])}/${Number(vsolPort[2])}`
      continue
    }

    // ZTE: interface gpon-olt_1/1
    const olt = /^interface\s+gpon-olt_(\d+)\/(\d+)/i.exec(line)
    if (olt) {
      current = `${Number(olt[1])}/${Number(olt[2])}`
      continue
    }

    const onuIface = /^interface\s+gpon-onu_(\d+)\/(\d+):(\d+)/i.exec(line)
    if (onuIface) {
      mark(`${Number(onuIface[1])}/${Number(onuIface[2])}`, Number(onuIface[3]))
      current = null
      continue
    }

    // VSOL: profile line id 1 name line_1
    const lp = /^profile\s+line\s+id\s+\d+\s+name\s+(\S+)/i.exec(line)
    if (lp) {
      lineProfiles.add(lp[1])
      current = null
      continue
    }

    if (/^(interface|pon-onu-mng)\b/i.test(line) || /^exit\b/i.test(line)) {
      current = null
      continue
    }

    if (!current) continue

    // VSOL: onu add 1 profile default sn ZTEGdc79ec52
    const vsolOnu = /^onu\s+add\s+(\d+)\b(?:.*?\bsn\s+(\S+))?/i.exec(line)
    if (vsolOnu) {
      mark(current, Number(vsolOnu[1]))
      if (vsolOnu[2]) sns.add(vsolOnu[2].toUpperCase())
      continue
    }

    // ZTE: onu 1 type ZTE-F609 sn GPON1A2B3C4D
    const zteOnu = /^onu\s+(\d+)\s+type\s+\S+.*?\bsn\s+(\S+)/i.exec(line)
    if (zteOnu) {
      mark(current, Number(zteOnu[1]))
      sns.add(zteOnu[2].toUpperCase())
    }
  }

  const out: Record<string, number[]> = {}
  for (const [k, set] of used) out[k] = [...set].sort((a, b) => a - b)
  return { used: out, sns: [...sns], lineProfiles: [...lineProfiles] }
}
