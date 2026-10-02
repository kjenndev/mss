import { useState, useEffect } from 'react';
import { Box, Button, Typography, Alert } from '@mui/material';
import * as helpers from '../../Data.Helper.Api';
import { watchUrl } from '../../config';

/** Full external platform UI; identity and joining are owned by that platform. */
export default function SyndicatePlayer({ channelName, isPaused = false, onResume }) {
  const [platformUrl, setPlatformUrl] = useState('');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    helpers.GetSettings().then(async response => {
      if (!response.ok) throw new Error('Streaming platform configuration unavailable.');
      const { settings } = await response.json();
      if (!watchUrl(settings?.streaming_platform_url, channelName)) throw new Error('Streaming platform is not configured.');
      if (active) setPlatformUrl(settings.streaming_platform_url);
    }).catch(err => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [attempt, channelName]);
  if (!channelName) return null;
  if (error) return <Alert severity="error">{error}<Button onClick={() => { setError(''); setAttempt(n => n + 1); }}>Retry</Button></Alert>;
  if (!platformUrl) return <Typography role="status">Loading platform configuration...</Typography>;
  return <Box>
    <Typography variant="body2">Full platform player. A separate platform join is required; MSS login is not shared.</Typography>
    {isPaused ? <Box sx={{ p: 4 }}>
      <Typography>Platform player paused here.</Typography>
      <Typography>The other tab has its own join and playback controls.</Typography>
      <Button onClick={onResume}>Resume player</Button>
    </Box> : <iframe src={watchUrl(platformUrl, channelName)} title={`Full platform player - ${channelName}`} width="100%" height="600" style={{ border: 0, maxWidth: '100%' }} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen />}
  </Box>;
}
