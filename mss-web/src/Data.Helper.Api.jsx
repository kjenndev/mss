const API_BASE = 'http://localhost:4000/api';

function dispatchAuthChange() {
  window.dispatchEvent(new CustomEvent('mss-auth-change'));
}

function setSession(session) {
  localStorage.setItem('mss-token', session.token);
  localStorage.setItem('mss-user', session.user.username);
  localStorage.setItem('mss-user-id', session.user.id);
  localStorage.setItem('mss-role', session.user.role);
  localStorage.setItem('mss-artist-id', session.user.artist_id || '');
  dispatchAuthChange();
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
  const headers = formData ? {} : getAuthHeaders();
  if (formData && auth) {
    const token = localStorage.getItem('mss-token');
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: formData ? body : body ? JSON.stringify(body) : undefined,
  });
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
  const response = await request('/auth/logout', 'POST');
  clearSession();
  return response;
}

async function GetCurrentUser() {
  const response = await request('/auth/me', 'GET');
  return response;
}

async function UpdateMyProfile(data) {
  return await request('/auth/me', 'PUT', data);
}

async function GetAllArtists() {
  return await request('/artists', 'GET', null, false);
}

async function GetMyArtists() {
  return await request('/users/me/artists', 'GET');
}

async function GetArtistById(id) {
  return await request(`/artists/${id}`, 'GET', null, false);
}

async function GetArtistManageData(id) {
  return await request(`/artists/${id}/manage`, 'GET', null, true);
}

async function RegenerateStreamKey(id) {
  return await request(`/artists/${id}/stream-key`, 'POST', null, true);
}

async function CreateArtist(data) {
  return await request('/artists', 'POST', data);
}

async function UpdateArtist(data) {
  const updateData = {
    name: data.name,
    location: data.location,
    description: data.description,
    twitch: data.twitch,
    soundcloud: data.soundcloud,
    mixcloud: data.mixcloud,
    youtube: data.youtube,
    profile_picture: data.profile_picture,
    cover_photo: data.cover_photo,
    twitch_stream_key: data.twitch_stream_key,
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
  return await request(`/artists/${artistId}/images`, 'GET', null, false);
}

async function GetAllImages() {
  return await request('/images', 'GET', null, false);
}

async function GetLiveTwitch() {
  return await request('/live/twitch', 'GET', null, false);
}

async function GetActiveSyndicateStreams() {
  return await request('/streams', 'GET', null, false);
}

async function GetGlobalFeed() {
  return await request('/feed', 'GET', null, false);
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
  return await request('/events', 'GET', null, false);
}

async function GetEventById(id) {
  return await request(`/events/${id}`, 'GET', null, false);
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
  return await request(`/artists/${artistId}/events`, 'GET', null, false);
}

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


