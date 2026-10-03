import { useState } from 'react';
import Avatar from '@mui/material/Avatar';
import { getImageUrl } from '../../config';

export default function ProfileAvatar({ src, name, sx }) {
  // Key the image state by URL so replacing a broken picture retries the new URL.
  return <AvatarImage key={src || 'initial'} src={src} name={name} sx={sx} />;
}
function AvatarImage({ src, name, sx }) {
  const [broken, setBroken] = useState(false);
  return <Avatar src={broken ? undefined : (src?.startsWith('blob:') ? src : getImageUrl(src)) || undefined} alt={`${name || 'Unknown user'}'s profile picture`} slotProps={{ img: { onError: () => setBroken(true) } }} sx={{ bgcolor: 'rgba(255,255,255,0.1)', color: '#90caf9', flexShrink: 0, ...sx }}>{(name || '?').charAt(0).toUpperCase()}</Avatar>;
}
