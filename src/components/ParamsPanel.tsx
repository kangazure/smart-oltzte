import { RotateCcw } from 'lucide-react'
import { DEFAULT_PARAMS } from '../lib/defaults'
import type { Params } from '../lib/types'
import NumberField from './NumberField'

const SPEEDS = ['10M', '20M', '30M', '50M', '100M']
const TYPES = ['ZTE-F609', 'ZTE-F660', 'ZTE-F670L', 'ZTE-F663N', 'ALL']

const SN_MODES = [
  { value: 'olt', example: 'ZTEGdc79ec52', desc: 'Seperti tampilan OLT' },
  { value: 'upper', example: 'ZTEGDC79EC52', desc: 'Kapital semua' },
] as const

interface Props {
  params: Params
  lineProfiles: string[]
  /** 4 huruf awal SN yang ada di daftar pelanggan + jumlahnya */
  vendors: { prefix: string; count: number }[]
  onChange: (p: Params) => void
}

export default function ParamsPanel({ params, lineProfiles, vendors, onChange }: Props) {
  const set = <K extends keyof Params>(key: K, value: Params[K]) => onChange({ ...params, [key]: value })

  return (
    <div className="animate-fade-in space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <NumberField label="Slot" value={params.slot} min={0} max={99} onChange={(n) => set('slot', n)} />
        <NumberField
          label="PON bawaan"
          value={params.pon}
          min={1}
          max={99}
          onChange={(n) => set('pon', n)}
          hint="Jika PON kosong"
        />
        <NumberField
          label="ONU ID awal"
          value={params.startOnuId}
          min={1}
          max={128}
          onChange={(n) => set('startOnuId', n)}
          hint="Mulai penomoran"
        />
      </div>

      <label className="block">
        <span className="label">Line profile (template VSOL)</span>
        <input
          className="field font-mono"
          list="line-profiles"
          value={params.lineProfile}
          onChange={(e) => set('lineProfile', e.target.value.trim())}
          placeholder="line_1"
        />
        <datalist id="line-profiles">
          {lineProfiles.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
        {lineProfiles.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {lineProfiles.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => set('lineProfile', p)}
                className={`chip ${params.lineProfile === p ? '!border-cyan-500/60 !text-cyan-600 dark:!text-cyan-300' : ''}`}
              >
                {p}
              </button>
            ))}
            <span className="self-center text-[11px] text-slate-400 dark:text-slate-500">dari config OLT</span>
          </div>
        ) : (
          <span className="mt-1 block text-[11px] text-slate-400 dark:text-slate-500">
            Impor config OLT di tab Impor OLT agar daftar line profile terisi otomatis.
          </span>
        )}
      </label>

      <div>
        <span className="label">Penulisan huruf SN di config</span>
        <div className="grid grid-cols-2 gap-2">
          {SN_MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => set('snCase', m.value)}
              className={`rounded-xl border p-2.5 text-left transition ${
                params.snCase === m.value
                  ? 'border-cyan-500/60 bg-cyan-500/10'
                  : 'border-slate-200 hover:bg-slate-100 dark:border-white/10 dark:hover:bg-white/5'
              }`}
            >
              <div className="font-mono text-xs">{m.example}</div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">{m.desc}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-dashed border-slate-300 p-3 dark:border-white/10">
        <p className="text-[11px] text-slate-400 dark:text-slate-500">
          Khusus template ZTE (dipakai jika template memuat {'<TYPE>'}, {'<VLAN>'}, {'<SPEED>'}):
        </p>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="label">Tipe ONU</span>
            <input
              className="field font-mono"
              list="onu-types"
              value={params.onuType}
              onChange={(e) => set('onuType', e.target.value.trim())}
              placeholder="ZTE-F609"
            />
            <datalist id="onu-types">
              {TYPES.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </label>
          <NumberField label="VLAN" value={params.vlan} min={1} max={4094} onChange={(n) => set('vlan', n)} />
        </div>
        {vendors.length > 0 && (
          <div>
            <span className="label">Tipe ONU per vendor (4 huruf awal SN)</span>
            <div className="space-y-1.5">
              {vendors.map((v) => (
                <div key={v.prefix} className="flex items-center gap-2">
                  <span className="w-14 font-mono text-xs">{v.prefix}</span>
                  <span className="w-16 shrink-0 whitespace-nowrap text-right text-[11px] text-slate-400">{v.count} ONU</span>
                  <input
                    className="field !py-1.5 font-mono text-xs"
                    placeholder={params.onuType}
                    value={params.typeByVendor?.[v.prefix] ?? ''}
                    onChange={(e) =>
                      set('typeByVendor', { ...(params.typeByVendor ?? {}), [v.prefix]: e.target.value.trim() })
                    }
                  />
                </div>
              ))}
            </div>
            <span className="mt-1.5 block text-[11px] text-slate-400 dark:text-slate-500">
              Kosong = pakai Tipe ONU di atas. Isi dengan nama tipe yang sudah ada di OLT ZTE untuk ONU merek lain (mis. VSOL).
            </span>
          </div>
        )}

        <div>
          <span className="label">Kecepatan / nama profile</span>
          <input
            className="field font-mono"
            value={params.speed}
            onChange={(e) => set('speed', e.target.value.trim())}
            placeholder="30M"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {SPEEDS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => set('speed', s)}
                className={`chip ${params.speed === s ? '!border-cyan-500/60 !text-cyan-600 dark:!text-cyan-300' : ''}`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      <button className="btn-ghost" onClick={() => onChange(DEFAULT_PARAMS)}>
        <RotateCcw size={15} /> Reset parameter
      </button>
    </div>
  )
}
