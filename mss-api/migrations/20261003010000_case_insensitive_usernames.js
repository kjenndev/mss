// Additive only: preserve original spelling and fail closed on existing collisions.
// PostgreSQL rejects duplicate lower(username) values; Knex's migration transaction
// rolls back both indexes without renaming, merging or deleting any account.
export async function up(knex) {
  await knex.raw('CREATE UNIQUE INDEX users_username_lower_unique ON users (lower(username))');
  await knex.raw('CREATE UNIQUE INDEX pending_registrations_username_lower_unique ON pending_registrations (lower(username))');
}

export async function down(knex) {
  await knex.raw('DROP INDEX pending_registrations_username_lower_unique');
  await knex.raw('DROP INDEX users_username_lower_unique');
}
