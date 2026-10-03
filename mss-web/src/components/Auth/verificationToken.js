// Capture before rendering the router or any third-party media. Never persist tokens.
let initialToken = '';
export function captureVerificationToken() {
  if (window.location.pathname !== '/verify-email' || !window.location.hash) return '';
  const token = new URLSearchParams(window.location.hash.slice(1)).get('token') || '';
  window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
  return token;
}
initialToken = captureVerificationToken();
export function takeVerificationToken() {
  const token = initialToken || captureVerificationToken();
  initialToken = '';
  return token;
}
