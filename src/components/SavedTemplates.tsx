import { useState } from 'react'
import { Save, Star, Trash2 } from 'lucide-react'
import type { SavedTemplate } from '../lib/api'
import type { Notify, Templates } from '../lib/types'

interface Props {
  current: Templates
  saved: SavedTemplate[]
  defaultName: string | null | undefined
  inDatabase: boolean
  onSave: (t: SavedTemplate) => Promise<void>
  onDelete: (name: string) => Promise<void>
  onDefault: (name: string | null) => Promise<void>
  onLoad: (t: Templates) => void
  notify: Notify
}

const same = (a: Templates, b: Templates) => a.header === b.header && a.block === b.block && a.footer === b.footer

export default function SavedTemplates({ current, saved, defaultName, inDatabase, onSave, onDelete, onDefault, onLoad, notify }: Props) {
  const [name, setName] = useState('')

  const save = async () => {
    const n = name.trim()
    if (!n) return
    if (saved.some((s) => s.name === n) && !window.confirm(`Template "${n}" sudah ada. Timpa?`)) return
    try {
      await onSave({ name: n, ...current })
      notify(`Template "${n}" disimpan${inDatabase ? ' ke database' : ' di browser'}`, 'ok')
      setName('')
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Gagal menyimpan template', 'err')
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 p-3 dark:border-white/10">
      <div>
        <div className="text-sm font-semibold">Template tersimpan</div>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          {inDatabase ? 'Tersimpan di database, bisa dipakai dari perangkat mana pun.' : 'Database tidak terhubung, tersimpan di browser ini saja.'} Template
          bawaan: tombol bintang dipakai otomatis di browser baru.
        </p>
      </div>
      <div className="flex gap-2">
        <input
          className="field !py-1.5 text-sm"
          placeholder="Nama template, mis. ZTE VLAN 450"
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void save()}
        />
        <button className="btn-primary !py-1.5 text-xs" disabled={!name.trim()} onClick={save}>
          <Save size={14} /> Simpan
        </button>
      </div>
      {saved.length === 0 && <p className="text-xs text-slate-400">Belum ada template tersimpan. Edit template di atas, beri nama, lalu Simpan.</p>}
      <ul className="space-y-1.5">
        {saved.map((t) => {
          const active = same(t, current)
          const isDefault = defaultName === t.name
          return (
            <li key={t.name} className="flex items-center justify-between gap-2 rounded-lg bg-slate-100/70 px-3 py-2 dark:bg-white/5">
              <span className="min-w-0 truncate text-sm">
                {t.name}
                {active && <span className="ml-2 rounded bg-emerald-500/15 px-1.5 text-[10px] text-emerald-600 dark:text-emerald-300">dipakai</span>}
              </span>
              <span className="flex shrink-0 gap-1">
                <button
                  className={`btn-ghost !p-1.5 ${isDefault ? '!text-amber-500' : ''}`}
                  title={isDefault ? 'Template bawaan (klik untuk lepas)' : 'Jadikan bawaan'}
                  onClick={() => void onDefault(isDefault ? null : t.name).catch((e: Error) => notify(e.message, 'err'))}
                >
                  <Star size={14} fill={isDefault ? 'currentColor' : 'none'} />
                </button>
                <button className="btn-ghost !px-2.5 !py-1 text-xs" disabled={active} onClick={() => { onLoad({ header: t.header, block: t.block, footer: t.footer }); notify(`Template "${t.name}" dipakai`, 'info') }}>
                  Pakai
                </button>
                <button
                  className="btn-ghost !p-1.5 hover:!text-rose-500"
                  title="Hapus"
                  onClick={() => window.confirm(`Hapus template "${t.name}"?`) && void onDelete(t.name).catch((e: Error) => notify(e.message, 'err'))}
                >
                  <Trash2 size={14} />
                </button>
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
