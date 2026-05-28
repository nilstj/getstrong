import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts'
import type { WeekBucket } from '../utils/stats'

interface Props {
  data: WeekBucket[]
}

export function SessionFrequencyChart({ data }: Props) {
  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="week" tick={{ fontSize: 10 }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 10 }} width={24} />
        <Tooltip labelStyle={{ fontSize: 12 }} />
        <Bar dataKey="count" fill="#4f46e5" name="Sessions" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
