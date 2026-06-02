interface StatCardProps {
  label: string
  value: string | number
}

export function StatCard({ label, value }: StatCardProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4">
      <p className="text-[11px] text-gray-400 font-semibold uppercase tracking-widest">{label}</p>
      <p className="text-3xl font-bold text-black mt-1 tracking-tight">{value}</p>
    </div>
  )
}
