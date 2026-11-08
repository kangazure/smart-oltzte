import { useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { ArrowRight, FileUp, Trash2, TriangleAlert } from 'lucide-react'
import { MAX_ONU_PER_PON } from '../lib/generator'
import { detectKind, parseBackup, type SourceKind, type SourceOnu } from '../lib/migrate'
import type { ParsedRow } from '../lib/parse'
import { isValidSn } from '../lib/sn'
import type { Notify } from '../lib/types'
import { uid } from '../lib/util'

type KindSel = 'auto' | SourceKind

interface Source {
  id: string
  fileName: string
  text: string
  kindSel: KindSel
}

interface Props {
  customerCount: number
  templatesAreZte: boolean
  existingSnCount: number
  onApplyZte: () => void
  onClearExisting: () => void
  onApply: (rows: ParsedRow[], mode: 'replace' | 'append') => void
  notify: Notify
}

const KIND_LABEL: Record<SourceKind, string> = { vsol: 'VSOL', generic: 'Umum (perkiraan)' }

const defaultTargetPon = (port: string): number => {
  const n = Number(port.split('/').pop())
  return Number.isInteger(n) && n >= 1 ? n : 1
}

export default function MigrationPanel({
  customerCount,
  templatesAreZte,
  existingSnCount,
  onApplyZte,
  onClearExisting,
  onApply,
  notify,
}: Props) {
  const [sources, setSources] = useState<Source[]>([])
  const [targets, setTargets] = useState<Record<string, string>>({})
  const [fallbackName, setFallbackName] = useState(true)
  const [keepIds, setKeepIds] = useState(false)
  const [drag, setDrag] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const parsed = useMemo(
    () =>
      sources.map((s) => {
        const kind: SourceKind = s.kindSel === 'auto' ? detectKind(s.text) : s.kindSel
        return { source: s, result: parseBackup(s.text, kind) }
      }),
    [sources],
  )

  // gabungkan semua sumber; SN yang sama di beberapa file hanya diambil sekali (file pertama menang)
  const merged = useMemo(() => {
    const seen = new Set<string>()
    const list: (SourceOnu & { srcId: string })[] = []
    let dup = 0
    for (const { source, result } of parsed) {
      for (const o of result.onus) {
        if (seen.has(o.sn)) {
          dup++
          continue
        }
        seen.add(o.sn)
        list.push({ ...o, srcId: source.id })
      }
    }
    return { list, dup }
  }, [parsed])

  const groups = useMemo(() => {
    const map = new Map<string, { key: string; srcId: string; fileName: string; port: string; count: number }>()
    for (const o of merged.list) {
      const key = `${o.srcId}|${o.port}`
      const g = map.get(key)
      if (g) g.count++
      else
        map.set(key, {
          key,
          srcId: o.srcId,
          fileName: sources.find((s) => s.id === o.srcId)?.fileName ?? '',
          port: o.port,
          count: 1,
        })
    }
    return [...map.values()]
  }, [merged, sources])

  const targetPon = (srcId: string, port: string): number => {
    const t = Number(targets[`${srcId}|${port}`])
    return Number.isInteger(t) && t >= 1 ? t : defaultTargetPon(port)
  }

  const perTarget = useMemo(() => {
    const m = new Map<number, number>()
    for (const g of groups) {
      const p = targetPon(g.srcId, g.port)
      m.set(p, (m.get(p) ?? 0) + g.count)
    }
    return m
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, targets])

  const stats = useMemo(() => {
    const withName = merged.list.filter((o) => o.name).length
    const invalid = merged.list.filter((o) => !isValidSn(o.sn)).length
    const noSn = parsed.reduce((n, p) => n + p.result.noSn, 0)
    return { total: merged.list.length, withName, noName: merged.list.length - withName, invalid, noSn }
  }, [merged, parsed])

  const overfull = [...perTarget.entries()].filter(([, n]) => n > MAX_ONU_PER_PON)

  const addFiles = async (files: FileList | File[]) => {
    const added: Source[] = []
    for (const f of Array.from(files)) {
      if (f.size > 20 * 1024 * 1024) {
        notify(`${f.name} terlalu besar (maks 20 MB)`, 'err')
        continue
      }
      const text = await f.text()
      if (text.includes('\u0000')) {
        notify(`${f.name} bukan file teks. Gunakan backup berformat teks (.cfg / .txt).`, 'err')
        continue
      }
      added.push({ id: uid(), fileName: f.name, text, kindSel: 'auto' })
    }
    if (added.length) setSources((prev) => [...prev, ...added])
  }

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files?.length) await addFiles(files)
    e.target.value = ''
  }

  const onDrop = async (e: DragEvent) => {
    e.preventDefault()
    setDrag(false)
    if (e.dataTransfer.files.length) await addFiles(e.dataTransfer.files)
  }

  const build = (): ParsedRow[] =>
    merged.list.map((o) => ({
      sn: o.sn,
      name: o.name || (fallbackName ? `ONU_${o.sn.slice(-6)}` : ''),
      pon: targetPon(o.srcId, o.port),
      onuId: keepIds ? o.onuId : null,
    }))

  const apply = (mode: 'replace' | 'append') => {
    if (merged.list.length === 0) return
    if (mode === 'replace' && customerCount > 0 && !window.confirm(`Ganti ${customerCount} pelanggan yang ada dengan ${merged.list.length} hasil migrasi?`))
      return
    onApply(build(), mode)
    notify(`${merged.list.length} pelanggan ${mode === 'replace' ? 'dimuat' : 'ditambahkan'} dari backup`, 'ok')
  }

  const preview = merged.list.slice(0, 6)

  return (
    <div className="animate-fade-in space-y-5">
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Upload file backup dari OLT lama (VSOL, Global, dan lainnya). SN dan nama pelanggan diambil otomatis, lalu
        dijadikan config registrasi untuk OLT ZTE C320.
      </p>

      {!templatesAreZte && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
          <TriangleAlert size={18} className="shrink-0" />
          <span className="min-w-0 flex-1">Template aktif bukan ZTE. Untuk tujuan ZTE C320, pakai preset ZTE.</span>
          <button className="btn-ghost !py-1.5 text-xs" onClick={onApplyZte}>
            Pakai preset ZTE
          </button>
        </div>
      )}

      {existingSnCount > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-300">
          <TriangleAlert size={18} className="shrink-0" />
          <span className="min-w-0 flex-1">
            Tab Impor OLT berisi {existingSnCount} SN. Jika itu backup OLT lama, semua SN migrasi akan ditandai
            "sudah terdaftar". Tab itu hanya untuk backup OLT tujuan (ZTE).
          </span>
          <button className="btn-danger !py-1.5 text-xs" onClick={onClearExisting}>
            Hapus data impor
          </button>
        </div>
      )}

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDrag(true)
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        className={`flex flex-col items-center gap-3 rounded-xl border-2 border-dashed px-4 py-7 text-center transition ${
          drag ? 'border-cyan-500 bg-cyan-500/10' : 'border-slate-300 dark:border-white/15'
        }`}
      >
        <FileUp className="text-cyan-500" size={28} />
        <div className="text-sm">
          Tarik file backup ke sini, atau
          <button className="ml-1 font-medium text-cyan-600 underline-offset-2 hover:underline dark:text-cyan-300" onClick={() => fileRef.current?.click()}>
            pilih file
          </button>
        </div>
        <p className="text-[11px] text-slate-400 dark:text-slate-500">Bisa beberapa file sekaligus (mis. backup VSOL dan backup Global).</p>
        <input ref={fileRef} type="file" multiple className="hidden" onChange={onFile} />
      </div>

      {sources.length > 0 && (
        <ul className="space-y-2">
          {parsed.map(({ source, result }) => (
            <li
              key={source.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white/60 p-3 dark:border-white/10 dark:bg-white/5"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium" title={source.fileName}>
                  {source.fileName}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Terbaca sebagai <b>{KIND_LABEL[result.kind]}</b>: {result.onus.length} ONU
                  {result.noSn > 0 && <>, {result.noSn} tanpa SN dilewati</>}
                </div>
              </div>
              <select
                className="field !w-auto !py-1.5 text-xs"
                value={source.kindSel}
                onChange={(e) =>
                  setSources((prev) => prev.map((s) => (s.id === source.id ? { ...s, kindSel: e.target.value as KindSel } : s)))
                }
                aria-label="Format backup"
              >
                <option value="auto">Otomatis</option>
                <option value="vsol">VSOL</option>
                <option value="generic">Umum (perkiraan)</option>
              </select>
              <button
                className="btn-ghost !p-2 hover:!text-rose-500"
                title="Buang file"
                onClick={() => setSources((prev) => prev.filter((s) => s.id !== source.id))}
              >
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {parsed.some((p) => p.result.kind === 'generic') && (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
          Format "Umum" membaca SN dan nama dengan menebak dari kata kunci <span className="font-mono">name / desc / description / alias</span>.
          Periksa contoh di bawah dan kolom nama sebelum dipakai. Jika banyak nama kosong, kirim contoh isi backup-nya agar
          parser bisa disesuaikan.
        </p>
      )}

      {stats.total > 0 && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { l: 'ONU terbaca', v: stats.total, c: '' },
              { l: 'Dengan nama', v: stats.withName, c: 'text-emerald-600 dark:text-emerald-400' },
              { l: 'Tanpa nama', v: stats.noName, c: stats.noName ? 'text-amber-600 dark:text-amber-400' : '' },
              { l: 'SN tidak valid', v: stats.invalid, c: stats.invalid ? 'text-rose-600 dark:text-rose-400' : '' },
            ].map((s) => (
              <div key={s.l} className="rounded-xl border border-slate-200 bg-white/60 p-3 dark:border-white/10 dark:bg-white/5">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">{s.l}</div>
                <div className={`text-xl font-semibold tabular-nums ${s.c}`}>{s.v}</div>
              </div>
            ))}
          </div>
          {merged.dup > 0 && (
            <p className="text-xs text-slate-500 dark:text-slate-400">{merged.dup} SN dobel antar file dilewati (file yang lebih dulu dipakai).</p>
          )}

          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Peta PON: asal → tujuan (ZTE)</h3>
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10">
              <table className="w-full min-w-[420px] text-left text-sm">
                <thead className="bg-slate-100/80 text-[11px] uppercase tracking-wider text-slate-500 dark:bg-white/5 dark:text-slate-400">
                  <tr>
                    <th className="px-3 py-2 font-medium">Sumber</th>
                    <th className="px-3 py-2 font-medium">PON asal</th>
                    <th className="px-3 py-2 font-medium">ONU</th>
                    <th className="px-3 py-2" />
                    <th className="px-3 py-2 font-medium">PON tujuan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {groups.map((g) => {
                    const t = targetPon(g.srcId, g.port)
                    const full = (perTarget.get(t) ?? 0) > MAX_ONU_PER_PON
                    return (
                      <tr key={g.key}>
                        <td className="max-w-[140px] truncate px-3 py-1.5 text-xs" title={g.fileName}>
                          {g.fileName}
                        </td>
                        <td className="px-3 py-1.5 font-mono text-xs">{g.port}</td>
                        <td className="px-3 py-1.5 font-mono text-xs">{g.count}</td>
                        <td className="px-1 text-slate-400">
                          <ArrowRight size={14} />
                        </td>
                        <td className="px-3 py-1.5">
                          <input
                            className={`field !w-16 !px-2 !py-1 font-mono text-xs ${full ? '!border-rose-500 !ring-rose-500/30' : ''}`}
                            inputMode="numeric"
                            value={targets[g.key] ?? String(defaultTargetPon(g.port))}
                            onChange={(e) => setTargets((prev) => ({ ...prev, [g.key]: e.target.value.replace(/\D/g, '').slice(0, 2) }))}
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {overfull.length > 0 ? (
              <p className="text-xs text-rose-600 dark:text-rose-400">
                PON tujuan {overfull.map(([p, n]) => `${p} (${n} ONU)`).join(', ')} melebihi {MAX_ONU_PER_PON} ONU. Pindahkan sebagian ke PON lain, kalau tidak
                kelebihannya akan ditandai error.
              </p>
            ) : (
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                Isi nomor PON di OLT ZTE tempat pelanggan itu akan dipasang. Slot diatur di tab Parameter.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={fallbackName} onChange={(e) => setFallbackName(e.target.checked)} />
              <span>
                Nama kosong diisi otomatis <span className="font-mono text-xs">ONU_&lt;6 akhir SN&gt;</span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={keepIds} onChange={(e) => setKeepIds(e.target.checked)} />
              <span>
                Pertahankan ONU ID lama
                <span className="block text-[11px] text-slate-400 dark:text-slate-500">
                  Jika mati, ONU ID dinomori ulang otomatis di OLT ZTE. Jika dua PON asal digabung ke satu PON tujuan, ID yang sama akan bentrok.
                </span>
              </span>
            </label>
          </div>

          <div>
            <span className="label">Contoh hasil baca ({preview.length} pertama)</span>
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10">
              <table className="w-full min-w-[360px] text-left text-xs">
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {preview.map((o) => (
                    <tr key={o.srcId + o.sn}>
                      <td className="px-3 py-1.5 font-mono">{o.sn}</td>
                      <td className="px-3 py-1.5">{o.name || <span className="text-amber-600 dark:text-amber-400">(kosong)</span>}</td>
                      <td className="px-3 py-1.5 font-mono text-slate-400">{o.port}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" onClick={() => apply('replace')}>
              Buat daftar pelanggan ({stats.total})
            </button>
            {customerCount > 0 && (
              <button className="btn-ghost" onClick={() => apply('append')}>
                Tambahkan ke daftar yang ada
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
