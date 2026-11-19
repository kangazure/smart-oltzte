/**
 * Baca hasil `show running-config` OLT ZTE (C300 / C320) menjadi daftar ONU lengkap.
 *
 * Yang dibaca:
 *   interface gpon-olt_1/2/1                  -> port (rack/slot/pon)
 *     onu 1 type ALL sn ZTEGDBA27224          -> ONU ID, tipe, SN
 *   interface gpon-onu_1/2/1:1
 *     name muhyana-t.harjo                    -> nama pelanggan
 *     tcont 1 name T profile 50M              -> profil
 *     service-port 1 vport 1 user-vlan 500 .. -> VLAN
 */

export interface OltOnu {
  /** rack/slot/pon, mis. "1/2/1" */
  port: string
  onuId: number
  type: string
  sn: string
  name: string | null
  vlan: number | null
  profile: string | null
}

export interface ParsedRunning {
  hostname: string | null
  model: string | null
  /** semua port PON yang ada di config, termasuk yang kosong */
  ports: string[]
  onus: OltOnu[]
  /** jumlah SN yang muncul lebih dari sekali (di OLT yang sama) */
  duplicateSn: string[]
}

const PORT = String.raw`\d+(?:\/\d+)+`

const portOrder = (a: string, b: string): number => {
  const pa = a.split('/').map(Number)
  const pb = b.split('/').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}
export { portOrder }

export function parseRunningConfig(text: string): ParsedRunning {
  const lines = text.split(/\r?\n/)
  const hostname = /^([A-Za-z0-9._-]+)#\s*$/m.exec(text)?.[1] ?? null
  const model = /ZXAN product (\S+)/i.exec(text)?.[1] ?? null

  const ports = new Set<string>()
  const onus = new Map<string, OltOnu>()
  const key = (port: string, id: number) => `${port}:${id}`

  type Ctx = { kind: 'none' } | { kind: 'olt'; port: string } | { kind: 'onu'; port: string; id: number; gotProfile: boolean; gotVlan: boolean }
  let ctx: Ctx = { kind: 'none' }

  const reOlt = new RegExp(String.raw`^interface\s+gpon-olt_(${PORT})\s*$`, 'i')
  const reOnuIf = new RegExp(String.raw`^interface\s+gpon-onu_(${PORT}):(\d+)\s*$`, 'i')
  const reOnu = /^\s+onu\s+(\d+)\s+type\s+(\S+)\s+sn\s+(\S+)/i
  const reName = /^\s+name\s+(.+?)\s*$/i
  const reTcont = /^\s+tcont\s+\d+\s+(?:name\s+\S+\s+)?profile\s+(\S+)/i
  const reVlan = /^\s+service-port\s+\d+\s+vport\s+\d+\s+user-vlan\s+(\d+)/i

  for (const raw of lines) {
    if (raw === '' ) continue
    // baris tanpa indentasi memulai / mengakhiri blok
    if (!/^\s/.test(raw)) {
      const olt = reOlt.exec(raw)
      if (olt) {
        ctx = { kind: 'olt', port: olt[1] }
        ports.add(olt[1])
        continue
      }
      const onuIf = reOnuIf.exec(raw)
      if (onuIf) {
        ctx = { kind: 'onu', port: onuIf[1], id: Number(onuIf[2]), gotProfile: false, gotVlan: false }
        continue
      }
      ctx = { kind: 'none' }
      continue
    }

    if (ctx.kind === 'olt') {
      const m = reOnu.exec(raw)
      if (m) {
        const id = Number(m[1])
        onus.set(key(ctx.port, id), {
          port: ctx.port,
          onuId: id,
          type: m[2],
          sn: m[3].toUpperCase(),
          name: null,
          vlan: null,
          profile: null,
        })
      }
    } else if (ctx.kind === 'onu') {
      const onu = onus.get(key(ctx.port, ctx.id))
      if (!onu) continue
      const n = reName.exec(raw)
      if (n) {
        onu.name = n[1]
        continue
      }
      const t = !ctx.gotProfile ? reTcont.exec(raw) : null
      if (t) {
        onu.profile = t[1]
        ctx.gotProfile = true
        continue
      }
      const v = !ctx.gotVlan ? reVlan.exec(raw) : null
      if (v) {
        onu.vlan = Number(v[1])
        ctx.gotVlan = true
      }
    }
  }

  const list = [...onus.values()].sort((a, b) => portOrder(a.port, b.port) || a.onuId - b.onuId)
  const seen = new Set<string>()
  const dup = new Set<string>()
  for (const o of list) {
    if (seen.has(o.sn)) dup.add(o.sn)
    seen.add(o.sn)
  }
  return { hostname, model, ports: [...ports].sort(portOrder), onus: list, duplicateSn: [...dup] }
}
