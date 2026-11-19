import pg from 'pg'
import type { Db, Queryable } from './core.js'

let pool: pg.Pool | null = null

/** Koneksi Postgres dari DATABASE_URL (Neon / Supabase / Postgres lain). Null jika belum diatur. */
export function getDb(): Db | null {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL
  if (!url) return null
  pool ??= new pg.Pool({ connectionString: url, max: 3, idleTimeoutMillis: 10_000 })
  const p = pool
  return {
    query: (sql, params) => p.query(sql, params as unknown[]),
    async tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T> {
      const c = await p.connect()
      try {
        await c.query('begin')
        const r = await fn({ query: (sql, params) => c.query(sql, params as unknown[]) })
        await c.query('commit')
        return r
      } catch (e) {
        await c.query('rollback').catch(() => undefined)
        throw e
      } finally {
        c.release()
      }
    },
  }
}
