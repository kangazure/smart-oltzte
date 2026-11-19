import { useMemo, useState } from 'react'
import { Copy, Download, ListPlus, Settings2, TriangleAlert } from 'lucide-react'
import { api } from '../lib/api'
import { analyze, generateConfig, MAX_ONU_PER_PON, ponKey } from '../lib/generator'
import { portStats, splitPort, toExisting } from '../lib/oltData'
import { normalizeSn } from '../lib/sn'
import type { AnalyzedRow, Customer, ExistingConfig, Issue, Notify, Params, Templates } from '../lib/types'
import type { Remote } from '../lib/useRemote'
import { copyText, downloadText } from '../lib/util'
import { portOrder } from '../lib/zteRunning'

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
  /** data ONU lokal (dipakai hanya jika database tidak terhubung) */
  existing: ExistingConfig
  /** hasil analisis daftar pelanggan (supaya ONU ID otomatis tidak bentrok) */
  listRows: AnalyzedRow[]
  remote: Remote
  onExisting: (e: ExistingConfig) => void
  onAddToList: (entry: ManualEntry) => void
  notify: Notify
}

const digits = (s: string, n = 4) => s.replace(/\D/g, '').slice(0, n)
const splitList = (s: string) => s.split(/[\s,;]+/).filter(Boolean)

export default function ManualPanel({ params, templates, existing, listRows, remote, onExisting, onAddToList, notify }: Props) {
  const db = remote.ok && remote.active != null
  const { settings } = remote

  const [sn, setSn] = useState('')
  const [name, setName] = useState('')
  const [portSel, setPortSel] = useState('')
  const [ponLocal, setPonLocal] = useState('')
  const [onuId, setOnuId] = useState('')
  const [vlan, setVlan] = useState('')
  const [profile, setProfile] = useState('')
  const [type, setType] = useState('')
  const [upper, setUpper] = useState(params.nameCase === 'upper')
  const [record, setRecord] = useState(true)
  const [busy, setBusy] = useState(false)
  const [edit, setEdit] = useState(false)
  const [draft, setDraft] = useState({ vlans: '', profiles: '', types: '' })

  const ports = useMemo(
    () => (db ? [...new Set([...(remote.active?.ports ?? []), ...remote.onus.map((o) => o.port)])].sort(portOrder) : []),
    [db, remote.active, remote.onus],
  )
  const port = db ? (ports.includes(portSel) ? portSel : (ports[0] ?? '')) : ''

  const slot: string | number = db ? splitPort(port || '1/1').slot : params.slot
  const ponN = db ? splitPort(port || '1/1').pon : ponLocal ? Number(ponLocal) : params.pon
  const key = ponKey(slot, ponN)

  const base = useMemo<ExistingConfig>(() => (db ? toExisting(remote.onus) : existing), [db, remote.onus, existing])

  const snNorm = normalizeSn(sn)
  const touched = sn.trim() !== '' || name.trim() !== ''

  // ONU dari daftar pelanggan di port yang sama ikut dihitung terpakai
  const sameSlot = String(slot) === String(params.slot)
  const listUsed = useMemo(
    () => (sameSlot ? listRows.filter((r) => r.ok && r.onuId != null && r.customer.pon === ponN).map((r) => r.onuId as number) : []),
    [listRows, ponN, sameSlot],
  )
  const inList = useMemo(() => listRows.some((r) => r.sn === snNorm && snNorm !== ''), [listRows, snNorm])

  const merged = useMemo<ExistingConfig>(
    () => ({ ...base, used: { ...base.used, [key]: [...new Set([...(base.used[key] ?? []), ...listUsed])] } }),
    [base, key, listUsed],
  )

  const effType = type.trim() || params.onuType
  const effParams = useMemo<Params>(
    () => ({ ...params, slot, pon: ponN, onuType: effType, typeByVendor: undefined, startOnuId: 1, nameCase: upper ? 'upper' : 'asis', snCase: 'upper' }),
    [params, slot, ponN, effType, upper],
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

  const row = useMemo(() => analyze([customer], effParams, merged)[0], [sn, name, ponN, onuId, vlan, profile, effParams, merged]) // eslint-disable-line react-hooks/exhaustive-deps

  // pesan SN ganda yang lebih jelas: tunjukkan lokasinya di database
  const found = db && snNorm ? remote.onus.find((o) => o.sn === snNorm) : undefined
  const issues: Issue[] = [
    ...row.issues.filter((i) => !(found && i.msg === 'SN sudah terdaftar di OLT')),
    ...(found ? [{ level: 'error' as const, msg: `SN sudah terdaftar di port ${found.port} ONU ${found.onuId}${found.name ? ` (${found.name})` : ''}` }] : []),
    ...(inList ? [{ level: 'error' as const, msg: 'SN sudah ada di daftar pelanggan' }] : []),
    ...(db && row.cleanName && remote.onus.some((o) => (o.name ?? '').toLowerCase() === row.cleanName.toLowerCase())
      ? [{ level: 'warn' as const, msg: `Nama ${row.cleanName} sudah dipakai ONU lain di OLT ini` }]
      : []),
  ]
  const ok = row.ok && !inList && !found
  const config = useMemo(() => (ok ? generateConfig([row], effParams, templates) : ''), [ok, row, effParams, templates])

  const effVlan = vlan ? Number(vlan) : params.vlan
  const effProfile = profile.trim() || params.speed
  const stats = db ? portStats(remote.onus, port) : null
  const noKnownIds = !db && !onuId && !(existing.used[key]?.length) && listUsed.length === 0

  const clear = () => {
    setSn('')
    setName('')
    setOnuId('')
  }

  const afterOutput = async () => {
    if (!record || row.onuId == null) {
      clear()
      return
    }
    if (db && remote.active) {
      setBusy(true)
      try {
        await api.addOnus(remote.active.id, [
          { port, onuId: row.onuId, type: effType, sn: row.sn, name: row.cleanName, vlan: effVlan, profile: effProfile },
        ])
        await Promise.all([remote.reloadOnus(), remote.reloadOlts()])
        notify(`ONU ID ${row.onuId} di port ${port} dicatat ke database`, 'info')
        clear()
      } catch (e) {
        notify(`Config sudah keluar tetapi gagal dicatat: ${e instanceof Error ? e.message : 'error'}`, 'err')
      } finally {
        setBusy(false)
      }
      return
    }
    const ids = [...new Set([...(existing.used[key] ?? []), row.onuId])].sort((a, b) => a - b)
    onExisting({ ...existing, used: { ...existing.used, [key]: ids }, sns: [...new Set([...existing.sns, row.sn])] })
    notify(`ONU ID ${row.onuId} di port ${key} dicatat terpakai`, 'info')
    clear()
  }

  const onCopy = async () => {
    if (!ok) return
    const done = await copyText(config)
    notify(done ? 'Config registrasi disalin' : 'Gagal menyalin, coba blok manual', done ? 'ok' : 'err')
    if (done) await afterOutput()
  }

  const onDownload = async () => {
    if (!ok) return
    downloadText(`registrasi_${key.replace(/\//g, '-')}_onu-${row.onuId}_${row.sn}.cfg`, config)
    notify('File .cfg diunduh', 'ok')
    await afterOutput()
  }

  const onAdd = () => {
    if (!ok || row.onuId == null) return
    onAddToList({ sn: row.sn, name: name.trim(), pon: ponN, onuId: row.onuId, vlan: customer.vlan, profile: customer.profile })
    notify('Ditambahkan ke daftar pelanggan', 'ok')
    clear()
  }

  const openEdit = () => {
    setDraft({ vlans: settings.vlans.join(', '), profiles: settings.profiles.join(', '), types: settings.types.join(', ') })
    setEdit(!edit)
  }
  const saveEdit = async () => {
    const vlans = splitList(draft.vlans).map(Number)
    if (vlans.some((v) => !Number.isInteger(v) || v < 1 || v > 4094)) return notify('VLAN harus angka 1-4094', 'err')
    try {
      await remote.saveSettings({ vlans, profiles: splitList(draft.profiles), types: splitList(draft.types) })
      notify('Pilihan disimpan', 'ok')
      setEdit(false)
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Gagal menyimpan', 'err')
    }
  }

  const typeChips = [...new Set([...settings.types, ...(db ? remote.onus.map((o) => o.type) : [])])]
  const profileList = [...new Set([...settings.profiles, ...(db ? remote.onus.map((o) => o.profile ?? '').filter(Boolean) : [])])]
  const chip = (on: boolean) => `chip ${on ? '!border-cyan-500/60 !text-cyan-600 dark:!text-cyan-300' : ''}`

  return (
    <div className="animate-fade-in space-y-5">
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Registrasi satu ONU: pilih OLT dan port, isi SN, nama, VLAN, dan profil. ONU ID diambil otomatis dari ID kosong pertama di database.
      </p>

      {db ? (
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="label">OLT</span>
            <select className="field" value={remote.activeId ?? ''} onChange={(e) => remote.setActiveId(Number(e.target.value))}>
              {remote.olts.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">Port PON</span>
            <select className="field font-mono" value={port} onChange={(e) => setPortSel(e.target.value)}>
              {ports.map((p) => {
                const s = portStats(remote.onus, p)
                return (
                  <option key={p} value={p}>
                    {p} ({s.used}/{MAX_ONU_PER_PON})
                  </option>
                )
              })}
            </select>
          </label>
        </div>
      ) : (
        <div className="flex gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" />
          <span>Database tidak terhubung, jadi ONU ID terpakai hanya diketahui dari tab Impor OLT. Hubungkan database di Vercel untuk ID otomatis dari running-config.</span>
        </div>
      )}

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
          <span className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
            <input type="checkbox" checked={upper} onChange={(e) => setUpper(e.target.checked)} /> HURUF BESAR semua
          </span>
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
            list="profile-list"
            placeholder={`${params.speed} (bawaan)`}
            value={profile}
            onChange={(e) => setProfile(e.target.value.replace(/\s/g, '').slice(0, 32))}
          />
          <datalist id="profile-list">
            {profileList.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </label>

        <div className="col-span-2 -mt-1 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] text-slate-400">VLAN</span>
          {settings.vlans.map((v) => (
            <button key={v} type="button" onClick={() => setVlan(vlan === String(v) ? '' : String(v))} className={chip(vlan === String(v))}>
              {v}
            </button>
          ))}
        </div>
        <div className="col-span-2 -mt-1 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] text-slate-400">Profil</span>
          {settings.profiles.map((p) => (
            <button key={p} type="button" onClick={() => setProfile(profile === p ? '' : p)} className={chip(profile === p)}>
              {p}
            </button>
          ))}
        </div>

        <label className="block">
          <span className="label">Tipe ONU</span>
          <input
            className="field font-mono"
            list="type-list"
            placeholder={`${params.onuType} (bawaan)`}
            value={type}
            onChange={(e) => setType(e.target.value.replace(/\s/g, '').slice(0, 32))}
          />
          <datalist id="type-list">
            {typeChips.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
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

        {!db && (
          <label className="block">
            <span className="label">PON port</span>
            <input
              className="field font-mono"
              inputMode="numeric"
              placeholder={`${params.pon} (bawaan)`}
              value={ponLocal}
              onChange={(e) => setPonLocal(digits(e.target.value, 2))}
            />
          </label>
        )}
      </div>

      <div>
        <button type="button" className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-cyan-600 dark:text-slate-400" onClick={openEdit}>
          <Settings2 size={13} /> Atur pilihan VLAN / profil / tipe
        </button>
        {edit && (
          <div className="mt-2 space-y-2 rounded-xl border border-slate-200 p-3 dark:border-white/10">
            {(['vlans', 'profiles', 'types'] as const).map((k) => (
              <label key={k} className="block">
                <span className="label">{k === 'vlans' ? 'Pilihan VLAN' : k === 'profiles' ? 'Pilihan profil' : 'Pilihan tipe ONU'} (pisahkan koma)</span>
                <input className="field font-mono text-xs" value={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} />
              </label>
            ))}
            <button className="btn-primary !py-1.5 text-xs" onClick={saveEdit}>
              Simpan pilihan
            </button>
          </div>
        )}
      </div>

      {stats && (
        <div className="text-xs text-slate-500 dark:text-slate-400">
          Port {port}: {stats.used} ONU terpakai, {stats.free} ID kosong
          {stats.firstFree != null && <> · ID kosong pertama <b className="font-mono text-emerald-600 dark:text-emerald-400">{stats.firstFree}</b></>}
        </div>
      )}

      {noKnownIds && (
        <div className="flex gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" />
          <span>ONU ID otomatis mulai dari 1 karena belum ada data OLT untuk port {key}.</span>
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
            gpon-olt_{slot}/{ponN} · ONU {row.onuId ?? '—'} · VLAN {effVlan} · {effProfile}
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
          Catat ONU ke database setelah Copy / Download
          <span className="block text-[11px] text-slate-400 dark:text-slate-500">
            ID dan SN langsung dianggap terpakai, jadi registrasi berikutnya otomatis memakai ID selanjutnya. Bisa dihapus di tab Daftar ONU.
          </span>
        </span>
      </label>

      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" disabled={!ok || busy} onClick={onCopy}>
          <Copy size={16} /> Copy config
        </button>
        <button className="btn-ghost" disabled={!ok || busy} onClick={onDownload}>
          <Download size={16} /> Download .cfg
        </button>
        <button
          className="btn-ghost"
          disabled={!ok || !sameSlot}
          onClick={onAdd}
          title={sameSlot ? 'Masukkan ke daftar pelanggan untuk digabung dengan config lain' : `Slot di tab Parameter (${params.slot}) berbeda dengan port ini (${slot})`}
        >
          <ListPlus size={16} /> Tambah ke daftar
        </button>
      </div>
    </div>
  )
}
