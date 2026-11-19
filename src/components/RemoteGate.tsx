import { useState, type ReactNode } from 'react'
import { DatabaseZap, KeyRound, Loader2 } from 'lucide-react'
import type { Remote } from '../lib/useRemote'

/** Menampilkan isi hanya jika database terhubung dan sudah login. */
export default function RemoteGate({ remote, children }: { remote: Remote; children: ReactNode }) {
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [bad, setBad] = useState(false)

  if (remote.status === 'ok') return <>{children}</>

  if (remote.status === 'checking')
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-slate-500">
        <Loader2 className="animate-spin" size={16} /> Menghubungkan ke database…
      </div>
    )

  if (remote.status === 'login')
    return (
      <form
        className="mx-auto max-w-sm space-y-3 py-8"
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          setBad(!(await remote.login(pw)))
          setBusy(false)
        }}
      >
        <div className="flex items-center gap-2 text-sm font-semibold">
          <KeyRound size={16} /> Masuk
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Data pelanggan tersimpan di database. Masukkan password aplikasi (variabel <code>APP_PASSWORD</code> di Vercel).
        </p>
        <input className="field" type="password" autoFocus placeholder="Password" value={pw} onChange={(e) => setPw(e.target.value)} />
        {bad && <p className="text-xs text-rose-500">Password salah.</p>}
        <button className="btn-primary" disabled={!pw || busy}>
          {busy ? 'Memeriksa…' : 'Masuk'}
        </button>
      </form>
    )

  const msg =
    remote.status === 'nopass'
      ? 'Server belum punya APP_PASSWORD. Tambahkan di Vercel → Settings → Environment Variables, lalu redeploy.'
      : remote.status === 'nodb'
        ? 'Database belum terhubung. Di Vercel buka Storage, buat database Postgres (Neon), hubungkan ke project ini (variabel DATABASE_URL), lalu redeploy.'
        : 'Fitur database butuh deploy di Vercel (folder api/). Di mode lokal / hosting statis, fitur ini tidak tersedia, tab lain tetap jalan dan datanya disimpan di browser.'

  return (
    <div className="flex gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-300">
      <DatabaseZap size={18} className="mt-0.5 shrink-0" />
      <span>{msg}</span>
    </div>
  )
}
