import { useState, useEffect } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import * as helpers from '../../Data.Helper.Api';

/**
 * SyndicatePlayer acts as an iframe wrapper for the external streaming-platform.
 * Supports auto-pause when a user joins the full chat experience.
 */
export default function SyndicatePlayer({ channelName, isPaused = false, onResume }) {
  const [platformUrl, setPlatformUrl] = useState('http://localhost:5174');

  useEffect(() => {
    helpers.GetSettings().then(async (res) => {
        if (res.ok) {
            const data = await res.json();
            if (data.settings?.streaming_platform_url) {
                setPlatformUrl(data.settings.streaming_platform_url);
            }
        }
    });
  }, []);

  if (!channelName) {
    return null;
  }

  const streamUrl = `${platformUrl}/watch/${channelName}?embed=true`;

  return (
    <Box sx={{ 
      width: '100%', 
      bgcolor: '#000', 
      borderRadius: '8px', 
      overflow: 'hidden', 
      position: 'relative', 
      aspectRatio: '16/9',
      border: '1px solid rgba(255,255,255,0.1)'
    }}>
      {!isPaused ? (
        <iframe
          src={streamUrl}
          title={`Syndicate Live - ${channelName}`}
          width="100%"
          height="100%"
          style={{ border: 'none' }}
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
        />
      ) : (
        <Box 
          sx={{ 
            width: '100%', 
            height: '100%', 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center', 
            justifyContent: 'center',
            bgcolor: 'rgba(0,0,0,0.85)',
            gap: 2
          }}
        >
          <Typography variant="h6" sx={{ fontWeight: 700, color: 'primary.main' }}>
            Local Feed Paused
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center', px: 4, mb: 1 }}>
            You are now participating in the full chat experience in another tab.
          </Typography>
          <Button 
            variant="contained" 
            startIcon={<PlayArrowIcon />} 
            onClick={onResume}
            sx={{ borderRadius: '20px', px: 4 }}
          >
            Resume Local Stream
          </Button>
        </Box>
      )}
    </Box>
  );
}
