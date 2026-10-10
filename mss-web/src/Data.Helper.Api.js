import { API_BASE } from './config';
export const SubmitBooking = data => request('/bookings', 'POST', data, false);
export const GetBookings = (page = 1, pageSize = 20) => request(`/admin/bookings?page=${encodeURIComponent(page)}&pageSize=${encodeURIComponent(pageSize)}`);
export const GetBooking = id => request(`/admin/bookings/${encodeURIComponent(id)}`);
export const AddBookingComment = (id, data) => request(`/admin/bookings/${encodeURIComponent(id)}/comments`, 'POST', data);
export const RetryBookingNotifications = id => request(`/admin/bookings/${encodeURIComponent(id)}/retry-notifications`, 'POST', {});
export const GetHomeFeaturedVideos = () => request('/home-featured-videos', 'GET', null, false);
export const PreviewHomeFeaturedVideo = url => request('/home-featured-videos/preview', 'POST', {url});
export const SaveHomeFeaturedVideos = urls => request('/home-featured-videos', 'PUT', {urls});
export const GetArtistYouTubeVideos = id => request(`/artists/${id}/youtube-videos`);
export const SetArtistVisibility = (id, is_disabled) => request(`/artists/${id}/visibility`, 'PUT', { is_disabled });
export const AddArtistYouTubeVideo = (id, url, refresh = false) => request(`/artists/${id}/youtube-videos`, 'POST', { url, ...(refresh ? { refresh: true } : {}) });
export const DeleteArtistYouTubeVideo = (id, videoId) => request(`/artists/${id}/youtube-videos/${encodeURIComponent(videoId)}`, 'DELETE');

function dispatchAuthChange() {
  window.dispatchEvent(new CustomEvent('mss-auth-change'));
}

function setSession(session, notify = true) {
  const previousRole = localStorage.getItem('mss-role');
  localStorage.setItem('mss-token', session.token);
  localStorage.setItem('mss-user', session.user.username);
  localStorage.setItem('mss-user-id', session.user.id);
  localStorage.setItem('mss-role', session.user.role);
  localStorage.setItem('mss-artist-id', session.user.artist_id || '');
  if (notify) dispatchAuthChange();
  else if (previousRole !== session.user.role) window.dispatchEvent(new Event('mss-role-change'));
}

function clearSession() {
  localStorage.removeItem('mss-token');
  localStorage.removeItem('mss-user');
  localStorage.removeItem('mss-user-id');
  localStorage.removeItem('mss-role');
  localStorage.removeItem('mss-artist-id');
  dispatchAuthChange();
}

function getAuthHeaders() {
  const token = localStorage.getItem('mss-token');
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

async function request(path, method = 'GET', body = null, auth = true, formData = false) {
  const visibilityRead = method === 'GET' && /^\/(admin\/bookings|artists|users\/me\/artists|images|live|streams|media-library|feed|events|comments)/.test(path);
  const sentRole = localStorage.getItem('mss-role');
  const sentToken = auth ? localStorage.getItem('mss-token') : null;
  const headers = formData ? {} : auth ? getAuthHeaders() : { 'Content-Type': 'application/json' };
  if (formData && auth) {
    const token = localStorage.getItem('mss-token');
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    ...(visibilityRead ? { cache: 'no-store' } : {}),
    signal: AbortSignal.timeout(15000),
    headers,
    body: formData ? body : body ? JSON.stringify(body) : undefined,
  });
  if (visibilityRead && (sentToken !== localStorage.getItem('mss-token') || sentRole !== localStorage.getItem('mss-role'))) throw new Error('Session changed; discard obsolete profile response');
  if (response.status === 401 && sentToken && localStorage.getItem('mss-token') === sentToken) clearSession();
  return response;
}

async function Authenticate(data) {
  const response = await request('/auth/login', 'POST', data, false);
  if (response.ok) {
    const payload = await response.json();
    setSession(payload);
  }
  return response;
}

async function Logout() {
  const pending = request('/auth/logout', 'POST');
  clearSession();
  try { return await pending; } catch { return null; }
}

async function GetCurrentUser() {
  const token = localStorage.getItem('mss-token');
  const response = await request('/auth/me', 'GET');
  if (response.status === 403 && token && token === localStorage.getItem('mss-token')) clearSession();
  if (response.ok && token && token === localStorage.getItem('mss-token')) {
    const { user } = await response.clone().json();
    if (token === localStorage.getItem('mss-token')) setSession({ token, user }, false);
  }
  return response;
}

export async function UploadMyAvatar(file) {
  const form = new FormData();
  form.append('image', file);
  return request('/auth/me/avatar', 'POST', form, true, true);
}

export const DeleteMyAvatar = () => request('/auth/me/avatar', 'DELETE');

async function UpdateMyProfile(data) {
  return await request('/auth/me', 'PUT', data);
}

async function GetAllArtists() {
  return await request('/artists', 'GET', null, true);
}

async function GetMyArtists() {
  return await request('/users/me/artists', 'GET');
}

async function GetArtistById(id) {
  return await request(`/artists/${id}`, 'GET', null, true);
}

async function GetArtistManageData(id) {
  return await request(`/artists/${id}/manage`, 'GET', null, true);
}

async function CreateArtist(data) {
  return await request('/artists', 'POST', data);
}

async function UpdateArtist(data) {
  const updateData = {
    user_id: data.user_id,
    name: data.name,
    location: data.location,
    description: data.description,
    twitch: data.twitch,
    soundcloud: data.soundcloud,
    mixcloud: data.mixcloud,
    youtube: data.youtube,
    profile_picture: data.profile_picture,
    cover_photo: data.cover_photo,
    channel_name: data.channel_name,
    slug: data.slug,
  };
  return await request(`/artists/${data.id}`, 'PUT', updateData);
}

async function DeleteArtist(id) {
  return await request(`/artists/${id}`, 'DELETE');
}

async function UploadArtistImage(artistId, file) {
  const formData = new FormData();
  formData.append('image', file);
  return await request(`/artists/${artistId}/upload`, 'POST', formData, true, true);
}

async function DeleteArtistImage(artistId, imageId) {
  return await request(`/artists/${artistId}/images/${imageId}`, 'DELETE');
}

async function GetArtistImages(artistId) {
  return await request(`/artists/${artistId}/images`, 'GET', null, true);
}

async function GetAllImages() {
  return await request('/images', 'GET', null, true);
}

async function GetLiveTwitch() {
  return await request('/live/twitch', 'GET', null, true);
}

async function GetActiveSyndicateStreams() {
  return await request('/streams', 'GET', null, true);
}

export async function GetMediaLibrary(offset = 0, artistId) {
  return await request(`/media-library?offset=${encodeURIComponent(offset)}&limit=50${artistId === undefined ? '' : `&artistId=${encodeURIComponent(artistId)}`}`, 'GET', null, true);
}

async function GetGlobalFeed() {
  return await request('/feed', 'GET', null, true);
}

async function CreateUser(data) {
  return await request('/users', 'POST', data);
}

async function GetAllUsers() {
  return await request('/users', 'GET');
}

async function UpdateUser(id, data) {
  return await request(`/users/${id}`, 'PUT', data);
}

async function DeleteUser(id) {
  return await request(`/users/${id}`, 'DELETE');
}

async function GetServerStats() {
  return await request('/admin/stats', 'GET', null, true);
}

async function GetSettings() {
  return await request('/settings', 'GET', null, false);
}

async function UpdateSetting(key, value) {
  return await request(`/settings/${key}`, 'PUT', { value });
}

async function UpdateSettingsBatch(settings) {
  return await request('/settings/batch', 'POST', { settings });
}

async function GetAllEvents() {
  return await request('/events', 'GET', null, true);
}

async function GetEventById(id) {
  return await request(`/events/${id}`, 'GET', null, true);
}

async function CreateEvent(data) {
  return await request('/events', 'POST', data);
}

async function UpdateEvent(id, data) {
  return await request(`/events/${id}`, 'PUT', data);
}

async function DeleteEvent(id) {
  return await request(`/events/${id}`, 'DELETE');
}

async function UploadEventFlyer(eventId, file) {
  const formData = new FormData();
  formData.append('flyer', file);
  return await request(`/events/${eventId}/flyer`, 'POST', formData, true, true);
}

async function UploadEventImage(eventId, file) {
  const formData = new FormData();
  formData.append('image', file);
  return await request(`/events/${eventId}/images`, 'POST', formData, true, true);
}

async function AdminUpload(file) {
  const formData = new FormData();
  formData.append('image', file);
  return await request('/admin/upload', 'POST', formData, true, true);
}

async function GetArtistEvents(artistId) {
  return await request(`/artists/${artistId}/events`, 'GET', null, true);
}

async function GetComments({ artist_id, event_id, after_id, offset, limit, order, before } = {}) {
  // Cursor paging is deletion-safe; retain offset for legacy callers.
  const params = { artist_id, event_id, after_id, offset, limit, order, before };
  const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== undefined && value !== null)).toString();
  return await request(`/comments?${query}`, 'GET', null, true);
}

async function GetCommentIdentities() {
  return await request('/comments/identities', 'GET');
}

async function PostComment(data) {
  return await request('/comments', 'POST', data);
}

async function DeleteComment(id) {
  return await request(`/comments/${id}`, 'DELETE');
}

export const GetRegistrationConfig = () => request('/auth/registration-config', 'GET', null, false);
export const GetVerificationInfo = data => request('/auth/verification-info', 'POST', data, false);
export const VerifyEmail = (data, authenticated = false) => request('/auth/verify-email', 'POST', data, authenticated);
export const ResendVerification = data => request('/auth/resend-verification', 'POST', data, false);
export const ChangeEmail = data => request('/auth/email-change', 'POST', data);
export const GetEmailSettings = () => request('/admin/email-settings');
export const UpdateEmailSettings = data => request('/admin/email-settings', 'PUT', data);
export const Register = data => request('/auth/register', 'POST', data, false);

export function CanCreateEvent() { return HasSession() && ['artist', 'admin'].includes(GetSessionRole()); }

function HasSession() {
  return Boolean(localStorage.getItem('mss-token'));
}

function GetSessionUser() {
  return localStorage.getItem('mss-user');
}

function GetSessionRole() {
  return localStorage.getItem('mss-role');
}

function GetSessionUserId() {
  const id = localStorage.getItem('mss-user-id');
  const parsed = Number(id);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function GetSessionArtistId() {
  const id = localStorage.getItem('mss-artist-id');
  const parsed = Number(id);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function IsAdmin() {
  return GetSessionRole() === 'admin';
}

function CanEditArtist(artistId, artistOwnerId = null) {
  if (IsAdmin()) return true;

  const userArtistId = GetSessionArtistId();
  const userId = GetSessionUserId();

  const targetArtistId = Number(artistId);
  const targetOwnerId = artistOwnerId !== null ? Number(artistOwnerId) : null;

  const isTheArtist = userArtistId !== null && Number(userArtistId) === targetArtistId;
  const isOwner = userId !== null && targetOwnerId !== null && Number(userId) === targetOwnerId;

  return isTheArtist || isOwner;
}
function CanEditEvent(event) {
  if (IsAdmin()) return true;
  const userId = GetSessionUserId();
  return userId !== null && event && Number(event.creator_id) === Number(userId);
}

export {
  Authenticate,
  Logout,
  GetCurrentUser,
  GetCommentIdentities,
  UpdateMyProfile,
  GetAllArtists,
  GetMyArtists,
  GetArtistById,
  GetArtistManageData,
  CreateArtist,
  UpdateArtist,
  DeleteArtist,
  UploadArtistImage,
  DeleteArtistImage,
  GetArtistImages,
  GetAllImages,
  GetLiveTwitch,
  GetActiveSyndicateStreams,
  GetGlobalFeed,
  CreateUser,
  UpdateUser,
  DeleteUser,
  GetAllUsers,
  GetServerStats,
  GetSettings,
  UpdateSetting,
  UpdateSettingsBatch,
  GetAllEvents,
  GetEventById,
  CreateEvent,
  UpdateEvent,
  DeleteEvent,
  UploadEventFlyer,
  UploadEventImage,
  AdminUpload,
  GetArtistEvents,
  GetComments,
  PostComment,
  DeleteComment,
  HasSession,
  GetSessionUser,
  GetSessionRole,
  GetSessionUserId,
  GetSessionArtistId,
  IsAdmin,
  CanEditArtist,
  CanEditEvent,
  clearSession,
};


