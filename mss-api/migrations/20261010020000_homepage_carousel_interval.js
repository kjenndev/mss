export async function up(knex) {
  await knex('system_settings').insert({
    key: 'homepage_carousel_interval_seconds',
    value: '8',
    description: 'Seconds between automatic homepage carousel slides (1-3600)',
  });
}

export async function down(knex) {
  await knex('system_settings').where({ key: 'homepage_carousel_interval_seconds' }).del();
}
