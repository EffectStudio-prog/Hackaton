import React, { useMemo, useState } from 'react'

export interface BarDatum {
  day: string
  searches: number
}

interface BarChartCardProps {
  title: string
  subtitle: string
  data: BarDatum[]
  searchesLabel: string
}

const BarChartCard: React.FC<BarChartCardProps> = ({ title, subtitle, data, searchesLabel }) => {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const maxValue = useMemo(() => Math.max(...data.map(item => item.searches), 1), [data])
  const minWidth = useMemo(() => Math.max(data.length * 26, 352), [data.length])

  return (
    <div className="rounded-3xl border border-white/60 bg-white/85 p-4 shadow-xl shadow-slate-200/60 dark:border-slate-700/70 dark:bg-slate-900/75 dark:shadow-none sm:p-5">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-900 dark:text-white">{title}</p>
        <p className="mt-1 text-xs leading-6 text-slate-500 dark:text-slate-400">{subtitle}</p>
      </div>

      <div className="mt-6 overflow-x-auto pb-2">
        <div
          className="flex h-56 items-end gap-2 sm:h-64 sm:gap-3"
          style={{ minWidth }}
        >
          {data.map((item, index) => {
            const height = `${Math.max((item.searches / maxValue) * 100, 12)}%`
            const isActive = activeIndex === index

            return (
              <div key={item.day} className="relative flex flex-1 flex-col items-center justify-end">
                {isActive && (
                  <div className="mb-2 rounded-2xl border border-slate-200 bg-white/95 px-3 py-2 text-xs shadow-lg dark:border-slate-700 dark:bg-slate-950/95">
                    <p className="font-semibold text-slate-900 dark:text-white">{item.day}</p>
                    <p className="mt-1 text-slate-500 dark:text-slate-400">{item.searches} {searchesLabel}</p>
                  </div>
                )}
                <button
                  className="group flex h-full w-full items-end justify-center"
                  onMouseEnter={() => setActiveIndex(index)}
                  onFocus={() => setActiveIndex(index)}
                  onMouseLeave={() => setActiveIndex(null)}
                  onTouchStart={() => setActiveIndex(index)}
                >
                  <div
                    className={`w-full rounded-t-[1.25rem] bg-gradient-to-t from-brand-600 to-sky-400 transition-all duration-300 sm:rounded-t-3xl ${
                      isActive ? 'opacity-100 shadow-2xl shadow-sky-300/40' : 'opacity-85 group-hover:opacity-100'
                    }`}
                    style={{ height }}
                  />
                </button>
                <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400 sm:text-xs sm:tracking-[0.16em]">
                  {item.day}
                </p>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default BarChartCard
