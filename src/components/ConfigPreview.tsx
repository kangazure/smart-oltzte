import { Bookmark, Copy, Download, FileCode2 } from 'lucide-react'
import { SN_REGEX } from '../lib/sn'

interface Props {
  config: string
  fileName?: string
  onCopy: () => void
  onDownload: (ext: 'cfg' | 'txt') => void
  onSave: () => void
}

function Line({ text }: { text: string }) {
  const t = text.trim()
  if (!t) return <span>{' '}</span>
  if (/^(configure terminal|end|write)$/.test(t)) return <span className="font-semibold text-amber-300">{text}</span>
  if (/^(interface gpon-olt_|interface gpon-onu_|pon-onu-mng )/.test(t))
    return <span className="font-semibold text-cyan-300">{text}</span>
  if (t === 'exit') return <span className="text-slate-500">{text}</span>

  let first = true
  return (
    <span>
      {text.split(/(\s+)/).map((tok, i) => {
        if (tok === '' || /^\s+$/.test(tok)) return tok
        const isFirst = first
        first = false
        let cls = 'text-slate-200'
        if (isFirst) cls = 'text-violet-300'
        else if (/^\d+[MGKmgk]?$/.test(tok)) cls = 'text-emerald-300'
        else if (SN_REGEX.test(tok)) cls = 'text-pink-300'
        return (
          <span key={i} className={cls}>
            {tok}
          </span>
        )
      })}
    </span>
  )
}

const PREVIEW_LIMIT = 600

export default function ConfigPreview({ config, fileName = 'olt-config.cfg', onCopy, onDownload, onSave }: Props) {
  const lines = config ? config.replace(/\n$/, '').split('\n') : []
  const shown = lines.length > PREVIEW_LIMIT ? lines.slice(0, PREVIEW_LIMIT) : lines

  return (
    <div className="glass flex flex-col overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/70 px-4 py-3 dark:border-white/10">
        <div className="flex items-center gap-2">
          <FileCode2 size={18} className="text-cyan-500" />
          <h2 className="text-sm font-semibold">Preview config</h2>
          {lines.length > 0 && (
            <span className="rounded-md bg-cyan-500/10 px-1.5 py-0.5 text-[11px] font-medium text-cyan-600 dark:text-cyan-300">
              {lines.length} baris
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button className="btn-primary !px-3 !py-1.5 text-xs" disabled={!config} onClick={onCopy}>
            <Copy size={14} /> Copy
          </button>
          <button className="btn-ghost !px-3 !py-1.5 text-xs" disabled={!config} onClick={() => onDownload('cfg')}>
            <Download size={14} /> .cfg
          </button>
          <button className="btn-ghost !px-3 !py-1.5 text-xs" disabled={!config} onClick={() => onDownload('txt')}>
            <Download size={14} /> .txt
          </button>
          <button className="btn-ghost !px-3 !py-1.5 text-xs" disabled={!config} onClick={onSave} title="Simpan ke riwayat">
            <Bookmark size={14} />
          </button>
        </div>
      </div>

      <div className="p-3">
        <div className="overflow-hidden rounded-xl bg-[#05080f] ring-1 ring-white/10">
          <div className="flex items-center gap-1.5 border-b border-white/5 px-3 py-2">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-500/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/80" />
            <span className="ml-2 truncate font-mono text-[11px] text-slate-500">{fileName}</span>
          </div>

          {lines.length === 0 ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center gap-2 px-6 py-16 text-center">
              <FileCode2 size={34} className="text-slate-700" />
              <p className="text-sm text-slate-400">Belum ada config</p>
              <p className="max-w-xs text-xs text-slate-500">
                Tambahkan pelanggan dengan SN dan nama yang valid, hasilnya langsung muncul di sini.
              </p>
            </div>
          ) : (
            <div className="max-h-[60vh] overflow-auto py-3 font-mono text-[12.5px] leading-6 lg:max-h-[calc(100vh-17rem)]">
              {shown.map((ln, i) => (
                <div key={i} className="flex whitespace-pre px-3 hover:bg-white/[0.03]">
                  <span className="w-9 shrink-0 select-none pr-3 text-right text-slate-600">{i + 1}</span>
                  <Line text={ln} />
                </div>
              ))}
              {shown.length < lines.length && (
                <div className="mt-2 border-t border-white/10 px-3 pt-3 font-sans text-xs text-slate-400">
                  Preview menampilkan {shown.length} dari {lines.length} baris. Tombol Copy, .cfg, dan .txt memuat seluruh config.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
