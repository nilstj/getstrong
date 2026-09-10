/**
 * An Instagram handle as a climber typed it, reduced to one of three states.
 * `empty` and `invalid` stay apart on purpose: the caller has to tell "they
 * cleared the field" (save null) from "they mistyped" (say so, change nothing).
 */
export type InstagramParse =
  | { status: 'empty' }
  | { status: 'ok'; handle: string }
  | { status: 'invalid' }

/** Kept identical to the profiles.instagram_handle check constraint (093). */
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
    .replace(/^(?:www\.|m\.)?instagram\.com\//i, '')
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
