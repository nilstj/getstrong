/**
 * Router `location.state` carried when opening a shared gym problem from a list,
 * so the detail page (CrewPage) can offer prev/next through the exact list the
 * user was browsing — without going back to the overview.
 *
 * `boulderIds` is that list in display order. The detail page finds the current
 * id's index and navigates to its neighbours, passing the same state forward so
 * paging can continue. When absent (refresh, deep link, notification), the
 * detail page simply hides the prev/next control.
 */
/** The boulder page's tabs. Lives here so a caller passing `openTab` and the page
 *  reading it cannot drift apart. */
export type BoulderTab = 'beta' | 'sendtrain'

export interface BoulderNavState {
  /** Absent when the boulder wasn't opened from a browsable list — then prev/next
   *  is hidden. */
  boulderIds?: string[]
  /** Which tab to open on. Omitted means the page's own default. Set it when the
   *  reason for the tap lives on a particular tab — an ask for beta, say. */
  openTab?: BoulderTab
}
