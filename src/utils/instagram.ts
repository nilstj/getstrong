/**
 * An Instagram handle as a climber typed it, reduced to one of three states.
 * `empty` and `invalid` stay apart on purpose: the caller has to tell "they
 * cleared the field" (save null) from "they mistyped" (say so, change nothing).
 */
export type InstagramParse =
  | { status: 'empty' }
  | { status: 'ok'; handle: string }
  | { status: 'invalid' }

/**
 * A charset-and-length guard, not Instagram's actual handle rule — `.`, `..`,
 * `nils.` and `.nils` all pass here and Instagram issues none of them. Its
 * real job is narrower: a stored value can never contain the characters that
 * would let it escape the `https://instagram.com/` prefix in instagramUrl().
 * A well-formed-but-unissued handle can still be stored and will simply
 * render a dead link. Kept character-identical to the profiles.instagram_handle
 * check constraint (093) so client and database always agree.
 */
const HANDLE = /^[A-Za-z0-9._]{1,30}$/

/**
 * Accepts what people actually paste — a bare handle, an @handle, or a copied
 * profile URL — and reduces it to the handle alone. It never returns a URL, so
 * a stored value can only ever be turned back into an instagram.com link.
 */
export function parseInstagramHandle(input: string): InstagramParse {
  const handle = input
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^(?:www\.|m\.)?instagram\.com\/?/i, '')
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '')
    .replace(/^@/, '')
  if (handle === '') return { status: 'empty' }
  return HANDLE.test(handle) ? { status: 'ok', handle } : { status: 'invalid' }
}

/** The one place an Instagram URL is built. */
export function instagramUrl(handle: string): string {
  return `https://instagram.com/${handle}`
}
