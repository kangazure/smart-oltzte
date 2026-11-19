import type { VercelRequest, VercelResponse } from '@vercel/node'
import { serve } from './_lib/serve.js'

export default function handler(req: VercelRequest, res: VercelResponse) {
  return serve('olts', req, res)
}
