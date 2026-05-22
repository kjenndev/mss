/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const up = async function(knex) {
  await knex.schema.createTable('users', (table) => {
    table.increments('id').primary();
    table.string('username').unique().notNullable();
    table.string('password').notNullable();
    table.string('role').notNullable().defaultTo('artist');
    table.integer('artist_id');
    table.integer('is_disabled').defaultTo(0);
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('artists', (table) => {
    table.increments('id').primary();
    table.string('name').notNullable();
    table.string('location');
    table.text('description');
    table.string('profile_picture');
    table.string('twitch');
    table.string('soundcloud');
    table.string('mixcloud');
    table.string('youtube');
    table.string('cover_photo');
    table.string('twitch_stream_key');
    table.string('slug').unique();
    table.string('stream_key');
    table.string('channel_name');
    table.integer('user_id');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('artist_images', (table) => {
    table.increments('id').primary();
    table.integer('artist_id').notNullable();
    table.string('filename').notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('events', (table) => {
    table.increments('id').primary();
    table.string('title').notNullable();
    table.text('description');
    table.timestamp('date');
    table.string('location');
    table.string('ticket_link');
    table.string('flyer');
    table.integer('creator_id').notNullable();
    table.string('flyer_artist_name');
    table.string('flyer_artist_url');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('event_artists', (table) => {
    table.integer('event_id').notNullable();
    table.integer('artist_id').notNullable();
    table.primary(['event_id', 'artist_id']);
  });

  await knex.schema.createTable('event_images', (table) => {
    table.increments('id').primary();
    table.integer('event_id').notNullable();
    table.integer('artist_id').notNullable();
    table.string('filename').notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('sessions', (table) => {
    table.string('token').primary();
    table.integer('user_id').notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('system_settings', (table) => {
    table.string('key').primary();
    table.text('value');
    table.text('description');
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export const down = async function(knex) {
  await knex.schema.dropTableIfExists('system_settings');
  await knex.schema.dropTableIfExists('sessions');
  await knex.schema.dropTableIfExists('event_images');
  await knex.schema.dropTableIfExists('event_artists');
  await knex.schema.dropTableIfExists('events');
  await knex.schema.dropTableIfExists('artist_images');
  await knex.schema.dropTableIfExists('artists');
  await knex.schema.dropTableIfExists('users');
};
