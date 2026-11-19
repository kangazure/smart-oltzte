import { CircleCheck, CircleX, Info } from 'lucide-react'
import type { ToastType } from '../lib/types'

export interface ToastMsg {
  id: number
  type: ToastType
  text: string
}

const STYLE: Record<ToastType, { icon: typeof Info; cls: string }> = {
  ok: { icon: CircleCheck, cls: 'text-emerald-500' },
  err: { icon: CircleX, cls: 'text-rose-500' },
  info: { icon: Info, cls: 'text-cyan-500' },
}

export default function Toasts({ items }: { items: ToastMsg[] }) {
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(92vw,360px)] flex-col gap-2">
      {items.map((t) => {
        const { icon: Icon, cls } = STYLE[t.type]
        return (
          <div
            key={t.id}
            className="glass pointer-events-auto flex animate-toast-in items-center gap-2.5 !bg-white/90 px-3.5 py-2.5 text-sm shadow-lg dark:!bg-slate-900/90"
          >
            <Icon size={18} className={`shrink-0 ${cls}`} />
            <span>{t.text}</span>
          </div>
        )
      })}
    </div>
  )
}
