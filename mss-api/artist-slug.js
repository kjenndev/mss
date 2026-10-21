const MAX_ARTIST_SLUG_LENGTH = 100;
const RESERVED_ARTIST_SLUGS = new Set(['create']);

/**
 * Artist URL policy: compatibility-decompose Unicode, remove combining marks,
 * lowercase, collapse every non-ASCII letter/digit run to one hyphen, trim
 * edge hyphens, then cap at 100 characters without leaving a trailing hyphen.
 * Names with no ASCII letters, numeric-only results, and reserved routes
 * cannot form a profile URL.
 */
export function slugifyArtistName(name) {
  if (typeof name !== 'string') return '';
  return name
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_ARTIST_SLUG_LENGTH)
    .replace(/-+$/g, '');
}

export function isCanonicalArtistSlug(value) {
  return typeof value === 'string'
    && value.length <= MAX_ARTIST_SLUG_LENGTH
    && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
    && /[a-z]/.test(value)
    && !RESERVED_ARTIST_SLUGS.has(value);
}

export { MAX_ARTIST_SLUG_LENGTH };
