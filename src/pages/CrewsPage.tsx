import { CrewsSection } from '../components/CrewsSection'

export function CrewsPage() {
  return (
    <div className="p-4 pb-32 space-y-4">
      <h1 className="text-xl font-bold">Crews</h1>
      <p className="text-sm text-gray-500">Shared boulders from your gyms — jump in, add beta, compare points.</p>
      <CrewsSection />
    </div>
  )
}
