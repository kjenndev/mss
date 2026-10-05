export async function up(knex) {
 await knex.schema.createTable('home_featured_videos', table=>{
  table.string('video_id',11).primary();
  table.integer('position').notNullable().unique();
  table.string('title',200).notNullable();
  table.text('artwork_url').nullable();
  table.double('duration_seconds').notNullable();
  table.timestamp('published_at',{useTz:true}).notNullable();
  table.timestamp('fetched_at',{useTz:true}).notNullable().defaultTo(knex.fn.now());
 });
 await knex.raw('ALTER TABLE home_featured_videos ADD CONSTRAINT home_featured_position CHECK (position >= 0 AND position < 100), ADD CONSTRAINT home_featured_duration CHECK (duration_seconds > 0)');
}
export async function down(knex) {await knex.schema.dropTable('home_featured_videos');}
