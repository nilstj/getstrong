import { supabase } from './supabase'

/**
 * Which of these climbers' sessions carry wisdom shared with their followers.
 *
 * Migration 032's policy does all the gating: a SELECT on `sessions` is
 * permitted only where `wisdom_shared` is true AND the caller follows the owner.
 * So a crewmate you don't follow contributes nothing here — which is exactly
 * right, because the hint must never promise something the session page would
 * then refuse to show.
 *
 * Non-fatal by design: both feeds this serves are built from world-readable
 * child rows, and losing a hint is not worth losing the feed. The limit matches
 * their own 300-row scan horizon, so it can never bound the result tighter than
 * the feed it decorates.
 */
export async function sharedWisdomSessionIds(userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set()
  const { data } = await supabase
    .from('sessions')
    .select('id')
    .in('user_id', userIds)
    .eq('wisdom_shared', true)
    .order('date', { ascending: false })
    .limit(300)
  return new Set((data ?? []).map(r => r.id as string))
}
