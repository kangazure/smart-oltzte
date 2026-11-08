import { useMemo, useState } from 'react'
import { Archive, Copy, Download, Layers } from 'lucide-react'
import { buildFiles, groupByPon } from '../lib/generator'
import type { AnalyzedRow, Notify, Params, Templates } from '../lib/types'
import { useLocalStorage } from '../lib/useLocalStorage'
import { copyText, downloadBytes, downloadText, stamp } from '../lib/util'
import { makeZip } from '../lib/zip'
import ConfigPreview from './ConfigPreview'

interface Props {
  rows: AnalyzedRow[]
  params: Params
  templates: Templates
  /** config gabungan seluruh PON dalam satu file */
  fullConfig: string
  onParams: (p: Params) => void
  onSaveHistory: (silent?: boolean) => void
  notify: Notify
}

type Chunk = number | 'all'
const PRESETS: Chunk[] = [10, 20, 50, 'all']

const chip = (active: boolean) =>
  `chip !px-2.5 !py-1.5 !text-xs ${active ? '!border-cyan-500/60 !bg-cyan-500/10 !text-cyan-700 dark:!text-cyan-300' : ''}`

export default function OutputPanel({ rows, params, templates, fullConfig, onParams, onSaveHistory, notify }: Props) {
  const [opt, setOpt] = useLocalStorage<{ chunk: Chunk }>('olt.output', { chunk: 'all' })
  const [scopeSel, setScope] = useState<number | 'all'>('all')
  const [custom, setCustom] = useState('')
  const [selId, setSelId] = useState<string | null>(null)

  const chunk: Chunk = opt.chunk === 'all' || (Number.isInteger(opt.chunk) && opt.chunk >= 1) ? opt.chunk : 'all'
  const groups = useMemo(() => groupByPon(rows), [rows])
  const total = useMemo(() => [...groups.values()].reduce((n, l) => n + l.length, 0), [groups])
  const scope = scopeSel === 'all' || groups.has(scopeSel) ? scopeSel : 'all'

  const files = useMemo(() => buildFiles(rows, params, templates, scope, chunk), [rows, params, templates, scope, chunk])
  const selected = files.find((f) => f.id === selId) ?? files[0]
  const upper = params.nameCase === 'upper'
  const multiPon = scope === 'all' && groups.size > 1

  const setChunk = (c: Chunk) => {
    setOpt({ chunk: c })
    setSelId(null)
  }

  const copyFile = async (config: string, label: string) => {
    const ok = await copyText(config)
    notify(ok ? `${label} disalin` : 'Gagal menyalin, coba blok manual', ok ? 'ok' : 'err')
    if (ok) onSaveHistory(true)
  }

  const downloadFile = (name: string, config: string, ext: 'cfg' | 'txt' = 'cfg') => {
    downloadText(`${name}.${ext}`, config)
    onSaveHistory(true)
  }

  const downloadZip = () => {
    if (files.length === 0) return
    const zip = makeZip(
      files.map((f) => ({ name: `${multiPon ? `PON-${f.pon}/` : ''}${f.name}.cfg`, text: f.config })),
    )
    const tag = `${scope === 'all' ? 'semua-pon' : `pon-${scope}`}_${chunk === 'all' ? 'utuh' : `${chunk}-per-file`}`
    downloadBytes(`olt-config_${tag}_${stamp()}.zip`, zip)
    onSaveHistory(true)
    notify(`ZIP berisi ${files.length} file diunduh`, 'ok')
  }

  const applyCustom = () => {
    const n = Number(custom)
    if (Number.isInteger(n) && n >= 1) {
      setChunk(n)
      setCustom('')
    } else notify('Isi jumlah pelanggan per file (angka 1 atau lebih)', 'err')
  }

  const isCustom = typeof chunk === 'number' && !PRESETS.includes(chunk)

  return (
    <div className="space-y-3">
      <div className="glass space-y-4 p-4">
        <div className="flex items-center gap-2">
          <Layers size={17} className="text-cyan-500" />
          <h2 className="text-sm font-semibold">Output per PON</h2>
          <span className="ml-auto text-[11px] text-slate-400 dark:text-slate-500">{total} pelanggan siap</span>
        </div>

        <div>
          <span className="label">PON</span>
          {groups.size === 0 ? (
            <p className="text-xs text-slate-400 dark:text-slate-500">Belum ada pelanggan valid.</p>
          ) : (
            <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
              <button className={chip(scope === 'all')} onClick={() => (setScope('all'), setSelId(null))}>
                Semua PON ({total})
              </button>
              {[...groups.entries()].map(([pon, list]) => (
                <button key={pon} className={chip(scope === pon)} onClick={() => (setScope(pon), setSelId(null))}>
                  PON {pon} ({list.length})
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <span className="label">Pelanggan per file</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {PRESETS.map((c) => (
              <button key={String(c)} className={chip(chunk === c)} onClick={() => setChunk(c)}>
                {c === 'all' ? 'Semua' : c}
              </button>
            ))}
            <input
              className={`field !w-24 !px-2 !py-1.5 font-mono text-xs ${isCustom ? '!border-cyan-500/60' : ''}`}
              inputMode="numeric"
              placeholder={isCustom ? String(chunk) : 'lainnya'}
              value={custom}
              onChange={(e) => setCustom(e.target.value.replace(/\D/g, '').slice(0, 3))}
              onKeyDown={(e) => e.key === 'Enter' && applyCustom()}
              aria-label="Jumlah pelanggan per file"
            />
            <button className="btn-ghost !px-2.5 !py-1.5 text-xs" disabled={!custom} onClick={applyCustom}>
              Atur
            </button>
          </div>
          <p className="mt-1.5 text-[11px] text-slate-400 dark:text-slate-500">
            ONU ID tetap berurutan, jadi bagian 2 melanjutkan bagian 1. Paste berurutan dari bagian pertama.
          </p>
        </div>

        <div>
          <span className="label">Penulisan nama pelanggan</span>
          <div className="inline-flex rounded-xl border border-slate-200 p-0.5 dark:border-white/10">
            {(
              [
                ['asis', 'Apa adanya'],
                ['upper', 'HURUF BESAR'],
              ] as const
            ).map(([v, l]) => (
              <button
                key={v}
                onClick={() => onParams({ ...params, nameCase: v })}
                className={`rounded-[10px] px-3 py-1.5 text-xs font-medium transition ${
                  (v === 'upper') === upper
                    ? 'bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        {files.length > 1 && (
          <div className="space-y-2 border-t border-slate-200/70 pt-3 dark:border-white/10">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{files.length} file</span>
              <div className="ml-auto flex flex-wrap gap-1.5">
                <button className="btn-primary !px-3 !py-1.5 text-xs" onClick={downloadZip}>
                  <Archive size={14} /> Download semua (ZIP)
                </button>
                {multiPon && (
                  <button
                    className="btn-ghost !px-3 !py-1.5 text-xs"
                    onClick={() => {
                      downloadFile(`olt-config-semua-pon-${stamp()}`, fullConfig)
                      notify('1 file gabungan semua PON diunduh', 'ok')
                    }}
                    title="Semua PON digabung dalam satu file"
                  >
                    <Download size={14} /> 1 file gabungan
                  </button>
                )}
              </div>
            </div>

            <ul className="max-h-60 space-y-1 overflow-y-auto pr-1">
              {files.map((f) => (
                <li
                  key={f.id}
                  onClick={() => setSelId(f.id)}
                  className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 transition ${
                    selected?.id === f.id
                      ? 'border-cyan-500/60 bg-cyan-500/10'
                      : 'border-slate-200 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono text-xs" title={f.name}>
                      {f.name}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      PON {f.pon} · bagian {f.part}/{f.parts} · {f.count} pelanggan · ONU ID {f.minId}–{f.maxId}
                    </div>
                  </div>
                  <button
                    className="btn-ghost !p-1.5"
                    title="Copy"
                    onClick={(e) => {
                      e.stopPropagation()
                      void copyFile(f.config, f.name)
                    }}
                  >
                    <Copy size={14} />
                  </button>
                  <button
                    className="btn-ghost !p-1.5"
                    title="Download .cfg"
                    onClick={(e) => {
                      e.stopPropagation()
                      downloadFile(f.name, f.config)
                    }}
                  >
                    <Download size={14} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <ConfigPreview
        config={selected?.config ?? ''}
        fileName={selected ? `${selected.name}.cfg` : 'olt-config.cfg'}
        onCopy={() => selected && void copyFile(selected.config, selected.name)}
        onDownload={(ext) => {
          if (!selected) return
          downloadFile(selected.name, selected.config, ext)
          notify(`File .${ext} diunduh`, 'ok')
        }}
        onSave={() => onSaveHistory(false)}
      />
    </div>
  )
}
