import {
  ComposedChart, Bar, Line,
  XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
} from 'recharts'
import type { WeekBucket } from '../utils/stats'

interface Props {
  data: WeekBucket[]
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const sessions = payload.find((p: any) => p.dataKey === 'count')
  const minutes = payload.find((p: any) => p.dataKey === 'minutes')
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-sm text-xs">
      <p className="font-semibold text-gray-600 mb-1">{label}</p>
      {sessions && (
        <p className="text-gray-800">
          <span className="font-bold">{sessions.value}</span> session{sessions.value !== 1 ? 's' : ''}
        </p>
      )}
      {minutes && minutes.value > 0 && (
        <p className="text-orange-600">
          <span className="font-bold">{minutes.value}</span> min
        </p>
      )}
    </div>
  )
}

export function SessionFrequencyChart({ data }: Props) {
  const hasMinutes = data.some(d => d.minutes > 0)

  return (
    <ResponsiveContainer width="100%" height={170}>
      <ComposedChart data={data} margin={{ top: 4, right: hasMinutes ? 32 : 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
        <XAxis dataKey="week" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
        <YAxis
          yAxisId="sessions"
          allowDecimals={false}
          tick={{ fontSize: 10, fill: '#9ca3af' }}
          width={22}
          axisLine={false}
          tickLine={false}
        />
        {hasMinutes && (
          <YAxis
            yAxisId="minutes"
            orientation="right"
            tick={{ fontSize: 10, fill: '#f97316' }}
            width={30}
            axisLine={false}
            tickLine={false}
            unit="m"
          />
        )}
        <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f9fafb' }} />
        <Bar
          yAxisId="sessions"
          dataKey="count"
          name="Sessions"
          fill="#5a6649"
          radius={[4, 4, 0, 0]}
          maxBarSize={32}
        />
        {hasMinutes && (
          <Line
            yAxisId="minutes"
            dataKey="minutes"
            name="Minutes"
            stroke="#f97316"
            strokeWidth={2}
            dot={{ fill: '#f97316', r: 3, strokeWidth: 0 }}
            activeDot={{ r: 5, fill: '#f97316' }}
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  )
}
