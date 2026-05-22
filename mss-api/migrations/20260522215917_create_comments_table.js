/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const up = async function(knex) {
  await knex.schema.createTable('comments', (table) => {
    table.increments('id').primary();
    table.text('content').notNullable();
    table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
    table.integer('artist_id').unsigned().references('id').inTable('artists').onDelete('CASCADE');
    table.integer('event_id').unsigned().references('id').inTable('events').onDelete('CASCADE');
    table.integer('parent_id').unsigned().references('id').inTable('comments').onDelete('CASCADE');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const down = async function(knex) {
  await knex.schema.dropTableIfExists('comments');
};
