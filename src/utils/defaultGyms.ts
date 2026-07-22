export function normalizeGyms(gyms: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of gyms) {
    const name = raw.trim()
    if (name === '') continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(name)
  }
  return out
}

export function primaryGym(gyms: string[]): string | null {
  return normalizeGyms(gyms)[0] ?? null
}

export function addGym(gyms: string[], name: string): string[] {
  return normalizeGyms([...gyms, name])
}

export function removeGym(gyms: string[], name: string): string[] {
  const key = name.trim().toLowerCase()
  return normalizeGyms(gyms.filter(g => g.trim().toLowerCase() !== key))
}

export function moveToFront(gyms: string[], name: string): string[] {
  const key = name.trim().toLowerCase()
  const normalized = normalizeGyms(gyms)
  const idx = normalized.findIndex(g => g.toLowerCase() === key)
  if (idx <= 0) return normalized
  const [picked] = normalized.splice(idx, 1)
  return [picked, ...normalized]
}
