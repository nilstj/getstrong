import { supabase } from './supabase'

/**
 * This codebase deliberately does not use a Supabase FK embed between content
 * tables and `profiles` — related rows are fetched in a second `.in('id', ids)`
 * query instead.
 */
export async function profilesByIds(ids: string[]) {
  const map = new Map<string, { username: string | null; avatar_url: string | null }>()
  if (ids.length === 0) return map
  const { data } = await supabase.from('profiles').select('id, username, avatar_url').in('id', ids)
  for (const p of data ?? []) {
    map.set(p.id as string, {
      username: p.username as string | null,
      avatar_url: p.avatar_url as string | null,
    })
  }
  return map
}
