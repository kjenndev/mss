import { useState } from 'react';
import { flushSync } from 'react-dom';
import { useMediaPlayer } from './MediaPlayerContext';
import { youtubeVideoId } from './mediaUrls';
// Local to the route: navigation unmounts the selected video, never the audio dock.
export function useLocalVideo() {
 const player = useMediaPlayer();
 const [selected, setSelected] = useState(null);
 const video = selected && !player?.item && selected.audioVersion === player?.selectionVersion ? selected.item : null;
 const closeVideo = () => setSelected(null);
 const selectVideo = item => {
  if (!youtubeVideoId(item) || item.playable === false || item.providerAccess === 'blocked') return;
  // Commit audio iframe removal before even requesting a video mount/autoplay.
  flushSync(() => player?.close());
  setSelected({ item, audioVersion: player?.selectionVersion });
  window.scrollTo({ top: 0, behavior: 'auto' });
 };
 return { video, selectVideo, closeVideo };
}
