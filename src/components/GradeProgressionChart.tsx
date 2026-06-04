import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Dot } from 'recharts'
import type { GradeDataPoint } from '../utils/stats'
import type { GradeMapping } from '../types'
import { FONT_GRADES_ORDERED } from '../utils/grades'

interface Props {
  data: GradeDataPoint[]
  gradeScale: 'font' | 'v_scale'
  mappings: GradeMapping[]
}

function CustomDot(props: any) {
  const { cx, cy, payload } = props
  const r = 3 + Math.min(payload.countAtMax - 1, 4) * 1.5
  return <circle cx={cx} cy={cy} r={r} fill="#4f46e5" stroke="white" strokeWidth={1.5} />
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
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null
            const d = payload[0].payload as GradeDataPoint
            return (
              <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs shadow-sm">
                <p className="text-gray-500 mb-1">{label}</p>
                <p className="font-semibold text-gray-900">{formatGrade(d.fontIndex)}</p>
                <p className="text-gray-500">{d.countAtMax} send{d.countAtMax !== 1 ? 's' : ''} at this grade</p>
              </div>
            )
          }}
        />
        <Line
          type="monotone"
          dataKey="fontIndex"
          stroke="#4f46e5"
          strokeWidth={2}
          dot={<CustomDot />}
          activeDot={{ r: 7, fill: '#4f46e5' }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
