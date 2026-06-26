import { useInfiniteQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { FeedEvent } from '../types'

const PAGE = 20

export type FeedEventEnriched = FeedEvent & {
  actorName: string | null
  actorAvatarUrl: string | null
}

export function useCrewFeed() {
  return useInfiniteQuery({
    queryKey: ['crew_feed'],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }): Promise<FeedEventEnriched[]> => {
      const { data, error } = await supabase.rpc('get_crew_feed', {
        p_limit: PAGE,
        p_before: pageParam,
      })
      if (error) throw error
      const events = (data ?? []) as FeedEvent[]
      const actorIds = Array.from(new Set(events.map(e => e.actor_id)))
      const profileById = new Map<string, { username: string | null; avatar_url: string | null }>()
      if (actorIds.length > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, username, avatar_url')
          .in('id', actorIds)
        for (const p of profs ?? []) {
          profileById.set(p.id as string, { username: p.username as string | null, avatar_url: p.avatar_url as string | null })
        }
      }
      return events.map(e => ({
        ...e,
        actorName: profileById.get(e.actor_id)?.username ?? null,
        actorAvatarUrl: profileById.get(e.actor_id)?.avatar_url ?? null,
      }))
    },
    getNextPageParam: last =>
      last.length === PAGE ? last[last.length - 1].event_at : undefined,
  })
}
