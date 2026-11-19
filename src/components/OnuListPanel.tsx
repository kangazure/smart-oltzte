import { useMemo, useState } from 'react'
import { Download, Search, Trash2 } from 'lucide-react'
import { api } from '../lib/api'
import { portStats } from '../lib/oltData'
import { MAX_ONU_PER_PON } from '../lib/generator'
import type { Notify } from '../lib/types'
import type { Remote } from '../lib/useRemote'
import { downloadText, stamp } from '../lib/util'
import { portOrder } from '../lib/zteRunning'

const PAGE = 150

export default function OnuListPanel({ remote, notify }: { remote: Remote; notify: Notify }) {
  const [port, setPort] = useState('')
  const [q, setQ] = useState('')
  const [limit, setLimit] = useState(PAGE)
  const { active, onus } = remote

  const ports = useMemo(() => [...new Set([...(active?.ports ?? []), ...onus.map((o) => o.port)])].sort(portOrder), [active, onus])

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase()
    return onus
      .filter((o) => (!port || o.port === port) && (!t || o.sn.toLowerCase().includes(t) || (o.name ?? '').toLowerCase().includes(t)))
      .sort((a, b) => portOrder(a.port, b.port) || a.onuId - b.onuId)
  }, [onus, port, q])

  if (!active) return <p className="text-sm text-slate-500">Pilih atau upload OLT dulu di tab OLT.</p>

  const stats = port ? portStats(onus, port) : null
  const freeIds = port
    ? (() => {
        const used = new Set(onus.filter((o) => o.port === port).map((o) => o.onuId))
        const f: number[] = []
        for (let i = 1; i <= MAX_ONU_PER_PON; i++) if (!used.has(i)) f.push(i)
        return f
      })()
    : []

  const exportCsv = () => {
    const esc = (v: string | number | null) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = ['port,onu_id,nama,sn,tipe,vlan,profil', ...rows.map((o) => [o.port, o.onuId, o.name, o.sn, o.type, o.vlan, o.profile].map(esc).join(','))]
    downloadText(`onu_${active.name}_${port ? port.replace(/\//g, '-') : 'semua'}_${stamp()}.csv`, lines.join('\n') + '\n', 'text/csv')
  }

  return (
    <div className="animate-fade-in space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="block min-w-[10rem] flex-1">
          <span className="label">OLT</span>
          <select className="field" value={remote.activeId ?? ''} onChange={(e) => remote.setActiveId(Number(e.target.value))}>
            {remote.olts.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name} ({o.onuCount})
              </option>
            ))}
          </select>
        </label>
        <label className="block w-32">
          <span className="label">Port</span>
          <select className="field font-mono" value={port} onChange={(e) => { setPort(e.target.value); setLimit(PAGE) }}>
            <option value="">Semua</option>
            {ports.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="relative block min-w-[10rem] flex-1">
          <span className="label">Cari nama / SN</span>
          <Search size={14} className="absolute bottom-3 left-3 text-slate-400" />
          <input className="field !pl-8" value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE) }} placeholder="budi, ZTEGD5…" />
        </label>
      </div>

      {stats && (
        <div className="rounded-xl bg-slate-100/70 p-3 text-xs dark:bg-white/5">
          <b>Port {port}</b>: {stats.used} terpakai, {stats.free} kosong dari {MAX_ONU_PER_PON}.
          {freeIds.length > 0 && freeIds.length <= 40 && (
            <span className="ml-1 font-mono text-emerald-600 dark:text-emerald-400">ID kosong: {freeIds.join(', ')}</span>
          )}
          {freeIds.length > 40 && <span className="ml-1 font-mono text-emerald-600 dark:text-emerald-400">ID kosong pertama: {stats.firstFree}</span>}
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <span>
          {rows.length} ONU{remote.loadingOnus ? ' · memuat…' : ''}
        </span>
        <button className="btn-ghost !px-2.5 !py-1 text-xs" disabled={rows.length === 0} onClick={exportCsv}>
          <Download size={13} /> CSV
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="bg-slate-100/80 text-[11px] uppercase tracking-wider text-slate-500 dark:bg-white/5 dark:text-slate-400">
            <tr>
              <th className="px-3 py-2 font-medium">Port</th>
              <th className="px-3 py-2 font-medium">ID</th>
              <th className="px-3 py-2 font-medium">Nama</th>
              <th className="px-3 py-2 font-medium">SN</th>
              <th className="px-3 py-2 font-medium">VLAN · Profil</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-white/5">
            {rows.slice(0, limit).map((o) => (
              <tr key={`${o.port}:${o.onuId}`} className="align-top hover:bg-slate-50/80 dark:hover:bg-white/[0.03]">
                <td className="px-3 py-1.5 font-mono text-xs">{o.port}</td>
                <td className="px-3 py-1.5 font-mono text-xs">
                  {o.onuId}
                  {o.source === 'manual' && <span className="ml-1 rounded bg-violet-500/15 px-1 text-[10px] text-violet-500 dark:text-violet-300">manual</span>}
                </td>
                <td className="px-3 py-1.5">{o.name ?? <span className="text-slate-400">—</span>}</td>
                <td className="px-3 py-1.5 font-mono text-xs">
                  {o.sn}
                  <span className="ml-1 text-[10px] text-slate-400">{o.type}</span>
                </td>
                <td className="px-3 py-1.5 font-mono text-xs text-slate-500 dark:text-slate-400">
                  {o.vlan ?? '—'} · {o.profile ?? '—'}
                </td>
                <td className="px-2 py-1 text-right">
                  <button
                    className="btn-ghost !p-1.5 hover:!text-rose-500"
                    title="Hapus dari database (bebaskan ID)"
                    onClick={async () => {
                      if (!window.confirm(`Hapus ONU ${o.port}:${o.onuId} (${o.name ?? o.sn}) dari database? ONU di OLT asli tidak ikut terhapus.`)) return
                      try {
                        await api.deleteOnu(active.id, o.port, o.onuId)
                        await remote.reloadOnus()
                        await remote.reloadOlts()
                      } catch (e) {
                        notify(e instanceof Error ? e.message : 'Gagal menghapus', 'err')
                      }
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > limit && (
        <button className="btn-ghost w-full text-xs" onClick={() => setLimit((l) => l + PAGE)}>
          Tampilkan {Math.min(PAGE, rows.length - limit)} lagi ({rows.length - limit} tersisa)
        </button>
      )}
    </div>
  )
}
