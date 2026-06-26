import { useInfiniteQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { FeedEvent } from '../types'

const PAGE = 20

export function useCrewFeed() {
  return useInfiniteQuery({
    queryKey: ['crew_feed'],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }): Promise<FeedEvent[]> => {
      const { data, error } = await supabase.rpc('get_crew_feed', {
        p_limit: PAGE,
        p_before: pageParam,
      })
      if (error) throw error
      return (data ?? []) as FeedEvent[]
    },
    getNextPageParam: last =>
      last.length === PAGE ? last[last.length - 1].event_at : undefined,
  })
}
