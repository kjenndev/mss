// Additive provenance: never infer artist authorship for historical comments.
// author_name remains the public posting-time label; the snapshot distinguishes
// artist authorship even after the associated artist is deleted or transferred.
export async function up(knex) {
  await knex.schema.table('comments', table => {
    table.integer('author_artist_id').unsigned().nullable().references('id').inTable('artists').onDelete('SET NULL');
    table.string('author_artist_name', 200).nullable();
  });
}
export async function down(knex) {
  await knex.schema.table('comments', table => {
    table.dropColumn('author_artist_id');
    table.dropColumn('author_artist_name');
  });
}
