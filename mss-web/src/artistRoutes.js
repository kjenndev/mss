export function artistProfilePath(artist) {
  const slug = artist?.slug;
  if (typeof slug !== 'string'
    || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
    || !/[a-z]/.test(slug)
    || slug === 'create'
    || slug.length > 100) {
    throw new Error('Artist profile requires a canonical slug');
  }
  return `/artists/${encodeURIComponent(slug)}`;
}
