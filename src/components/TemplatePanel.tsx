import { useRef, useState, type RefObject } from 'react'
import { PLACEHOLDERS, PRESETS } from '../lib/defaults'
import type { Params, Templates } from '../lib/types'

type Key = keyof Templates

const SECTIONS: { key: Key; title: string; hint: string; rows: number }[] = [
  { key: 'header', title: 'Header', hint: 'Ditulis sekali di awal', rows: 3 },
  { key: 'block', title: 'Blok per pelanggan', hint: 'Diulang untuk setiap pelanggan', rows: 12 },
  { key: 'footer', title: 'Footer', hint: 'Ditulis sekali di akhir', rows: 3 },
]

interface Props {
  templates: Templates
  params: Params
  onChange: (t: Templates) => void
  onParams: (p: Params) => void
}

export default function TemplatePanel({ templates, params, onChange, onParams }: Props) {
  const [active, setActive] = useState<Key>('block')
  const headerRef = useRef<HTMLTextAreaElement>(null)
  const blockRef = useRef<HTMLTextAreaElement>(null)
  const footerRef = useRef<HTMLTextAreaElement>(null)
  const refs: Record<Key, RefObject<HTMLTextAreaElement | null>> = {
    header: headerRef,
    block: blockRef,
    footer: footerRef,
  }

  const insert = (token: string) => {
    const el = refs[active].current
    if (!el) return
    const s = el.selectionStart
    const e = el.selectionEnd
    const v = templates[active]
    onChange({ ...templates, [active]: v.slice(0, s) + token + v.slice(e) })
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(s + token.length, s + token.length)
    })
  }

  return (
    <div className="animate-fade-in space-y-4">
      <div>
        <span className="label">Preset template</span>
        <div className="grid grid-cols-2 gap-2">
          {PRESETS.map((p) => {
            const isActive =
              p.templates.header === templates.header &&
              p.templates.block === templates.block &&
              p.templates.footer === templates.footer
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  if (isActive || window.confirm(`Ganti template dengan preset ${p.label}? Isi template saat ini akan ditimpa.`)) {
                    onChange(p.templates)
                    onParams({ ...params, ...p.params })
                  }
                }}
                className={`rounded-xl border p-3 text-left transition ${
                  isActive
                    ? 'border-cyan-500/60 bg-cyan-500/10'
                    : 'border-slate-200 hover:bg-slate-100 dark:border-white/10 dark:hover:bg-white/5'
                }`}
              >
                <div className="flex items-center justify-between text-sm font-semibold">
                  {p.label}
                  {isActive && <span className="text-[10px] font-medium text-cyan-600 dark:text-cyan-300">aktif</span>}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">{p.desc}</div>
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <span className="label">Placeholder (klik untuk menyisipkan ke kotak yang aktif)</span>
        <div className="flex flex-wrap gap-1.5">
          {PLACEHOLDERS.map((p) => (
            <button
              key={p.token}
              type="button"
              className="chip"
              title={p.desc}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insert(p.token)}
            >
              {p.token}
            </button>
          ))}
        </div>
      </div>

      {SECTIONS.map((s) => (
        <label key={s.key} className="block">
          <span className="label flex items-center justify-between">
            <span>{s.title}</span>
            <span className="font-normal text-slate-400 dark:text-slate-500">{s.hint}</span>
          </span>
          <textarea
            ref={refs[s.key]}
            className="field resize-y font-mono text-xs leading-5"
            rows={s.key === 'block' ? Math.max(s.rows, templates.block.split('\n').length + 1) : s.rows}
            value={templates[s.key]}
            onFocus={() => setActive(s.key)}
            onChange={(e) => onChange({ ...templates, [s.key]: e.target.value })}
            spellCheck={false}
          />
        </label>
      ))}
    </div>
  )
}
