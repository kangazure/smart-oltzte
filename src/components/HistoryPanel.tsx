import { useRef, type ChangeEvent } from 'react'
import { Download, FileDown, FileUp, History, RotateCcw, Trash2 } from 'lucide-react'
import type { HistoryItem, Notify } from '../lib/types'
import { downloadText, fmtDate, stamp } from '../lib/util'

interface Props {
  items: HistoryItem[]
  onRestore: (item: HistoryItem) => void
  onDelete: (id: string) => void
  onClear: () => void
  onMerge: (items: HistoryItem[]) => void
  notify: Notify
}

const isHistoryItem = (x: unknown): x is HistoryItem => {
  const o = x as HistoryItem
  return (
    !!o &&
    typeof o.id === 'string' &&
    typeof o.at === 'number' &&
    typeof o.config === 'string' &&
    Array.isArray(o.customers) &&
    !!o.params &&
    !!o.templates
  )
}

export default function HistoryPanel({ items, onRestore, onDelete, onClear, onMerge, notify }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const data = JSON.parse(await file.text()) as unknown
      const list = Array.isArray(data) ? data.filter(isHistoryItem) : []
      if (list.length === 0) throw new Error('kosong')
      onMerge(list)
      notify(`${list.length} riwayat diimpor`, 'ok')
    } catch {
      notify('File JSON riwayat tidak valid', 'err')
    }
  }

  return (
    <div className="animate-fade-in space-y-4">
      <div className="flex flex-wrap gap-2">
        <button
          className="btn-ghost"
          disabled={items.length === 0}
          onClick={() => downloadText(`olt-riwayat-${stamp()}.json`, JSON.stringify(items, null, 2), 'application/json')}
        >
          <FileDown size={16} /> Export JSON
        </button>
        <button className="btn-ghost" onClick={() => fileRef.current?.click()}>
          <FileUp size={16} /> Import JSON
        </button>
        <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={onFile} />
        {items.length > 0 && (
          <button
            className="btn-danger ml-auto"
            onClick={() => {
              if (window.confirm('Hapus seluruh riwayat?')) onClear()
            }}
          >
            <Trash2 size={15} /> Hapus semua
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 py-10 text-center dark:border-white/10">
          <History className="text-slate-300 dark:text-slate-600" size={30} />
          <p className="text-sm text-slate-500 dark:text-slate-400">Belum ada riwayat</p>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Riwayat tersimpan otomatis saat kamu menyalin atau mengunduh config.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((it) => (
            <li
              key={it.id}
              className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white/60 p-3 dark:border-white/10 dark:bg-white/5"
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{it.count} pelanggan</div>
                <div className="text-[11px] text-slate-400">{fmtDate(it.at)}</div>
              </div>
              <button className="btn-ghost !p-2" title="Muat kembali" onClick={() => onRestore(it)}>
                <RotateCcw size={15} />
              </button>
              <button
                className="btn-ghost !p-2"
                title="Unduh .cfg"
                onClick={() => downloadText(`olt-config-${stamp(new Date(it.at))}.cfg`, it.config)}
              >
                <Download size={15} />
              </button>
              <button className="btn-ghost !p-2 hover:!text-rose-500" title="Hapus" onClick={() => onDelete(it.id)}>
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
