import { CrewsSection } from '../components/CrewsSection'
import { LatestProblemsStrip } from '../components/LatestProblemsStrip'

export function CrewsPage() {
  return (
    <div className="pb-32">
      <LatestProblemsStrip heading="Latest problems" />
      <div className="p-4 space-y-4">
        <h1 className="text-xl font-bold">Gym problems</h1>
        <p className="text-sm text-gray-500">Shared boulders from your gyms — jump on a sendtrain, add beta, compare points.</p>
        <CrewsSection />
      </div>
    </div>
  )
}
