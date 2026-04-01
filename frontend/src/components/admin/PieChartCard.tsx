import React, { useMemo, useState } from 'react'

export interface PieDatum {
  name: string
  value: number
  color: string
}

interface PieChartCardProps {
  title: string
  subtitle: string
  data: PieDatum[]
  totalLabel: string
  activeLabel: string
  searchesLabel: string
}

const polarToCartesian = (cx: number, cy: number, r: number, angle: number) => {
  const radians = ((angle - 90) * Math.PI) / 180
  return {
    x: cx + r * Math.cos(radians),
    y: cy + r * Math.sin(radians),
  }
}

const describeArc = (cx: number, cy: number, r: number, startAngle: number, endAngle: number) => {
  const start = polarToCartesian(cx, cy, r, endAngle)
  const end = polarToCartesian(cx, cy, r, startAngle)
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1'

  return [
    `M ${cx} ${cy}`,
    `L ${start.x} ${start.y}`,
    `A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`,
    'Z',
  ].join(' ')
}

const PieChartCard: React.FC<PieChartCardProps> = ({
  title,
  subtitle,
  data,
  totalLabel,
  activeLabel,
  searchesLabel,
}) => {
  const [activeIndex, setActiveIndex] = useState(0)

  const total = useMemo(() => data.reduce((sum, item) => sum + item.value, 0), [data])

  const slices = useMemo(() => {
    let currentAngle = 0
    if (total <= 0) {
      return data.map(item => ({
        ...item,
        startAngle: 0,
        endAngle: 0,
        percentage: 0,
      }))
    }

    return data.map((item) => {
      const angle = (item.value / total) * 360
      const startAngle = currentAngle
      const endAngle = currentAngle + angle
      currentAngle += angle

      return {
        ...item,
        startAngle,
        endAngle,
        percentage: Math.round((item.value / total) * 100),
      }
    })
  }, [data, total])

  const activeSlice = slices[activeIndex] ?? slices[0]

  return (
    <div className="rounded-3xl border border-white/60 bg-white/85 p-4 shadow-xl shadow-slate-200/60 dark:border-slate-700/70 dark:bg-slate-900/75 dark:shadow-none sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">{title}</p>
          <p className="mt-1 text-xs leading-6 text-slate-500 dark:text-slate-400">{subtitle}</p>
        </div>
        <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300 whitespace-nowrap">
          {total} {totalLabel}
        </div>
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-[250px_minmax(0,1fr)] xl:items-center">
        <div className="relative mx-auto h-[200px] w-[200px] sm:h-[230px] sm:w-[230px]">
          <svg viewBox="0 0 220 220" className="h-full w-full drop-shadow-[0_10px_24px_rgba(15,23,42,0.08)]">
            {slices.map((slice, index) => (
              <path
                key={slice.name}
                d={describeArc(110, 110, index === activeIndex ? 92 : 84, slice.startAngle, slice.endAngle)}
                fill={slice.color}
                className="cursor-pointer transition-all duration-300"
                style={{ opacity: index === activeIndex ? 1 : 0.82 }}
                onMouseEnter={() => setActiveIndex(index)}
              />
            ))}
            <circle cx="110" cy="110" r="50" fill="white" className="dark:fill-slate-900" />
            <text x="110" y="100" textAnchor="middle" className="fill-slate-500 text-[11px] font-semibold uppercase tracking-[0.25em] dark:fill-slate-400">
              {activeLabel}
            </text>
            <text x="110" y="124" textAnchor="middle" className="fill-slate-950 text-[22px] font-black dark:fill-white">
              {activeSlice?.percentage ?? 0}%
            </text>
          </svg>

          {activeSlice && (
            <div className="absolute left-1/2 top-2 -translate-x-1/2 rounded-2xl border border-slate-200 bg-white/95 px-3 py-2 text-xs shadow-lg dark:border-slate-700 dark:bg-slate-950/95 sm:left-auto sm:right-0 sm:translate-x-0">
              <p className="font-semibold text-slate-900 dark:text-white">{activeSlice.name}</p>
              <p className="mt-1 text-slate-500 dark:text-slate-400">{activeSlice.value} {searchesLabel}</p>
            </div>
          )}
        </div>

        <div className="space-y-3">
          {slices.map((slice, index) => (
            <button
              key={slice.name}
              onMouseEnter={() => setActiveIndex(index)}
              onFocus={() => setActiveIndex(index)}
              onTouchStart={() => setActiveIndex(index)}
              className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition-all ${
                index === activeIndex
                  ? 'border-slate-300 bg-slate-50 shadow-md dark:border-slate-600 dark:bg-slate-800/80'
                  : 'border-slate-200/70 bg-white/80 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900/50'
              }`}
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: slice.color }} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{slice.name}</p>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">{slice.value} {searchesLabel}</p>
                </div>
              </div>
              <span className="pl-3 text-sm font-black text-slate-700 dark:text-slate-200">{slice.percentage}%</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export default PieChartCard
