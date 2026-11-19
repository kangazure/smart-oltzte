/**
 * Logika API (tanpa ketergantungan Vercel) supaya bisa diuji langsung.
 * Semua endpoint kecuali /api/health butuh header x-app-password = APP_PASSWORD.
 */
import { timingSafeEqual } from 'node:crypto'

export interface Queryable {
  query(sql: string, params?: unknown[]): Promise<{ rows: any[] }>
}
export interface Db extends Queryable {
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>
}

export interface Ctx {
  method: string
  query: Record<string, string | undefined>
  body: any
  password: string | undefined
}
export interface Out {
  status: number
  body: unknown
}

const out = (status: number, body: unknown): Out => ({ status, body })
const fail = (status: number, error: string): Out => out(status, { error })

export const MAX_ONU_ID = 128
const SN_RE = /^[A-Z]{4}[0-9A-F]{8}$/
const PORT_RE = /^\d+(?:\/\d+){1,3}$/
const PROFILE_RE = /^[A-Za-z0-9_.-]{1,32}$/
const TYPE_RE = /^[A-Za-z0-9_.-]{1,32}$/

let schemaReady: Promise<void> | null = null
export function ensureSchema(db: Queryable): Promise<void> {
  schemaReady ??= (async () => {
    await db.query(`create table if not exists olts (
      id serial primary key,
      name text not null unique,
      model text,
      ports jsonb not null default '[]'::jsonb,
      imported_at timestamptz not null default now()
    )`)
    await db.query(`create table if not exists onus (
      olt_id int not null references olts(id) on delete cascade,
      port text not null,
      onu_id int not null check (onu_id between 1 and ${MAX_ONU_ID}),
      type text not null default 'ALL',
      sn text not null,
      name text,
      vlan int,
      profile text,
      source text not null default 'import',
      created_at timestamptz not null default now(),
      primary key (olt_id, port, onu_id)
    )`)
    await db.query(`create index if not exists onus_sn_idx on onus (olt_id, sn)`)
    await db.query(`create table if not exists templates (
      name text primary key,
      header text not null,
      block text not null,
      footer text not null,
      updated_at timestamptz not null default now()
    )`)
    await db.query(`create table if not exists settings (key text primary key, value jsonb not null)`)
  })().catch((e) => {
    schemaReady = null
    throw e
  })
  return schemaReady
}

function authed(ctx: Ctx): boolean {
  const expected = process.env.APP_PASSWORD
  if (!expected || !ctx.password) return false
  const a = Buffer.from(ctx.password)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

const str = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() && v.length <= max ? v.trim() : null)
const int = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) ? v : typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : null)

export interface OnuInput {
  port: string
  onuId: number
  type: string
  sn: string
  name: string | null
  vlan: number | null
  profile: string | null
}

/** Validasi satu ONU dari klien; kembalikan pesan error atau data bersih. */
export function cleanOnu(raw: any): OnuInput | string {
  const port = typeof raw?.port === 'string' ? raw.port.trim() : ''
  if (!PORT_RE.test(port)) return `Port tidak valid: ${String(raw?.port)}`
  const onuId = int(raw?.onuId)
  if (onuId == null || onuId < 1 || onuId > MAX_ONU_ID) return `ONU ID harus 1-${MAX_ONU_ID} (port ${port})`
  const sn = typeof raw?.sn === 'string' ? raw.sn.replace(/\s+/g, '').toUpperCase() : ''
  if (!SN_RE.test(sn)) return `SN tidak valid: ${String(raw?.sn)}`
  const type = typeof raw?.type === 'string' && raw.type.trim() ? raw.type.trim() : 'ALL'
  if (!TYPE_RE.test(type)) return `Tipe ONU tidak valid: ${type}`
  const name = typeof raw?.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 64) : null
  let vlan: number | null = null
  if (raw?.vlan != null && raw.vlan !== '') {
    vlan = int(raw.vlan)
    if (vlan == null || vlan < 1 || vlan > 4094) return 'VLAN harus 1-4094'
  }
  let profile: string | null = null
  if (typeof raw?.profile === 'string' && raw.profile.trim()) {
    const p: string = raw.profile.trim()
    if (!PROFILE_RE.test(p)) return `Nama profil tidak valid: ${p}`
    profile = p
  }
  return { port, onuId, type, sn, name, vlan, profile }
}

const COLS = 'olt_id,port,onu_id,type,sn,name,vlan,profile,source'

async function insertMany(q: Queryable, oltId: number, items: OnuInput[], source: string): Promise<void> {
  // dipotong per 1000 baris supaya parameter array tidak terlalu besar
  for (let i = 0; i < items.length; i += 1000) {
    const s = items.slice(i, i + 1000)
    await q.query(
      `insert into onus (${COLS})
       select $1::int, * from unnest($2::text[], $3::int[], $4::text[], $5::text[], $6::text[], $7::int[], $8::text[], $9::text[])`,
      [
        oltId,
        s.map((x) => x.port),
        s.map((x) => x.onuId),
        s.map((x) => x.type),
        s.map((x) => x.sn),
        s.map((x) => x.name),
        s.map((x) => x.vlan),
        s.map((x) => x.profile),
        s.map(() => source),
      ],
    )
  }
}

const rowToOnu = (r: any) => ({
  port: r.port as string,
  onuId: r.onu_id as number,
  type: r.type as string,
  sn: r.sn as string,
  name: (r.name ?? null) as string | null,
  vlan: (r.vlan ?? null) as number | null,
  profile: (r.profile ?? null) as string | null,
  source: r.source as string,
})

async function olts(db: Db, ctx: Ctx): Promise<Out> {
  if (ctx.method === 'GET') {
    const { rows } = await db.query(
      `select o.id, o.name, o.model, o.ports, o.imported_at, count(n.onu_id)::int as onu_count
       from olts o left join onus n on n.olt_id = o.id group by o.id order by o.name`,
    )
    return out(
      200,
      rows.map((r) => ({ id: r.id, name: r.name, model: r.model, ports: r.ports, importedAt: r.imported_at, onuCount: r.onu_count })),
    )
  }

  if (ctx.method === 'POST') {
    const name = str(ctx.body?.name, 60)
    if (!name) return fail(400, 'Nama OLT wajib diisi (maks 60 karakter)')
    const model = str(ctx.body?.model, 20)
    const ports: string[] = Array.isArray(ctx.body?.ports) ? ctx.body.ports.filter((p: unknown) => typeof p === 'string' && PORT_RE.test(p)) : []
    const rawOnus: unknown[] = Array.isArray(ctx.body?.onus) ? ctx.body.onus : []
    if (rawOnus.length > 20000) return fail(400, 'Terlalu banyak ONU dalam satu impor')

    const items: OnuInput[] = []
    const seen = new Set<string>()
    for (const r of rawOnus) {
      const c = cleanOnu(r)
      if (typeof c === 'string') return fail(400, c)
      const k = `${c.port}:${c.onuId}`
      if (seen.has(k)) return fail(400, `ONU ${k} muncul dua kali`)
      seen.add(k)
      items.push(c)
    }
    const portSet = [...new Set([...ports, ...items.map((i) => i.port)])]

    const id = await db.tx(async (q) => {
      const o = await q.query(
        `insert into olts (name, model, ports, imported_at) values ($1, $2, $3::jsonb, now())
         on conflict (name) do update set model = excluded.model, ports = excluded.ports, imported_at = now()
         returning id`,
        [name, model, JSON.stringify(portSet)],
      )
      const oltId = o.rows[0].id as number
      await q.query('delete from onus where olt_id = $1', [oltId])
      await insertMany(q, oltId, items, 'import')
      return oltId
    })
    return out(200, { id, name, onuCount: items.length })
  }

  if (ctx.method === 'DELETE') {
    const id = int(ctx.query.id)
    if (id == null) return fail(400, 'id wajib')
    await db.query('delete from olts where id = $1', [id])
    return out(200, { ok: true })
  }
  return fail(405, 'Method tidak didukung')
}

async function onus(db: Db, ctx: Ctx): Promise<Out> {
  const oltId = int(ctx.query.olt ?? ctx.body?.olt)
  if (oltId == null) return fail(400, 'Parameter olt wajib')

  if (ctx.method === 'GET') {
    const { rows } = await db.query(
      `select port, onu_id, type, sn, name, vlan, profile, source from onus where olt_id = $1`,
      [oltId],
    )
    return out(200, rows.map(rowToOnu))
  }

  if (ctx.method === 'POST') {
    const list: unknown[] = Array.isArray(ctx.body?.items) ? ctx.body.items : [ctx.body]
    if (list.length === 0 || list.length > 500) return fail(400, 'Jumlah ONU harus 1-500')
    const items: OnuInput[] = []
    for (const r of list) {
      const c = cleanOnu(r)
      if (typeof c === 'string') return fail(400, c)
      items.push(c)
    }
    const exists = await db.query('select 1 from olts where id = $1', [oltId])
    if (exists.rows.length === 0) return fail(404, 'OLT tidak ditemukan')

    try {
      await db.tx(async (q) => {
        for (const c of items) {
          const clash = await q.query('select sn from onus where olt_id = $1 and port = $2 and onu_id = $3', [oltId, c.port, c.onuId])
          if (clash.rows.length) throw new ClientError(409, `ONU ID ${c.onuId} di port ${c.port} sudah dipakai (${clash.rows[0].sn})`)
          const dup = await q.query('select port, onu_id from onus where olt_id = $1 and sn = $2 limit 1', [oltId, c.sn])
          if (dup.rows.length) throw new ClientError(409, `SN ${c.sn} sudah terdaftar di port ${dup.rows[0].port} ONU ${dup.rows[0].onu_id}`)
        }
        await insertMany(q, oltId, items, 'manual')
      })
    } catch (e) {
      if (e instanceof ClientError) return fail(e.status, e.message)
      throw e
    }
    return out(200, { ok: true, added: items.length })
  }

  if (ctx.method === 'DELETE') {
    const port = ctx.query.port
    const id = int(ctx.query.id)
    if (!port || !PORT_RE.test(port) || id == null) return fail(400, 'port dan id wajib')
    await db.query('delete from onus where olt_id = $1 and port = $2 and onu_id = $3', [oltId, port, id])
    return out(200, { ok: true })
  }
  return fail(405, 'Method tidak didukung')
}

class ClientError extends Error {
  status: number
  constructor(status: number, msg: string) {
    super(msg)
    this.status = status
  }
}

async function templates(db: Db, ctx: Ctx): Promise<Out> {
  if (ctx.method === 'GET') {
    const { rows } = await db.query('select name, header, block, footer, updated_at from templates order by name')
    return out(200, rows.map((r) => ({ name: r.name, header: r.header, block: r.block, footer: r.footer, updatedAt: r.updated_at })))
  }
  if (ctx.method === 'POST') {
    const name = str(ctx.body?.name, 60)
    const { header, block, footer } = ctx.body ?? {}
    if (!name) return fail(400, 'Nama template wajib (maks 60 karakter)')
    if (typeof header !== 'string' || typeof block !== 'string' || typeof footer !== 'string') return fail(400, 'header, block, footer harus teks')
    if (header.length + block.length + footer.length > 20000) return fail(400, 'Template terlalu panjang')
    await db.query(
      `insert into templates (name, header, block, footer, updated_at) values ($1,$2,$3,$4, now())
       on conflict (name) do update set header = excluded.header, block = excluded.block, footer = excluded.footer, updated_at = now()`,
      [name, header, block, footer],
    )
    return out(200, { ok: true })
  }
  if (ctx.method === 'DELETE') {
    const name = ctx.query.name
    if (!name) return fail(400, 'name wajib')
    await db.query('delete from templates where name = $1', [name])
    return out(200, { ok: true })
  }
  return fail(405, 'Method tidak didukung')
}

const intList = (v: unknown, lo: number, hi: number): number[] | null =>
  Array.isArray(v) && v.length <= 30 && v.every((x) => Number.isInteger(x) && x >= lo && x <= hi) ? [...new Set(v as number[])] : null
const strList = (v: unknown): string[] | null =>
  Array.isArray(v) && v.length <= 40 && v.every((x) => typeof x === 'string' && PROFILE_RE.test(x)) ? [...new Set(v as string[])] : null

const SETTINGS: Record<string, (v: unknown) => unknown | undefined> = {
  vlans: (v) => intList(v, 1, 4094) ?? undefined,
  profiles: (v) => strList(v) ?? undefined,
  types: (v) => strList(v) ?? undefined,
  defaultTemplate: (v) => (v === null || (typeof v === 'string' && v.length <= 60) ? v : undefined),
  nameCase: (v) => (v === 'asis' || v === 'upper' ? v : undefined),
}

async function settings(db: Db, ctx: Ctx): Promise<Out> {
  if (ctx.method === 'GET') {
    const { rows } = await db.query('select key, value from settings')
    return out(200, Object.fromEntries(rows.map((r) => [r.key, r.value])))
  }
  if (ctx.method === 'PUT') {
    const body = ctx.body ?? {}
    for (const [k, v] of Object.entries(body)) {
      const check = SETTINGS[k]
      if (!check) return fail(400, `Pengaturan tidak dikenal: ${k}`)
      const clean = check(v)
      if (clean === undefined) return fail(400, `Nilai ${k} tidak valid`)
      await db.query(
        `insert into settings (key, value) values ($1, $2::jsonb) on conflict (key) do update set value = excluded.value`,
        [k, JSON.stringify(clean)],
      )
    }
    return out(200, { ok: true })
  }
  return fail(405, 'Method tidak didukung')
}

export type Resource = 'health' | 'olts' | 'onus' | 'templates' | 'settings'

export async function handle(resource: Resource, ctx: Ctx, db: Db | null): Promise<Out> {
  if (resource === 'health') {
    return out(200, { ok: true, db: db !== null, passwordSet: !!process.env.APP_PASSWORD, authed: authed(ctx) })
  }
  if (!process.env.APP_PASSWORD) return fail(503, 'APP_PASSWORD belum diatur di environment variables')
  if (!authed(ctx)) return fail(401, 'Password salah atau belum diisi')
  if (!db) return fail(503, 'Database belum terhubung (DATABASE_URL kosong)')

  await ensureSchema(db)
  switch (resource) {
    case 'olts':
      return olts(db, ctx)
    case 'onus':
      return onus(db, ctx)
    case 'templates':
      return templates(db, ctx)
    case 'settings':
      return settings(db, ctx)
  }
}
