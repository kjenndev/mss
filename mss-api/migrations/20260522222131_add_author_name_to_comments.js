/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const up = async function(knex) {
  await knex.schema.table('comments', (table) => {
    table.string('author_name');
  });
  
  // Migrate existing comments to use the poster's display_name or username if available
  // This is a bit complex for a migration but good for data integrity
  const comments = await knex('comments').select('id', 'user_id');
  for (const comment of comments) {
    if (comment.user_id) {
        const user = await knex('users').where({ id: comment.user_id }).first();
        if (user) {
            await knex('comments')
                .where({ id: comment.id })
                .update({ author_name: user.display_name || user.username });
        }
    }
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const down = async function(knex) {
  await knex.schema.table('comments', (table) => {
    table.dropColumn('author_name');
  });
};
