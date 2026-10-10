import { Fragment, useSyncExternalStore } from 'react';
const events = ['mss-auth-change', 'mss-role-change', 'storage'];
function subscribe(listener) {
  events.forEach(event => window.addEventListener(event, listener));
  return () => events.forEach(event => window.removeEventListener(event, listener));
}
function snapshot() {
  return JSON.stringify([localStorage.getItem('mss-token'), localStorage.getItem('mss-role')]);
}
// Reset pages AND the retained player queue on identity/validated-role changes.
// Ordinary navigation and avatar changes retain playback and local drafts.
export default function VisibilityBoundary({ children }) {
  const identity = useSyncExternalStore(subscribe, snapshot);
  return <Fragment key={identity}>{children}</Fragment>;
}
