// Additive, forward-only: existing accounts and settings are never rewritten.
export const config = { transaction: true };
export async function up(db) {
  await db.raw(`
    CREATE TABLE bookings (
      id uuid PRIMARY KEY, reference varchar(32) NOT NULL UNIQUE,
      submission_id uuid NOT NULL UNIQUE, submission_hash char(64) NOT NULL,
      venue_name varchar(200) NOT NULL, contact_name varchar(120) NOT NULL,
      phone varchar(50) NOT NULL, email varchar(254) NOT NULL,
      event_date date, location varchar(300) NOT NULL, event_type varchar(120) NOT NULL,
      estimated_attendance integer CHECK (estimated_attendance >= 0), budget varchar(120) NOT NULL,
      services jsonb NOT NULL, message text NOT NULL CHECK(length(message) <= 5000),
      missing_recipients integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX bookings_newest ON bookings(created_at DESC, id DESC);
    CREATE TABLE booking_comments (
      id uuid PRIMARY KEY, booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
      submission_id uuid NOT NULL, author_id integer REFERENCES users(id) ON DELETE SET NULL,
      author_name varchar(200) NOT NULL, content text NOT NULL CHECK(length(content) BETWEEN 1 AND 3000),
      created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(booking_id, submission_id)
    );
    CREATE INDEX booking_comments_order ON booking_comments(booking_id, created_at, id);
    CREATE TABLE booking_notifications (
      id uuid PRIMARY KEY, booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
      email varchar(254) NOT NULL, status varchar(16) NOT NULL DEFAULT 'pending'
        CHECK(status IN ('pending','sending','sent','failed','unavailable')),
      attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3),
      payload jsonb, first_attempt_at timestamptz, lease_until timestamptz,
      sent_at timestamptz, UNIQUE(booking_id,email)
    );
    CREATE TABLE booking_rate_limits (
      key char(64) PRIMARY KEY, count integer NOT NULL, expires_at timestamptz NOT NULL
    );
    CREATE INDEX booking_rate_expiry ON booking_rate_limits(expires_at);
  `);
}
export async function down() {
  throw Error("Forward-only: restore a reviewed backup");
}
