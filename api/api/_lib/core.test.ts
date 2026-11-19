import { PGlite } from '@electric-sql/pglite'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ensureSchema, handle, type Ctx, type Db, type Resource } from './core'

let pg: PGlite
const db: Db = {
  query: async (sql, params) => ({ rows: (await pg.query(sql, params as unknown[])).rows as any[] }),
  async tx(fn) {
    await pg.exec('begin')
    try {
      const r = await fn({ query: db.query })
      await pg.exec('commit')
      return r
    } catch (e) {
      await pg.exec('rollback')
      throw e
    }
  },
}

const call = (resource: Resource, method: string, over: Partial<Ctx> = {}) =>
  handle(resource, { method, query: {}, body: undefined, password: 'rahasia', ...over }, db)

const sample = [
  { port: '1/2/1', onuId: 1, type: 'ALL', sn: 'ZTEGDBA27224', name: 'muhyana-t.harjo', vlan: 500, profile: '50M' },
  { port: '1/2/1', onuId: 2, type: 'ALL', sn: 'ZTEGD778D675', name: 'arif-t.harjo', vlan: 500, profile: '50M' },
  { port: '1/2/1', onuId: 4, type: 'F670L', sn: 'ZTEGDBA1759A', name: null, vlan: null, profile: null },
]

beforeAll(async () => {
  process.env.APP_PASSWORD = 'rahasia'
  pg = new PGlite()
  await ensureSchema(db)
})
beforeEach(async () => {
  await pg.exec('delete from olts; delete from templates; delete from settings;')
})

describe('auth', () => {
  it('health terbuka, lainnya butuh password', async () => {
    const h = await handle('health', { method: 'GET', query: {}, body: undefined, password: undefined }, db)
    expect(h.body).toMatchObject({ ok: true, db: true, passwordSet: true, authed: false })
    const r = await call('olts', 'GET', { password: 'salah' })
    expect(r.status).toBe(401)
    const none = await call('olts', 'GET', { password: undefined })
    expect(none.status).toBe(401)
  })
  it('tanpa APP_PASSWORD ditolak 503', async () => {
    delete process.env.APP_PASSWORD
    expect((await call('olts', 'GET')).status).toBe(503)
    process.env.APP_PASSWORD = 'rahasia'
  })
  it('tanpa database 503', async () => {
    const r = await handle('olts', { method: 'GET', query: {}, body: undefined, password: 'rahasia' }, null)
    expect(r.status).toBe(503)
  })
})

describe('olts + onus', () => {
  it('impor, daftar, tambah manual, konflik, hapus', async () => {
    const imp = await call('olts', 'POST', { body: { name: 'OLT-A', model: 'C320', ports: ['1/2/1', '1/2/2'], onus: sample } })
    expect(imp.status).toBe(200)
    expect(imp.body).toMatchObject({ onuCount: 3 })

    const list = (await call('olts', 'GET')).body as any[]
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ name: 'OLT-A', model: 'C320', onuCount: 3 })
    expect(list[0].ports).toEqual(['1/2/1', '1/2/2'])
    const id = list[0].id

    const rows = (await call('onus', 'GET', { query: { olt: String(id) } })).body as any[]
    expect(rows).toHaveLength(3)
    expect(rows.find((r) => r.onuId === 1)).toMatchObject({ name: 'muhyana-t.harjo', vlan: 500, profile: '50M', source: 'import' })

    const add = await call('onus', 'POST', { body: { olt: id, port: '1/2/1', onuId: 3, type: 'ALL', sn: 'ztegd5d8f864', name: 'CONTOH', vlan: 450, profile: '50M' } })
    expect(add.status).toBe(200)
    const after = (await call('onus', 'GET', { query: { olt: String(id) } })).body as any[]
    expect(after.find((r) => r.onuId === 3)).toMatchObject({ sn: 'ZTEGD5D8F864', source: 'manual', vlan: 450 })

    const clashId = await call('onus', 'POST', { body: { olt: id, port: '1/2/1', onuId: 3, sn: 'ZTEGAAAAAAAA' } })
    expect(clashId.status).toBe(409)
    const clashSn = await call('onus', 'POST', { body: { olt: id, port: '1/2/2', onuId: 1, sn: 'ZTEGD5D8F864' } })
    expect(clashSn.status).toBe(409)
    expect((clashSn.body as any).error).toContain('sudah terdaftar')
    const badSn = await call('onus', 'POST', { body: { olt: id, port: '1/2/2', onuId: 1, sn: 'XYZ' } })
    expect(badSn.status).toBe(400)
    const badId = await call('onus', 'POST', { body: { olt: id, port: '1/2/2', onuId: 129, sn: 'ZTEGAAAAAAAA' } })
    expect(badId.status).toBe(400)

    await call('onus', 'DELETE', { query: { olt: String(id), port: '1/2/1', id: '3' } })
    expect(((await call('onus', 'GET', { query: { olt: String(id) } })).body as any[]).some((r) => r.onuId === 3)).toBe(false)

    // impor ulang menimpa semuanya (termasuk catatan manual)
    await call('onus', 'POST', { body: { olt: id, port: '1/2/2', onuId: 9, sn: 'ZTEGBBBBBBBB' } })
    await call('olts', 'POST', { body: { name: 'OLT-A', model: 'C320', ports: ['1/2/1'], onus: sample.slice(0, 1) } })
    expect(((await call('onus', 'GET', { query: { olt: String(id) } })).body as any[])).toHaveLength(1)

    await call('olts', 'DELETE', { query: { id: String(id) } })
    expect(((await call('olts', 'GET')).body as any[])).toHaveLength(0)
  })

  it('menolak impor dengan ID dobel dan data rusak', async () => {
    const dup = await call('olts', 'POST', { body: { name: 'X', onus: [sample[0], sample[0]] } })
    expect(dup.status).toBe(400)
    const bad = await call('olts', 'POST', { body: { name: 'X', onus: [{ ...sample[0], sn: 'bad' }] } })
    expect(bad.status).toBe(400)
    expect((await call('olts', 'POST', { body: { name: '' } })).status).toBe(400)
  })

  it('impor besar (2000 ONU) berhasil', async () => {
    const big = Array.from({ length: 2000 }, (_, i) => ({
      port: `1/${3 + Math.floor(i / 640)}/${1 + Math.floor((i % 640) / 128)}`,
      onuId: (i % 128) + 1,
      type: 'ALL',
      sn: 'ZTEG' + i.toString(16).toUpperCase().padStart(8, '0'),
      name: `n${i}`,
      vlan: 300,
      profile: '50M',
    }))
    const r = await call('olts', 'POST', { body: { name: 'BIG', onus: big } })
    expect(r.status).toBe(200)
    expect((r.body as any).onuCount).toBe(2000)
  })
})

describe('template + pengaturan', () => {
  it('simpan, timpa, hapus template', async () => {
    const t = { name: 'ZTE-450', header: 'configure terminal', block: 'interface x', footer: 'end\nwrite' }
    expect((await call('templates', 'POST', { body: t })).status).toBe(200)
    expect((await call('templates', 'POST', { body: { ...t, block: 'interface y' } })).status).toBe(200)
    const list = (await call('templates', 'GET')).body as any[]
    expect(list).toHaveLength(1)
    expect(list[0].block).toBe('interface y')
    expect((await call('templates', 'POST', { body: { name: 'x', header: 1 } })).status).toBe(400)
    await call('templates', 'DELETE', { query: { name: 'ZTE-450' } })
    expect((await call('templates', 'GET')).body).toEqual([])
  })

  it('pengaturan VLAN dan profil', async () => {
    expect((await call('settings', 'PUT', { body: { vlans: [450, 444, 500, 200, 300], profiles: ['30M', '50M'], defaultTemplate: 'ZTE-450' } })).status).toBe(200)
    expect((await call('settings', 'GET')).body).toEqual({ vlans: [450, 444, 500, 200, 300], profiles: ['30M', '50M'], defaultTemplate: 'ZTE-450' })
    expect((await call('settings', 'PUT', { body: { vlans: [0] } })).status).toBe(400)
    expect((await call('settings', 'PUT', { body: { hacker: 1 } })).status).toBe(400)
  })
})
