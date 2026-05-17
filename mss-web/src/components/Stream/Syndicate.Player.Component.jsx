import { useEffect, useRef, useState } from 'react';
import mpegts from 'mpegts.js';
import Hls from 'hls.js';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';

export default function SyndicatePlayer({ url, hlsUrl: providedHlsUrl }) {
  const videoRef = useRef(null);
  const playerRef = useRef(null);
  const hlsRef = useRef(null);
  const [status, setStatus] = useState('initializing');
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!url) {
      return;
    }

    const videoElement = videoRef.current;
    const hlsUrl = providedHlsUrl || url.replace('.flv', '/index.m3u8');

    const cleanUp = () => {
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      if (videoElement) {
        videoElement.src = '';
        videoElement.load();
      }
    };

    const tryFLV = () => {
      if (mpegts.getFeatureList().mseLiveFlvPlayback) {
        console.log(`[Player] Attempting FLV: ${url}`);
        setStatus('loading');
        
        playerRef.current = mpegts.createPlayer({
          type: 'flv',
          isLive: true,
          url: url,
        }, {
          enableStashBuffer: false,
          liveBufferLatencyChasing: true,
        });

        playerRef.current.attachMediaElement(videoElement);
        playerRef.current.load();
        playerRef.current.play()
          .then(() => setStatus('playing'))
          .catch(() => tryHLS()); // Try HLS if play fails

        playerRef.current.on(mpegts.Events.ERROR, () => {
          console.warn('[Player] FLV Error, trying HLS...');
          tryHLS();
        });
      } else {
        tryHLS();
      }
    };

    const tryHLS = () => {
      cleanUp();
      console.log(`[Player] Attempting HLS: ${hlsUrl}`);
      setStatus('loading');

      if (Hls.isSupported()) {
        const hls = new Hls({
            enableWorker: true,
            lowLatencyMode: true,
        });
        hlsRef.current = hls;
        hls.loadSource(hlsUrl);
        hls.attachMedia(videoElement);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          videoElement.play()
            .then(() => setStatus('playing'))
            .catch(() => setStatus('paused'));
        });
        hls.on(Hls.Events.ERROR, (event, data) => {
          if (data.fatal) {
            console.error('[Player] Fatal HLS Error:', data);
            setError('Stream unavailable (HLS)');
            setStatus('error');
          }
        });
      } else if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
        // Native HLS (Safari)
        videoElement.src = hlsUrl;
        videoElement.addEventListener('loadedmetadata', () => {
          videoElement.play()
            .then(() => setStatus('playing'))
            .catch(() => setStatus('paused'));
        });
        videoElement.addEventListener('error', () => {
          setError('Stream unavailable (Native HLS)');
          setStatus('error');
        });
      } else {
        setError('Streaming not supported in this browser');
        setStatus('error');
      }
    };

    // Initial attempt: FLV
    tryFLV();

    return cleanUp;
  }, [url, providedHlsUrl]);

  return (
    <Box sx={{ width: '100%', bgcolor: '#000', borderRadius: '8px', overflow: 'hidden', position: 'relative', aspectRatio: '16/9' }}>
      <video
        ref={videoRef}
        controls
        autoPlay
        muted
        playsInline
        style={{ width: '100%', height: '100%', display: 'block', objectFit: 'contain' }}
      />
      
      {(status === 'loading' || status === 'initializing') && (
        <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'rgba(0,0,0,0.5)' }}>
          <CircularProgress size={40} />
        </Box>
      )}

      {error && (
        <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'rgba(0,0,0,0.8)', p: 4, textAlign: 'center' }}>
          <Typography color="error" variant="body2">{error}</Typography>
        </Box>
      )}
      
      {status === 'playing' && (
         <Box sx={{ position: 'absolute', top: 10, right: 10, bgcolor: 'rgba(255,0,0,0.8)', px: 1, borderRadius: 1 }}>
            <Typography variant="caption" sx={{ fontWeight: 800, color: '#fff' }}>LIVE</Typography>
         </Box>
      )}
    </Box>
  );
}
