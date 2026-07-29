import { useState } from 'react'
import { CrewsSection } from '../components/CrewsSection'
import { AddGymBoulderSheet } from '../components/AddGymBoulderSheet'
import { FAB } from '../components/FAB'

export function CrewsPage() {
  const [addOpen, setAddOpen] = useState(false)

  return (
    <div className="p-4 pb-32 space-y-4">
      <h1 className="text-xl font-bold">Gym problems</h1>
      <p className="text-sm text-gray-500">Shared boulders from your gyms — jump on a sendtrain, add beta, compare points.</p>
      <CrewsSection />

      <FAB onClick={() => setAddOpen(true)} label="Add a gym boulder" />
      {/* Mounted only while open, so the page load doesn't pay for the sheet's
          gym-suggestion query. Same shape as SessionDetailPage's link sheet. */}
      {addOpen && <AddGymBoulderSheet open onClose={() => setAddOpen(false)} />}
    </div>
  )
}
