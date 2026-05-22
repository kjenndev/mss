/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> } 
 */
export const seed = async function(knex) {
  // Deletes ALL existing entries
  // await knex('system_settings').del()
  
  const defaultSettings = [
    { key: 'site_title', value: 'Midnight Sound Syndicate', description: 'The name of the website' },
    { key: 'site_description', value: 'Discover and stay connected', description: 'Site tagline or subtitle' },
    { key: 'streaming_platform_url', value: 'http://localhost:5174', description: 'URL of the external streaming platform' },
    { key: 'disqus_shortname', value: 'midnight-sound-syndicate', description: 'Disqus shortname for comments' },
    { key: 'contact_email', value: 'admin@midnightsoundsyndicate.com', description: 'Contact email for the site' },
    { key: 'social_twitch', value: '', description: 'Main Twitch channel for the Syndicate' },
    { key: 'social_instagram', value: '', description: 'Instagram profile URL' },
    { key: 'social_facebook', value: '', description: 'Facebook page URL' },
    { key: 'api_base_url', value: 'http://localhost:4000', description: 'Base URL for the backend API' },
    { key: 'show_live_section', value: '1', description: 'Enable/Disable the live stream section (1 or 0)' },
    { key: 'about_content', value: '<h1>Welcome to MSS</h1><p>The Midnight Sound Syndicate is a collective of artists and creators...</p>', description: 'The content of the about page' },
    { key: 'about_cover_photo', value: '', description: 'Cover photo URL for the about page' },
  ];

  for (const s of defaultSettings) {
    const existing = await knex('system_settings').where({ key: s.key }).first();
    if (!existing) {
      await knex('system_settings').insert(s);
    }
  }
};
