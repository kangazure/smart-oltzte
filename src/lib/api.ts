import type { Templates } from './types'

export interface RemoteOlt {
  id: number
  name: string
  model: string | null
  ports: string[]
  importedAt: string
  onuCount: number
}

export interface RemoteOnu {
  port: string
  onuId: number
  type: string
  sn: string
  name: string | null
  vlan: number | null
  profile: string | null
  source: 'import' | 'manual' | string
}

export interface SavedTemplate extends Templates {
  name: string
  updatedAt?: string
}

export interface RemoteSettings {
  vlans?: number[]
  profiles?: string[]
  types?: string[]
  defaultTemplate?: string | null
  nameCase?: 'asis' | 'upper'
}

export interface Health {
  ok: boolean
  db: boolean
  passwordSet: boolean
  authed: boolean
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

const PW_KEY = 'olt.password'
export const getPassword = (): string => {
  try {
    return localStorage.getItem(PW_KEY) ?? ''
  } catch {
    return ''
  }
}
export const setPassword = (pw: string): void => {
  try {
    if (pw) localStorage.setItem(PW_KEY, pw)
    else localStorage.removeItem(PW_KEY)
  } catch {
    /* abaikan */
  }
}

async function call<T>(path: string, method = 'GET', body?: unknown, password = getPassword()): Promise<T> {
  const res = await fetch(`/api/${path}`, {
    method,
    headers: { 'x-app-password': password, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new ApiError(res.status, 'API tidak tersedia (bukan JSON)')
  }
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string })?.error ?? `Error ${res.status}`)
  return data as T
}

/** null = API tidak ada (mode lokal / static hosting) */
export async function fetchHealth(password = getPassword()): Promise<Health | null> {
  try {
    const h = await call<Health>('health', 'GET', undefined, password)
    return typeof h?.ok === 'boolean' && 'db' in h ? h : null
  } catch {
    return null
  }
}

export const api = {
  olts: () => call<RemoteOlt[]>('olts'),
  saveOlt: (o: { name: string; model: string | null; ports: string[]; onus: Omit<RemoteOnu, 'source'>[] }) =>
    call<{ id: number; onuCount: number }>('olts', 'POST', o),
  deleteOlt: (id: number) => call<{ ok: true }>(`olts?id=${id}`, 'DELETE'),
  onus: (olt: number) => call<RemoteOnu[]>(`onus?olt=${olt}`),
  addOnus: (olt: number, items: Omit<RemoteOnu, 'source'>[]) => call<{ added: number }>('onus', 'POST', { olt, items }),
  deleteOnu: (olt: number, port: string, id: number) =>
    call<{ ok: true }>(`onus?olt=${olt}&port=${encodeURIComponent(port)}&id=${id}`, 'DELETE'),
  templates: () => call<SavedTemplate[]>('templates'),
  saveTemplate: (t: SavedTemplate) => call<{ ok: true }>('templates', 'POST', t),
  deleteTemplate: (name: string) => call<{ ok: true }>(`templates?name=${encodeURIComponent(name)}`, 'DELETE'),
  settings: () => call<RemoteSettings>('settings'),
  saveSettings: (s: RemoteSettings) => call<{ ok: true }>('settings', 'PUT', s),
}
