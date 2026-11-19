import { useRef, useState, type ChangeEvent } from 'react'
import { Check, FileUp, Loader2, Trash2 } from 'lucide-react'
import { api } from '../lib/api'
import type { Notify } from '../lib/types'
import type { Remote } from '../lib/useRemote'
import { fmtDate } from '../lib/util'
import { parseRunningConfig, type ParsedRunning } from '../lib/zteRunning'

interface Pending {
  file: string
  name: string
  parsed: ParsedRunning
}

export default function OltPanel({ remote, notify }: { remote: Remote; notify: Notify }) {
  const [pending, setPending] = useState<Pending[]>([])
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const onFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])]
    e.target.value = ''
    const next: Pending[] = []
    for (const f of files) {
      const parsed = parseRunningConfig(await f.text())
      if (parsed.onus.length === 0 && parsed.ports.length === 0) {
        notify(`${f.name}: bukan running-config ZTE (tidak ada gpon-olt)`, 'err')
        continue
      }
      next.push({ file: f.name, name: parsed.hostname ?? f.name.replace(/\.\w+$/, ''), parsed })
    }
    setPending((p) => [...p, ...next])
  }

  const saveAll = async () => {
    setBusy(true)
    try {
      for (const p of pending) {
        await api.saveOlt({
          name: p.name.trim(),
          model: p.parsed.model,
          ports: p.parsed.ports,
          onus: p.parsed.onus.map(({ port, onuId, type, sn, name, vlan, profile }) => ({ port, onuId, type, sn, name, vlan, profile })),
        })
      }
      notify(`${pending.length} OLT disimpan ke database`, 'ok')
      setPending([])
      const list = await remote.reloadOlts()
      if (list && remote.activeId == null) remote.setActiveId(list[0]?.id ?? null)
      await remote.reloadOnus()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Gagal menyimpan', 'err')
    } finally {
      setBusy(false)
    }
  }

  const exists = (name: string) => remote.olts.some((o) => o.name === name.trim())

  return (
    <div className="animate-fade-in space-y-5">
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Upload hasil <code>show running-config</code> tiap OLT ZTE. Semua ONU (port, ONU ID, SN, nama, VLAN, profil) disimpan ke
        database, sehingga ONU ID kosong tidak perlu ditebak lagi. Upload ulang file terbaru untuk menyegarkan data OLT yang sama.
      </p>

      <div>
        <input ref={fileRef} type="file" accept=".txt,.cfg,.log,.conf" multiple hidden onChange={onFiles} />
        <button className="btn-primary" onClick={() => fileRef.current?.click()}>
          <FileUp size={16} /> Pilih file running-config (boleh banyak)
        </button>
      </div>

      {pending.length > 0 && (
        <div className="space-y-3 rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-3">
          <div className="text-sm font-medium">Siap disimpan</div>
          {pending.map((p, i) => (
            <div key={i} className="space-y-1.5 rounded-lg bg-white/60 p-3 text-xs dark:bg-white/5">
              <div className="flex items-center gap-2">
                <input
                  className="field !py-1 font-mono text-xs"
                  value={p.name}
                  onChange={(e) => setPending((l) => l.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                />
                <button className="btn-ghost !p-1.5" title="Buang" onClick={() => setPending((l) => l.filter((_, j) => j !== i))}>
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="text-slate-500 dark:text-slate-400">
                {p.file} · ZTE {p.parsed.model ?? '?'} · {p.parsed.ports.length} port PON · <b>{p.parsed.onus.length} ONU</b> ·{' '}
                {p.parsed.onus.filter((o) => o.name).length} bernama
              </div>
              {p.parsed.duplicateSn.length > 0 && (
                <div className="text-amber-600 dark:text-amber-400">
                  {p.parsed.duplicateSn.length} SN terdaftar lebih dari sekali di OLT ini (tetap disimpan apa adanya).
                </div>
              )}
              {exists(p.name) && <div className="text-amber-600 dark:text-amber-400">OLT dengan nama ini sudah ada, datanya akan diganti.</div>}
            </div>
          ))}
          <button className="btn-primary" disabled={busy || pending.some((p) => !p.name.trim())} onClick={saveAll}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Simpan ke database
          </button>
        </div>
      )}

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">
          OLT tersimpan <span className="font-normal text-slate-400">({remote.olts.length})</span>
        </h3>
        {remote.olts.length === 0 && <p className="text-xs text-slate-400">Belum ada OLT. Upload running-config di atas.</p>}
        {remote.olts.map((o) => {
          const active = o.id === remote.activeId
          return (
            <div
              key={o.id}
              className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 ${
                active ? 'border-cyan-500/50 bg-cyan-500/5' : 'border-slate-200 dark:border-white/10'
              }`}
            >
              <div className="min-w-0">
                <div className="truncate font-mono text-sm font-medium">{o.name}</div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  ZTE {o.model ?? '?'} · {o.ports.length} port · {o.onuCount} ONU · data {fmtDate(new Date(o.importedAt).getTime())}
                </div>
              </div>
              <div className="flex gap-1.5">
                <button className={active ? 'btn-primary !px-3 !py-1.5 text-xs' : 'btn-ghost !px-3 !py-1.5 text-xs'} onClick={() => remote.setActiveId(o.id)}>
                  {active ? 'Aktif' : 'Pakai OLT ini'}
                </button>
                <button
                  className="btn-danger !px-2.5 !py-1.5 text-xs"
                  onClick={async () => {
                    if (!window.confirm(`Hapus OLT ${o.name} beserta ${o.onuCount} ONU dari database? (OLT aslinya tidak berubah)`)) return
                    await api.deleteOlt(o.id).catch((e: Error) => notify(e.message, 'err'))
                    await remote.reloadOlts()
                  }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
