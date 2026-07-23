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
export interface BoulderNavState {
  boulderIds: string[]
}
