import { isCanonicalArtistSlug, slugifyArtistName } from '../artist-slug.js';

export const config = { transaction: true };

export async function up(knex) {
  const artists = await knex('artists').select('id', 'name').orderBy('id');
  const slugs = new Map();
  const derived = artists.map(artist => {
    const slug = slugifyArtistName(artist.name);
    if (!slug || !isCanonicalArtistSlug(slug)) {
      throw new Error(`Artist slug backfill failed: artist ${artist.id} name cannot form a canonical slug`);
    }
    const prior = slugs.get(slug);
    if (prior !== undefined) {
      throw new Error(`Artist slug collision: artists ${prior} and ${artist.id} both derive "${slug}"`);
    }
    slugs.set(slug, artist.id);
    return { id: artist.id, slug };
  });

  // Keep the existing unique constraint active while removing legacy values
  // from the way. PostgreSQL unique constraints permit multiple NULLs, and
  // this migration's transaction restores every legacy value on any failure.
  if (derived.length) await knex('artists').whereIn('id', derived.map(artist => artist.id)).update({ slug: null });
  for (const artist of derived) await knex('artists').where({ id: artist.id }).update({ slug: artist.slug });
  await knex.raw(`
    ALTER TABLE artists ALTER COLUMN slug SET NOT NULL;
    ALTER TABLE artists ADD CONSTRAINT artists_slug_canonical
      CHECK (
        slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
        AND slug ~ '[a-z]'
        AND slug <> 'create'
        AND char_length(slug) <= 100
      );
    CREATE UNIQUE INDEX IF NOT EXISTS artists_slug_unique_canonical ON artists(slug);
  `);
}

export async function down() {
  throw new Error('Artist canonical slug migration is forward-only');
}
