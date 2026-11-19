import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handle, type Resource } from './core.js'
import { getDb } from './db.js'

export async function serve(resource: Resource, req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Cache-Control', 'no-store')
  try {
    const q: Record<string, string | undefined> = {}
    for (const [k, v] of Object.entries(req.query)) q[k] = Array.isArray(v) ? v[0] : v
    const header = req.headers['x-app-password']
    const result = await handle(
      resource,
      { method: req.method ?? 'GET', query: q, body: req.body, password: Array.isArray(header) ? header[0] : header },
      getDb(),
    )
    res.status(result.status).json(result.body)
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Kesalahan server' })
  }
}
