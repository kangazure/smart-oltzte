import { MAX_ONU_PER_PON } from './generator'
import type { RemoteOnu } from './api'
import type { ExistingConfig } from './types'

/** Ubah daftar ONU dari database menjadi ExistingConfig (ID terpakai per port, SN terdaftar, profil). */
export function toExisting(onus: RemoteOnu[]): ExistingConfig {
  const used: Record<string, number[]> = {}
  const sns = new Set<string>()
  const profiles = new Set<string>()
  for (const o of onus) {
    ;(used[o.port] ??= []).push(o.onuId)
    sns.add(o.sn)
    if (o.profile) profiles.add(o.profile)
  }
  for (const k of Object.keys(used)) used[k].sort((a, b) => a - b)
  return { used, sns: [...sns], lineProfiles: [...profiles] }
}

/** Ringkasan satu port: berapa ID terpakai dan ID kosong pertama. */
export function portStats(onus: RemoteOnu[], port: string): { used: number; free: number; firstFree: number | null } {
  const set = new Set<number>()
  for (const o of onus) if (o.port === port) set.add(o.onuId)
  let first: number | null = null
  for (let i = 1; i <= MAX_ONU_PER_PON; i++)
    if (!set.has(i)) {
      first = i
      break
    }
  return { used: set.size, free: MAX_ONU_PER_PON - set.size, firstFree: first }
}

/** "1/2/1" -> { slot: "1/2", pon: 1 } */
export function splitPort(port: string): { slot: string; pon: number } {
  const i = port.lastIndexOf('/')
  return { slot: port.slice(0, i), pon: Number(port.slice(i + 1)) }
}
