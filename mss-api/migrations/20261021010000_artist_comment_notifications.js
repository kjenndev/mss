// Add artist-comment mail to the existing durable notification outbox.
export const config = { transaction: true };

export async function up(db) {
  await db.raw(`
    ALTER TABLE booking_notifications ALTER COLUMN booking_id DROP NOT NULL;
    ALTER TABLE booking_notifications
      ADD COLUMN comment_id integer REFERENCES comments(id) ON DELETE CASCADE,
      ADD CONSTRAINT booking_notifications_one_target CHECK (
        (booking_id IS NOT NULL AND comment_id IS NULL) OR
        (booking_id IS NULL AND comment_id IS NOT NULL)
      );
    CREATE UNIQUE INDEX booking_notifications_comment_email_unique
      ON booking_notifications(comment_id, email) WHERE comment_id IS NOT NULL;
  `);
}

export async function down() {
  throw Error('Forward-only: restore a reviewed backup');
}
