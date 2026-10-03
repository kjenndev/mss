export async function up(knex) {
  await knex.schema.alterTable('users', table => { table.text('profile_picture').nullable(); });
}

export async function down(knex) {
  await knex.schema.alterTable('users', table => { table.dropColumn('profile_picture'); });
}
