import React from 'react'
import { LucideIcon, TrendingUp } from 'lucide-react'

interface StatsCardProps {
  title: string
  value: string
  change: string
  icon: LucideIcon
  tone?: 'blue' | 'emerald' | 'amber' | 'rose'
}

const toneMap = {
  blue: 'from-sky-500/15 to-blue-500/10 text-sky-700 dark:text-sky-300',
  emerald: 'from-emerald-500/15 to-teal-500/10 text-emerald-700 dark:text-emerald-300',
  amber: 'from-amber-500/15 to-orange-500/10 text-amber-700 dark:text-amber-300',
  rose: 'from-rose-500/15 to-red-500/10 text-rose-700 dark:text-rose-300',
}

const StatsCard: React.FC<StatsCardProps> = ({
  title,
  value,
  change,
  icon: Icon,
  tone = 'blue',
}) => {
  return (
    <div className="group rounded-3xl border border-white/60 bg-white/80 p-4 shadow-lg shadow-slate-200/60 transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-slate-200/80 dark:border-slate-700/70 dark:bg-slate-900/75 dark:shadow-none sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400 sm:text-xs sm:tracking-[0.16em] truncate">
            {title}
          </p>
          <p className="mt-3 text-2xl font-black tracking-tight text-slate-950 dark:text-white sm:text-3xl">
            {value}
          </p>
        </div>
        <div className={`rounded-2xl bg-gradient-to-br p-2.5 sm:p-3 ${toneMap[tone]}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>

      <div className="mt-5 inline-flex max-w-full items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
        <TrendingUp className="w-3.5 h-3.5" />
        <span className="truncate">{change}</span>
      </div>
    </div>
  )
}

export default StatsCard
