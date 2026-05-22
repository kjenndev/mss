/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const up = async function(knex) {
  await knex.schema.table('users', (table) => {
    table.string('display_name');
  });
  
  // Set default display_name to username for existing users
  await knex('users').update({
    display_name: knex.ref('username')
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const down = async function(knex) {
  await knex.schema.table('users', (table) => {
    table.dropColumn('display_name');
  });
};
