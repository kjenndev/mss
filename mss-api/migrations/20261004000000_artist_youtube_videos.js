export async function up(knex) {
  await knex.schema.createTable('artist_youtube_videos', table => {
    table.integer('artist_id').unsigned().notNullable().references('id').inTable('artists').onDelete('CASCADE');
    table.string('video_id', 11).notNullable();
    table.string('title', 200).notNullable();
    table.text('artwork_url').nullable();
    table.double('duration_seconds').notNullable();
    table.timestamp('published_at', { useTz: true }).notNullable();
    table.timestamp('fetched_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.primary(['artist_id', 'video_id']);
    table.index(['published_at']);
  });
  await knex.raw("ALTER TABLE artist_youtube_videos ADD CONSTRAINT youtube_video_id_valid CHECK (video_id ~ '^[A-Za-z0-9_-]{11}$'), ADD CONSTRAINT youtube_duration_positive CHECK (duration_seconds > 0 AND duration_seconds < 'Infinity'::float8)");
}
export async function down(knex) {
  await knex.schema.dropTable('artist_youtube_videos');
}
