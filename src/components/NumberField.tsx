import { useEffect, useState } from 'react'

interface Props {
  label: string
  value: number
  min: number
  max: number
  onChange: (n: number) => void
  hint?: string
}

export default function NumberField({ label, value, min, max, onChange, hint }: Props) {
  const [text, setText] = useState(String(value))
  useEffect(() => {
    setText(String(value))
  }, [value])

  return (
    <label className="block">
      <span className="label">{label}</span>
      <input
        className="field font-mono"
        inputMode="numeric"
        value={text}
        onChange={(e) => {
          const t = e.target.value.replace(/\D/g, '').slice(0, 5)
          setText(t)
          if (t !== '') {
            const n = Number(t)
            if (n >= min && n <= max) onChange(n)
          }
        }}
        onBlur={() => setText(String(value))}
      />
      {hint && <span className="mt-1 block text-[11px] text-slate-400 dark:text-slate-500">{hint}</span>}
    </label>
  )
}
