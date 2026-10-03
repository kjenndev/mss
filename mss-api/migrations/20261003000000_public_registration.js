// Additive, transactional and forward-only. Legacy accounts remain usable without email.
export const config = { transaction: true };
export async function up(db) {
  await db.raw(`
 ALTER TABLE users ALTER COLUMN role SET DEFAULT 'user';
 ALTER TABLE users ADD COLUMN email varchar(254), ADD COLUMN email_verified_at timestamptz,
 ADD COLUMN email_alerts_opt_in boolean NOT NULL DEFAULT false,
 ADD COLUMN email_alerts_updated_at timestamptz,
 ADD COLUMN terms_version varchar(32), ADD COLUMN privacy_version varchar(32),
 ADD COLUMN terms_accepted_at timestamptz, ADD COLUMN adult_confirmed_at timestamptz;
 CREATE UNIQUE INDEX users_email_unique ON users(lower(email)) WHERE email IS NOT NULL;
 ALTER TABLE users ADD CONSTRAINT users_email_alert_eligibility CHECK (NOT email_alerts_opt_in OR (email IS NOT NULL AND email_verified_at IS NOT NULL));
 CREATE TABLE private_email_settings (
 id integer PRIMARY KEY CHECK(id=1), enabled boolean NOT NULL DEFAULT false,
 from_email varchar(254) NOT NULL DEFAULT '', from_name varchar(100) NOT NULL DEFAULT 'Midnight Sound Syndicate',
 reply_to varchar(254) NOT NULL DEFAULT 'support@midnightsoundsyndicate.com', public_url varchar(2048) NOT NULL DEFAULT '',
 api_key_encrypted text, updated_at timestamptz NOT NULL DEFAULT now());
 INSERT INTO private_email_settings(id) VALUES(1);
 CREATE TABLE pending_registrations (
 id uuid PRIMARY KEY, username varchar(100) NOT NULL UNIQUE, email varchar(254) NOT NULL UNIQUE,
 expires_at timestamptz NOT NULL);
 CREATE TABLE email_verifications (
 id uuid PRIMARY KEY, token_hash char(64) NOT NULL UNIQUE,
 pending_id uuid REFERENCES pending_registrations(id) ON DELETE CASCADE,
 user_id integer REFERENCES users(id) ON DELETE CASCADE,
 email varchar(254) NOT NULL, credential_binding char(64), expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK ((pending_id IS NOT NULL)::integer+(user_id IS NOT NULL)::integer=1));
 CREATE INDEX email_verifications_expiry ON email_verifications(expires_at);
 CREATE TABLE registration_rate_limits (key char(64) PRIMARY KEY, count integer NOT NULL, expires_at timestamptz NOT NULL);
 `);
}
export async function down() {
  throw Error("Forward-only: restore a reviewed backup");
}
