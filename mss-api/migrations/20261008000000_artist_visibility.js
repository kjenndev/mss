export async function up(knex) {
  await knex.schema.alterTable('artists', table => {
    table.boolean('is_disabled').notNullable().defaultTo(false);
  });
}
export async function down(knex) {
  await knex.schema.alterTable('artists', table => table.dropColumn('is_disabled'));
}
