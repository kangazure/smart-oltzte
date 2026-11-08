import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { ClipboardPaste, FileUp, Plus } from 'lucide-react'
import { parseBulk, type ParsedRow } from '../lib/parse'
import { normalizeSn } from '../lib/sn'
import type { Notify } from '../lib/types'

interface Props {
  defaultPon: number
  onAdd: (rows: ParsedRow[]) => void
  notify: Notify
}

const digits = (s: string) => s.replace(/\D/g, '').slice(0, 3)

export default function CustomerForm({ defaultPon, onAdd, notify }: Props) {
  const [sn, setSn] = useState('')
  const [name, setName] = useState('')
  const [pon, setPon] = useState('')
  const [onuId, setOnuId] = useState('')
  const [bulk, setBulk] = useState('')
  const snRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const s = normalizeSn(sn)
    if (!s || !name.trim()) {
      notify('SN dan nama pelanggan wajib diisi', 'err')
      return
    }
    onAdd([{ sn: s, name: name.trim(), pon: pon ? Number(pon) : null, onuId: onuId ? Number(onuId) : null }])
    setSn('')
    setName('')
    setOnuId('')
    snRef.current?.focus()
  }

  const ingest = (text: string) => {
    const { rows, skipped } = parseBulk(text)
    if (rows.length === 0) {
      notify('Tidak ada baris yang bisa dibaca', 'err')
      return false
    }
    onAdd(rows)
    notify(`${rows.length} pelanggan ditambahkan${skipped ? `, ${skipped} baris dilewati` : ''}`, 'ok')
    return true
  }

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    ingest(await file.text())
  }

  return (
    <div className="animate-fade-in space-y-5">
      <form onSubmit={submit} className="grid grid-cols-2 gap-3">
        <label className="col-span-2 block">
          <span className="label">Serial number ONU</span>
          <input
            ref={snRef}
            className="field font-mono uppercase"
            placeholder="GPON1A2B3C4D"
            value={sn}
            onChange={(e) => setSn(e.target.value.toUpperCase())}
            spellCheck={false}
            autoComplete="off"
          />
        </label>
        <label className="col-span-2 block">
          <span className="label">Nama pelanggan</span>
          <input
            className="field"
            placeholder="Budi Santoso"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
          />
        </label>
        <label className="block">
          <span className="label">PON port</span>
          <input
            className="field font-mono"
            inputMode="numeric"
            placeholder={`${defaultPon} (bawaan)`}
            value={pon}
            onChange={(e) => setPon(digits(e.target.value))}
          />
        </label>
        <label className="block">
          <span className="label">ONU ID (opsional)</span>
          <input
            className="field font-mono"
            inputMode="numeric"
            placeholder="otomatis"
            value={onuId}
            onChange={(e) => setOnuId(digits(e.target.value))}
          />
        </label>
        <button type="submit" className="btn-primary col-span-2">
          <Plus size={16} /> Tambah pelanggan
        </button>
      </form>

      <div className="flex items-center gap-3 text-[11px] uppercase tracking-wider text-slate-400 dark:text-slate-500">
        <span className="h-px flex-1 bg-slate-200 dark:bg-white/10" />
        atau tempel banyak sekaligus
        <span className="h-px flex-1 bg-slate-200 dark:bg-white/10" />
      </div>

      <div className="space-y-2">
        <textarea
          className="field min-h-[110px] resize-y font-mono text-xs"
          placeholder={'GPON1A2B3C4D,Budi Santoso\nZTEGC1234567,Siti Aminah'}
          value={bulk}
          onChange={(e) => setBulk(e.target.value)}
          spellCheck={false}
        />
        <p className="text-[11px] text-slate-400 dark:text-slate-500">
          Format per baris: <span className="font-mono">SN, Nama, [PON], [ONU ID]</span>. Pemisah tab / koma / titik koma,
          jadi bisa langsung paste dari Excel.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            className="btn-primary"
            disabled={!bulk.trim()}
            onClick={() => {
              if (ingest(bulk)) setBulk('')
            }}
          >
            <ClipboardPaste size={16} /> Tambah dari teks
          </button>
          <button className="btn-ghost" onClick={() => fileRef.current?.click()}>
            <FileUp size={16} /> Upload CSV
          </button>
          <input ref={fileRef} type="file" accept=".csv,.tsv,.txt" className="hidden" onChange={onFile} />
        </div>
      </div>
    </div>
  )
}
