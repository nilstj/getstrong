import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts'
import type { GradeDataPoint } from '../utils/stats'
import type { GradeMapping } from '../types'
import { FONT_GRADES_ORDERED } from '../utils/grades'

interface Props {
  data: GradeDataPoint[]
  gradeScale: 'font' | 'v_scale'
  mappings: GradeMapping[]
}

export function GradeProgressionChart({ data, gradeScale, mappings }: Props) {
  if (data.length === 0) {
    return (
      <div className="h-40 flex items-center justify-center text-gray-400 text-sm bg-gray-50 rounded-xl">
        No graded sends yet
      </div>
    )
  }

  const formatGrade = (fontIndex: number): string => {
    const grade = FONT_GRADES_ORDERED[fontIndex]
    if (!grade) return String(fontIndex)
    if (gradeScale === 'v_scale') {
      return mappings.find(m => m.font_equivalent === grade)?.v_scale ?? grade
    }
    return grade
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="date" tick={{ fontSize: 10 }} />
        <YAxis tickFormatter={formatGrade} tick={{ fontSize: 10 }} width={36} />
        <Tooltip
          formatter={(value: unknown) => [formatGrade(value as number), 'Grade']}
          labelStyle={{ fontSize: 12 }}
        />
        <Line
          type="monotone"
          dataKey="fontIndex"
          stroke="#4f46e5"
          strokeWidth={2}
          dot={{ r: 4, fill: '#4f46e5' }}
          activeDot={{ r: 6 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
