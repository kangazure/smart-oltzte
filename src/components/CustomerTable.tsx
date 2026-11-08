import { useState } from 'react'
import { Check, CircleCheck, Pencil, Trash2, Users, X } from 'lucide-react'
import { normalizeSn } from '../lib/sn'
import type { AnalyzedRow, Customer } from '../lib/types'

interface Props {
  rows: AnalyzedRow[]
  slot: number
  onUpdate: (id: string, patch: Partial<Customer>) => void
  onRemove: (id: string) => void
  onClear: () => void
}

interface Draft {
  sn: string
  name: string
  pon: string
  onuId: string
}

const digits = (s: string) => s.replace(/\D/g, '').slice(0, 3)

export default function CustomerTable({ rows, slot, onUpdate, onRemove, onClear }: Props) {
  const [editId, setEditId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>({ sn: '', name: '', pon: '', onuId: '' })

  const startEdit = (r: AnalyzedRow) => {
    setEditId(r.customer.id)
    setDraft({
      sn: r.customer.sn,
      name: r.customer.name,
      pon: String(r.customer.pon),
      onuId: r.customer.onuId == null ? '' : String(r.customer.onuId),
    })
  }

  const save = () => {
    if (!editId) return
    onUpdate(editId, {
      sn: normalizeSn(draft.sn),
      name: draft.name.trim(),
      pon: Number(draft.pon) || 0,
      onuId: draft.onuId ? Number(draft.onuId) : null,
    })
    setEditId(null)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          Daftar pelanggan <span className="font-normal text-slate-400">({rows.length})</span>
        </h3>
        {rows.length > 0 && (
          <button
            className="btn-danger !px-2.5 !py-1 text-xs"
            onClick={() => {
              if (window.confirm(`Hapus semua ${rows.length} pelanggan dari daftar?`)) onClear()
            }}
          >
            <Trash2 size={13} /> Kosongkan
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 py-10 text-center dark:border-white/10">
          <Users className="text-slate-300 dark:text-slate-600" size={30} />
          <p className="text-sm text-slate-500 dark:text-slate-400">Belum ada pelanggan</p>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Tambahkan lewat form di atas atau tempel dari Excel.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="bg-slate-100/80 text-[11px] uppercase tracking-wider text-slate-500 dark:bg-white/5 dark:text-slate-400">
              <tr>
                <th className="px-3 py-2 font-medium">#</th>
                <th className="px-3 py-2 font-medium">SN</th>
                <th className="px-3 py-2 font-medium">Nama</th>
                <th className="px-3 py-2 font-medium">PON</th>
                <th className="px-3 py-2 font-medium">ID</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {rows.map((r, i) => {
                const editing = editId === r.customer.id
                return (
                  <tr key={r.customer.id} className="align-top transition hover:bg-slate-50/80 dark:hover:bg-white/[0.03]">
                    <td className="px-3 py-2 text-xs text-slate-400">{i + 1}</td>
                    {editing ? (
                      <>
                        <td className="px-2 py-1.5">
                          <input
                            className="field !px-2 !py-1 font-mono text-xs"
                            value={draft.sn}
                            onChange={(e) => setDraft({ ...draft, sn: e.target.value.toUpperCase() })}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            className="field !px-2 !py-1 text-xs"
                            value={draft.name}
                            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            className="field !w-14 !px-2 !py-1 font-mono text-xs"
                            inputMode="numeric"
                            value={draft.pon}
                            onChange={(e) => setDraft({ ...draft, pon: digits(e.target.value) })}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            className="field !w-14 !px-2 !py-1 font-mono text-xs"
                            inputMode="numeric"
                            placeholder="auto"
                            value={draft.onuId}
                            onChange={(e) => setDraft({ ...draft, onuId: digits(e.target.value) })}
                          />
                        </td>
                        <td />
                        <td className="whitespace-nowrap px-2 py-1.5 text-right">
                          <button className="btn-ghost !p-1.5" title="Simpan" onClick={save}>
                            <Check size={14} className="text-emerald-500" />
                          </button>{' '}
                          <button className="btn-ghost !p-1.5" title="Batal" onClick={() => setEditId(null)}>
                            <X size={14} />
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-2 font-mono text-xs">{r.sn || '—'}</td>
                        <td className="px-3 py-2">{r.customer.name || '—'}</td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {slot}/{r.customer.pon}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {r.onuId ?? '—'}
                          {r.customer.onuId != null && (
                            <span className="ml-1 rounded bg-violet-500/15 px-1 text-[10px] text-violet-500 dark:text-violet-300">
                              manual
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {r.issues.length === 0 ? (
                            <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                              <CircleCheck size={13} /> Siap
                            </span>
                          ) : (
                            <ul className="space-y-0.5 text-[11px] leading-4">
                              {r.issues.map((iss, k) => (
                                <li
                                  key={k}
                                  className={
                                    iss.level === 'error'
                                      ? 'text-rose-600 dark:text-rose-400'
                                      : 'text-amber-600 dark:text-amber-400'
                                  }
                                >
                                  {iss.level === 'error' ? '✕' : '!'} {iss.msg}
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-2 py-1.5 text-right">
                          <button className="btn-ghost !p-1.5" title="Edit" onClick={() => startEdit(r)}>
                            <Pencil size={14} />
                          </button>{' '}
                          <button
                            className="btn-ghost !p-1.5 hover:!text-rose-500"
                            title="Hapus"
                            onClick={() => onRemove(r.customer.id)}
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
