import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowRightLeft,
  DatabaseZap,
  FileCode2,
  History,
  Moon,
  Network,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  Users,
  type LucideIcon,
} from 'lucide-react'
import ConfigPreview from './components/ConfigPreview'
import CustomerForm from './components/CustomerForm'
import CustomerTable from './components/CustomerTable'
import HistoryPanel from './components/HistoryPanel'
import ImportPanel from './components/ImportPanel'
import MigrationPanel from './components/MigrationPanel'
import ParamsPanel from './components/ParamsPanel'
import TemplatePanel from './components/TemplatePanel'
import Toasts, { type ToastMsg } from './components/Toasts'
import { DEFAULT_PARAMS, PRESETS, ZTE_TEMPLATES } from './lib/defaults'
import { analyze, generateConfig } from './lib/generator'
import type { ParsedRow } from './lib/parse'
import { normalizeSn } from './lib/sn'
import type { Customer, ExistingConfig, HistoryItem, Notify, Params, Templates } from './lib/types'
import { useLocalStorage } from './lib/useLocalStorage'
import { copyText, downloadText, stamp, uid } from './lib/util'

const ZTE_PRESET = PRESETS.find((p) => p.id === 'zte') ?? PRESETS[PRESETS.length - 1]

type Tab = 'migrate' | 'customers' | 'params' | 'template' | 'import' | 'history'

const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: 'migrate', label: 'Migrasi', icon: ArrowRightLeft },
  { id: 'customers', label: 'Pelanggan', icon: Users },
  { id: 'params', label: 'Parameter', icon: SlidersHorizontal },
  { id: 'template', label: 'Template', icon: FileCode2 },
  { id: 'import', label: 'Impor OLT', icon: DatabaseZap },
  { id: 'history', label: 'Riwayat', icon: History },
]

const TONES = {
  cyan: 'from-cyan-500/20 text-cyan-600 dark:text-cyan-300',
  emerald: 'from-emerald-500/20 text-emerald-600 dark:text-emerald-300',
  rose: 'from-rose-500/20 text-rose-600 dark:text-rose-300',
  violet: 'from-violet-500/20 text-violet-600 dark:text-violet-300',
} as const

function Stat({ label, value, tone }: { label: string; value: number; tone: keyof typeof TONES }) {
  return (
    <div className={`glass bg-gradient-to-br to-transparent px-4 py-3 ${TONES[tone]}`}>
      <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-0.5 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  )
}

export default function App() {
  const [customers, setCustomers] = useLocalStorage<Customer[]>('olt.customers', [])
  const [params, setParams] = useLocalStorage<Params>('olt.params', { ...DEFAULT_PARAMS, ...ZTE_PRESET.params })
  const [templates, setTemplates] = useLocalStorage<Templates>('olt.templates', ZTE_TEMPLATES)
  const [existing, setExisting] = useLocalStorage<ExistingConfig>('olt.existing', { used: {}, sns: [] })
  const [history, setHistory] = useLocalStorage<HistoryItem[]>('olt.history', [])
  const [dark, setDark] = useLocalStorage<boolean>('olt.dark', true)
  const [tab, setTab] = useState<Tab>('migrate')
  const [toasts, setToasts] = useState<ToastMsg[]>([])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
  }, [dark])

  const notify = useCallback<Notify>((text, type = 'ok') => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t.slice(-3), { id, type, text }])
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200)
  }, [])

  const rows = useMemo(() => analyze(customers, params, existing), [customers, params, existing])
  const config = useMemo(() => generateConfig(rows, params, templates), [rows, params, templates])
  const okCount = rows.filter((r) => r.ok).length
  const errCount = rows.length - okCount
  const lineCount = config ? config.replace(/\n$/, '').split('\n').length : 0

  const addCustomers = useCallback(
    (list: ParsedRow[]) => {
      setCustomers((prev) => [
        ...prev,
        ...list.map(
          (p): Customer => ({
            id: uid(),
            sn: normalizeSn(p.sn),
            name: p.name.trim(),
            pon: p.pon ?? params.pon,
            onuId: p.onuId,
          }),
        ),
      ])
    },
    [params.pon, setCustomers],
  )

  const saveHistory = useCallback(
    (silent = false) => {
      if (!config) {
        notify('Belum ada config untuk disimpan', 'err')
        return
      }
      setHistory((prev) => {
        if (prev[0]?.config === config) return prev
        const item: HistoryItem = { id: uid(), at: Date.now(), count: okCount, config, customers, params, templates }
        return [item, ...prev].slice(0, 10)
      })
      if (!silent) notify('Disimpan ke riwayat', 'ok')
    },
    [config, customers, params, templates, okCount, notify, setHistory],
  )

  const onCopy = async () => {
    if (!config) return
    const ok = await copyText(config)
    notify(ok ? 'Config disalin ke clipboard' : 'Gagal menyalin, coba blok manual', ok ? 'ok' : 'err')
    if (ok) saveHistory(true)
  }

  const onDownload = (ext: 'cfg' | 'txt') => {
    if (!config) return
    downloadText(`olt-config-${stamp()}.${ext}`, config)
    saveHistory(true)
    notify(`File .${ext} diunduh`, 'ok')
  }

  const restore = (item: HistoryItem) => {
    setCustomers(item.customers)
    setParams(item.params)
    setTemplates(item.templates)
    setTab('customers')
    notify('Riwayat dimuat kembali', 'info')
  }

  const vendors = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of rows) if (r.sn.length >= 4) m.set(r.sn.slice(0, 4), (m.get(r.sn.slice(0, 4)) ?? 0) + 1)
    return [...m.entries()].map(([prefix, count]) => ({ prefix, count })).sort((a, b) => b.count - a.count)
  }, [rows])

  const templatesAreZte =
    templates.header === ZTE_TEMPLATES.header &&
    templates.block === ZTE_TEMPLATES.block &&
    templates.footer === ZTE_TEMPLATES.footer

  const applyMigration = (list: ParsedRow[], mode: 'replace' | 'append') => {
    const mapped = list.map(
      (p): Customer => ({
        id: uid(),
        sn: normalizeSn(p.sn),
        name: p.name.trim(),
        pon: p.pon ?? params.pon,
        onuId: p.onuId,
      }),
    )
    setCustomers((prev) => (mode === 'replace' ? mapped : [...prev, ...mapped]))
    setTab('customers')
  }

  const mergeHistory = (items: HistoryItem[]) =>
    setHistory((prev) => {
      const ids = new Set(prev.map((p) => p.id))
      return [...prev, ...items.filter((i) => !ids.has(i.id))].sort((a, b) => b.at - a.at).slice(0, 10)
    })

  return (
    <div className="min-h-screen">
      {/* dekorasi latar */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-48 left-1/2 h-[480px] w-[900px] -translate-x-1/2 rounded-full bg-gradient-to-r from-blue-500/20 via-cyan-400/20 to-violet-500/20 blur-3xl dark:from-blue-600/25 dark:via-cyan-500/15 dark:to-violet-600/20" />
        <div className="absolute -bottom-40 -right-24 h-[360px] w-[360px] rounded-full bg-cyan-400/10 blur-3xl dark:bg-cyan-500/10" />
      </div>

      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-slate-50/70 backdrop-blur-xl dark:border-white/10 dark:bg-[#060a13]/70">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-blue-600 to-cyan-400 text-white shadow-lg shadow-cyan-500/30">
              <Network size={22} />
            </div>
            <div className="leading-tight">
              <h1 className="text-base font-semibold tracking-tight">OLT Config Generator</h1>
              <p className="hidden text-xs text-slate-500 dark:text-slate-400 sm:block">
                Migrasi OLT VSOL / Global → ZTE C320: backup → SN + nama → config registrasi
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-300 md:inline-flex">
              <ShieldCheck size={13} /> Diproses di browser
            </span>
            <button
              className="btn-ghost !p-2.5"
              onClick={() => setDark(!dark)}
              title={dark ? 'Mode terang' : 'Mode gelap'}
              aria-label="Ganti tema"
            >
              {dark ? <Sun size={17} /> : <Moon size={17} />}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] space-y-6 px-4 py-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Total pelanggan" value={customers.length} tone="cyan" />
          <Stat label="Siap generate" value={okCount} tone="emerald" />
          <Stat label="Bermasalah" value={errCount} tone="rose" />
          <Stat label="Baris config" value={lineCount} tone="violet" />
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
          <section className="glass min-w-0 overflow-hidden">
            <nav className="flex gap-1 overflow-x-auto border-b border-slate-200/70 p-2 dark:border-white/10">
              {TABS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition ${
                    tab === id
                      ? 'bg-gradient-to-r from-blue-600/15 to-cyan-500/15 text-cyan-700 ring-1 ring-cyan-500/30 dark:text-cyan-300'
                      : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/5'
                  }`}
                >
                  <Icon size={16} />
                  {label}
                  {id === 'history' && history.length > 0 && (
                    <span className="rounded-md bg-slate-200 px-1.5 text-[10px] dark:bg-white/10">{history.length}</span>
                  )}
                </button>
              ))}
            </nav>

            <div className="p-4 sm:p-5">
              {tab === 'migrate' && (
                <MigrationPanel
                  customerCount={customers.length}
                  templatesAreZte={templatesAreZte}
                  existingSnCount={existing.sns.length}
                  onApplyZte={() => {
                    setTemplates(ZTE_TEMPLATES)
                    setParams((p) => ({ ...p, ...ZTE_PRESET.params }))
                    notify('Preset ZTE dipakai', 'ok')
                  }}
                  onClearExisting={() => {
                    setExisting({ used: {}, sns: [] })
                    notify('Data impor dihapus', 'info')
                  }}
                  onApply={applyMigration}
                  notify={notify}
                />
              )}
              {tab === 'customers' && (
                <div className="space-y-6">
                  <CustomerForm defaultPon={params.pon} onAdd={addCustomers} notify={notify} />
                  <CustomerTable
                    rows={rows}
                    slot={params.slot}
                    onUpdate={(id, patch) =>
                      setCustomers((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)))
                    }
                    onRemove={(id) => setCustomers((prev) => prev.filter((c) => c.id !== id))}
                    onClear={() => setCustomers([])}
                  />
                </div>
              )}
              {tab === 'params' && (
                <ParamsPanel
                  params={params}
                  lineProfiles={existing.lineProfiles ?? []}
                  vendors={vendors}
                  onChange={setParams}
                />
              )}
              {tab === 'template' && (
                <TemplatePanel templates={templates} params={params} onChange={setTemplates} onParams={setParams} />
              )}
              {tab === 'import' && (
                <ImportPanel
                  existing={existing}
                  startOnuId={params.startOnuId}
                  slot={params.slot}
                  onSlot={(n) => setParams((p) => ({ ...p, slot: n }))}
                  onChange={setExisting}
                  notify={notify}
                />
              )}
              {tab === 'history' && (
                <HistoryPanel
                  items={history}
                  onRestore={restore}
                  onDelete={(id) => setHistory((prev) => prev.filter((h) => h.id !== id))}
                  onClear={() => setHistory([])}
                  onMerge={mergeHistory}
                  notify={notify}
                />
              )}
            </div>
          </section>

          <section className="min-w-0 space-y-3 lg:sticky lg:top-[5.25rem]">
            <ConfigPreview config={config} onCopy={onCopy} onDownload={onDownload} onSave={() => saveHistory(false)} />
            <p className="px-1 text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">
              Data tersimpan di browser ini (localStorage) dan tidak dikirim ke server. Uji dulu pada satu ONU sebelum
              paste ke OLT produksi.
            </p>
          </section>
        </div>
      </main>

      <Toasts items={toasts} />
    </div>
  )
}
