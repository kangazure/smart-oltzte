import { useMemo, useState } from 'react'
import { Copy, Download, ListPlus, TriangleAlert } from 'lucide-react'
import { analyze, generateConfig, ponKey } from '../lib/generator'
import { normalizeSn } from '../lib/sn'
import type { AnalyzedRow, Customer, ExistingConfig, Issue, Notify, Params, Templates } from '../lib/types'
import { copyText, downloadText } from '../lib/util'

export interface ManualEntry {
  sn: string
  name: string
  pon: number
  onuId: number | null
  vlan?: number
  profile?: string
}

interface Props {
  params: Params
  templates: Templates
  existing: ExistingConfig
  /** hasil analisis daftar pelanggan (supaya ONU ID otomatis tidak bentrok) */
  listRows: AnalyzedRow[]
  onExisting: (e: ExistingConfig) => void
  onAddToList: (entry: ManualEntry) => void
  notify: Notify
}

const SPEEDS = ['10M', '20M', '30M', '50M', '100M']
const digits = (s: string, n = 4) => s.replace(/\D/g, '').slice(0, n)

export default function ManualPanel({ params, templates, existing, listRows, onExisting, onAddToList, notify }: Props) {
  const [sn, setSn] = useState('')
  const [name, setName] = useState('')
  const [pon, setPon] = useState('')
  const [onuId, setOnuId] = useState('')
  const [vlan, setVlan] = useState('')
  const [profile, setProfile] = useState('')
  const [record, setRecord] = useState(true)

  const ponN = pon ? Number(pon) : params.pon
  const key = ponKey(params.slot, ponN)
  const snNorm = normalizeSn(sn)
  const touched = sn.trim() !== '' || name.trim() !== ''

  const listUsed = useMemo(
    () => listRows.filter((r) => r.ok && r.onuId != null && r.customer.pon === ponN).map((r) => r.onuId as number),
    [listRows, ponN],
  )
  const inList = useMemo(() => listRows.some((r) => r.sn === snNorm && snNorm !== ''), [listRows, snNorm])

  // ID otomatis melanjutkan data Impor OLT dan daftar pelanggan di PON yang sama
  const merged = useMemo<ExistingConfig>(
    () => ({
      ...existing,
      used: { ...existing.used, [key]: [...new Set([...(existing.used[key] ?? []), ...listUsed])] },
    }),
    [existing, key, listUsed],
  )

  const customer: Customer = {
    id: 'manual',
    sn,
    name,
    pon: ponN,
    onuId: onuId ? Number(onuId) : null,
    vlan: vlan ? Number(vlan) : undefined,
    profile: profile.trim() || undefined,
  }

  const row = useMemo(() => analyze([customer], params, merged)[0], [sn, name, ponN, onuId, vlan, profile, params, merged]) // eslint-disable-line react-hooks/exhaustive-deps
  const issues: Issue[] = [...row.issues, ...(inList ? [{ level: 'error' as const, msg: 'SN sudah ada di daftar pelanggan' }] : [])]
  const ok = row.ok && !inList
  const config = useMemo(() => (ok ? generateConfig([row], { ...params, pon: ponN }, templates) : ''), [ok, row, params, ponN, templates])

  const effVlan = vlan ? Number(vlan) : params.vlan
  const effProfile = profile.trim() || params.speed
  const noKnownIds = !onuId && !(existing.used[key]?.length) && listUsed.length === 0

  const clear = () => {
    setSn('')
    setName('')
    setOnuId('')
  }

  const recordUsed = () => {
    if (!ok || row.onuId == null) return
    const ids = [...new Set([...(existing.used[key] ?? []), row.onuId])].sort((a, b) => a - b)
    onExisting({ ...existing, used: { ...existing.used, [key]: ids }, sns: [...new Set([...existing.sns, row.sn])] })
  }

  const afterOutput = () => {
    if (record) {
      recordUsed()
      notify(`ONU ID ${row.onuId} di PON ${ponN} dicatat terpakai`, 'info')
    }
    clear()
  }

  const onCopy = async () => {
    if (!ok) return
    const done = await copyText(config)
    notify(done ? 'Config registrasi disalin' : 'Gagal menyalin, coba blok manual', done ? 'ok' : 'err')
    if (done) afterOutput()
  }

  const onDownload = () => {
    if (!ok) return
    downloadText(`registrasi_pon-${ponN}_onu-${row.onuId}_${row.sn}.cfg`, config)
    notify('File .cfg diunduh', 'ok')
    afterOutput()
  }

  const onAdd = () => {
    if (!ok || row.onuId == null) return
    onAddToList({ sn: row.sn, name: name.trim(), pon: ponN, onuId: row.onuId, vlan: customer.vlan, profile: customer.profile })
    notify('Ditambahkan ke daftar pelanggan', 'ok')
    clear()
  }

  const profileChips = [...new Set([...SPEEDS, ...(existing.lineProfiles ?? [])])]

  return (
    <div className="animate-fade-in space-y-5">
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Registrasi satu ONU: isi SN, nama, VLAN, dan profil. Config langsung jadi di bawah, tinggal Copy atau Download.
        VLAN dan profil yang dikosongkan memakai nilai di tab Parameter.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <label className="col-span-2 block">
          <span className="label">Serial number ONU</span>
          <input
            className="field font-mono uppercase"
            placeholder="ZTEGC1234567"
            value={sn}
            onChange={(e) => setSn(e.target.value.toUpperCase())}
            spellCheck={false}
            autoComplete="off"
          />
        </label>
        <label className="col-span-2 block">
          <span className="label">Nama pelanggan</span>
          <input className="field" placeholder="Budi Santoso" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        </label>

        <label className="block">
          <span className="label">VLAN</span>
          <input
            className="field font-mono"
            inputMode="numeric"
            placeholder={`${params.vlan} (bawaan)`}
            value={vlan}
            onChange={(e) => setVlan(digits(e.target.value))}
          />
        </label>
        <label className="block">
          <span className="label">Profil</span>
          <input
            className="field font-mono"
            placeholder={`${params.speed} (bawaan)`}
            value={profile}
            onChange={(e) => setProfile(e.target.value.replace(/\s/g, '').slice(0, 32))}
          />
        </label>

        <div className="col-span-2 -mt-1 flex flex-wrap gap-1.5">
          {profileChips.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setProfile(profile === p ? '' : p)}
              className={`chip ${profile === p ? '!border-cyan-500/60 !text-cyan-600 dark:!text-cyan-300' : ''}`}
            >
              {p}
            </button>
          ))}
        </div>

        <label className="block">
          <span className="label">PON port</span>
          <input
            className="field font-mono"
            inputMode="numeric"
            placeholder={`${params.pon} (bawaan)`}
            value={pon}
            onChange={(e) => setPon(digits(e.target.value, 2))}
          />
        </label>
        <label className="block">
          <span className="label">ONU ID (opsional)</span>
          <input
            className="field font-mono"
            inputMode="numeric"
            placeholder={row.onuId != null ? `otomatis (${row.onuId})` : 'otomatis'}
            value={onuId}
            onChange={(e) => setOnuId(digits(e.target.value, 3))}
          />
        </label>
      </div>

      {noKnownIds && (
        <div className="flex gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" />
          <span>
            ONU ID otomatis mulai dari {params.startOnuId} karena belum ada data OLT untuk PON {ponN}. Impor config OLT ZTE di tab Impor OLT
            supaya ID kosong terdeteksi, atau isi ONU ID sendiri.
          </span>
        </div>
      )}

      {touched && issues.length > 0 && (
        <ul className="space-y-0.5 text-xs">
          {issues.map((i, k) => (
            <li key={k} className={i.level === 'error' ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400'}>
              {i.level === 'error' ? '✕' : '!'} {i.msg}
            </li>
          ))}
        </ul>
      )}

      <div className="overflow-hidden rounded-xl bg-[#05080f] ring-1 ring-white/10">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 px-3 py-2">
          <span className="font-mono text-[11px] text-slate-500">
            gpon-olt_{params.slot}/{ponN} · ONU {row.onuId ?? '—'} · VLAN {effVlan} · {effProfile}
          </span>
        </div>
        {config ? (
          <pre className="max-h-72 overflow-auto p-3 font-mono text-[12px] leading-5 text-slate-200">{config}</pre>
        ) : (
          <div className="px-4 py-8 text-center text-xs text-slate-500">Isi SN dan nama yang valid, config muncul di sini.</div>
        )}
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={record} onChange={(e) => setRecord(e.target.checked)} />
        <span>
          Catat ONU ID terpakai setelah Copy / Download
          <span className="block text-[11px] text-slate-400 dark:text-slate-500">
            Registrasi berikutnya otomatis memakai ID selanjutnya. Data ada di tab Impor OLT.
          </span>
        </span>
      </label>

      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" disabled={!ok} onClick={onCopy}>
          <Copy size={16} /> Copy config
        </button>
        <button className="btn-ghost" disabled={!ok} onClick={onDownload}>
          <Download size={16} /> Download .cfg
        </button>
        <button className="btn-ghost" disabled={!ok} onClick={onAdd} title="Masukkan ke daftar pelanggan untuk digabung dengan config lain">
          <ListPlus size={16} /> Tambah ke daftar
        </button>
      </div>
    </div>
  )
}
