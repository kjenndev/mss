import { createContext, useContext } from 'react';
export const MediaPlayerContext = createContext(null);
export const useMediaPlayer = () => useContext(MediaPlayerContext);
