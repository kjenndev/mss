// PostgreSQL only. Knex runs this entire migration in one transaction.
// Every constraint is VALIDATED: inconsistent legacy data aborts, never silently repairs/deletes.
// Preserve existing passwords, secrets, sessions and original columns. Review failures privately.
export const config = { transaction: true };
export async function up(knex) {
  await knex.raw(`
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM users u LEFT JOIN artists a ON a.id = u.artist_id
                 WHERE u.artist_id IS NOT NULL AND (a.id IS NULL OR a.user_id IS DISTINCT FROM u.id)) THEN
        RAISE EXCEPTION 'Primary artist ownership inconsistency: reconcile explicitly before migration';
      END IF;
    END $$;

    ALTER TABLE users ADD CONSTRAINT users_artist_fk FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE SET NULL;
    ALTER TABLE artists ADD CONSTRAINT artists_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
    ALTER TABLE artist_images ADD CONSTRAINT artist_images_artist_fk FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE;
    ALTER TABLE events ALTER COLUMN creator_id DROP NOT NULL;
    ALTER TABLE events ADD CONSTRAINT events_creator_fk FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE SET NULL;
    ALTER TABLE event_artists ADD CONSTRAINT event_artists_event_fk FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE;
    ALTER TABLE event_artists ADD CONSTRAINT event_artists_artist_fk FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE;
    ALTER TABLE event_images ALTER COLUMN artist_id DROP NOT NULL;
    ALTER TABLE event_images ADD CONSTRAINT event_images_event_fk FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE;
    ALTER TABLE event_images ADD CONSTRAINT event_images_artist_fk FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE SET NULL;
    ALTER TABLE sessions ADD CONSTRAINT sessions_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
    ALTER TABLE sessions ADD COLUMN expires_at timestamptz;
    UPDATE sessions SET expires_at = COALESCE(created_at + interval '24 hours', timestamp '1970-01-01');
    ALTER TABLE sessions ALTER COLUMN expires_at SET NOT NULL;
    CREATE INDEX sessions_expiry_idx ON sessions(expires_at);
    CREATE INDEX sessions_user_idx ON sessions(user_id);
    ALTER TABLE artists ADD CONSTRAINT artists_channel_name_check CHECK (channel_name IS NULL OR channel_name = '' OR channel_name ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$');
    CREATE UNIQUE INDEX artists_channel_unique ON artists(channel_name) WHERE channel_name IS NOT NULL AND channel_name <> '';
    ALTER TABLE comments ADD CONSTRAINT comments_exactly_one_target CHECK ((artist_id IS NOT NULL)::int + (event_id IS NOT NULL)::int = 1);
    ALTER TABLE comments ADD CONSTRAINT comments_not_own_parent CHECK (parent_id IS NULL OR parent_id <> id);
    ALTER TABLE comments ADD CONSTRAINT comments_id_artist_unique UNIQUE (id, artist_id);
    ALTER TABLE comments ADD CONSTRAINT comments_id_event_unique UNIQUE (id, event_id);
    ALTER TABLE comments ADD CONSTRAINT comments_parent_artist_fk FOREIGN KEY (parent_id, artist_id) REFERENCES comments(id, artist_id) ON DELETE CASCADE;
    ALTER TABLE comments ADD CONSTRAINT comments_parent_event_fk FOREIGN KEY (parent_id, event_id) REFERENCES comments(id, event_id) ON DELETE CASCADE;
    CREATE INDEX comments_artist_id_idx ON comments(artist_id, id);
    CREATE INDEX comments_event_id_idx ON comments(event_id, id);
    CREATE TABLE uploads (
      filename varchar(255) PRIMARY KEY,
      user_id integer REFERENCES users(id) ON DELETE SET NULL,
      bytes bigint NOT NULL CHECK (bytes >= 0),
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX uploads_user_idx ON uploads(user_id);
    ALTER TABLE event_images ADD COLUMN uploader_user_id integer REFERENCES users(id) ON DELETE SET NULL;
    ALTER TABLE artist_images ADD COLUMN uploader_user_id integer REFERENCES users(id) ON DELETE SET NULL;
  `);
}
export async function down() {
  throw new Error('Audit hardening is forward-only; restore a reviewed backup rather than dropping safeguards or upload accounting.');
}
