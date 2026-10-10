import FacebookIcon from '@mui/icons-material/Facebook';
import InstagramIcon from '@mui/icons-material/Instagram';
import TwitterIcon from '@mui/icons-material/Twitter';
import YouTubeIcon from '@mui/icons-material/YouTube';
import { BandcampBrandIcon, DiscordBrandIcon, MixcloudBrandIcon, SoundCloudBrandIcon, SpotifyBrandIcon, TikTokBrandIcon, TwitchBrandIcon } from './components/SocialBrandIcons';

export const SOCIAL_PLATFORMS = [
  { key: 'social_twitch', label: 'Twitch', icon: TwitchBrandIcon },
  { key: 'social_instagram', label: 'Instagram', icon: InstagramIcon },
  { key: 'social_facebook', label: 'Facebook', icon: FacebookIcon },
  { key: 'social_twitter', label: 'X / Twitter', icon: TwitterIcon },
  { key: 'social_youtube', label: 'YouTube', icon: YouTubeIcon },
  { key: 'social_tiktok', label: 'TikTok', icon: TikTokBrandIcon },
  { key: 'social_soundcloud', label: 'SoundCloud', icon: SoundCloudBrandIcon },
  { key: 'social_mixcloud', label: 'Mixcloud', icon: MixcloudBrandIcon },
  { key: 'social_discord', label: 'Discord', icon: DiscordBrandIcon },
  { key: 'social_bandcamp', label: 'Bandcamp', icon: BandcampBrandIcon },
  { key: 'social_spotify', label: 'Spotify', icon: SpotifyBrandIcon },
];

export function safeSocialUrl(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  const hasUnsafeCharacter = [...trimmed].some(character => character === '\\' || character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127);
  if (!trimmed || !/^https?:\/\/[^/]/i.test(trimmed) || hasUnsafeCharacter) return null;
  try {
    const url = new URL(trimmed);
    return !url.username && !url.password && url.hostname ? trimmed : null;
  } catch {
    return null;
  }
}
