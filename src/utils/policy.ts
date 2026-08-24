/**
 * Bump this when the notice changes materially. PolicyGate compares it against
 * profiles.policy_version, so bumping it re-prompts everyone -- which is the
 * only way a revision reaches people who signed up under the old text.
 */
export const POLICY_VERSION = '2026-08-24'

/** Sentinel for a fact only the owner can supply. */
export const UNSET = '__UNSET__'

/**
 * The three facts that cannot be read out of the codebase. While any of them is
 * UNSET, /privacy renders a warning naming it, so an incomplete legal notice
 * cannot quietly go live looking finished.
 */
export const CONTROLLER = {
  name: UNSET,
  email: UNSET,
  supabaseRegion: UNSET,
}

const FACT_LABELS: [keyof typeof CONTROLLER, string][] = [
  ['name', 'controller name'],
  ['email', 'contact address'],
  ['supabaseRegion', 'Supabase region'],
]

export function unresolvedControllerFacts(
  controller: { name: string; email: string; supabaseRegion: string },
): string[] {
  return FACT_LABELS
    .filter(([key]) => {
      const value = controller[key]
      return !value.trim() || value === UNSET
    })
    .map(([, label]) => label)
}

export function hasAcceptedCurrentPolicy(
  profile: { policy_version: string | null } | undefined | null,
): boolean {
  return profile?.policy_version === POLICY_VERSION
}
