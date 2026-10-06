// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import * as api from './Data.Helper.Api';
beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });
it('preserves explicit ownership reassignment and removal', async () => {
 vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
 for (const user_id of [22, null]) {
  await api.UpdateArtist({ id: 1, user_id });
  expect(JSON.parse(fetch.mock.calls.at(-1)[1].body)).toEqual({ user_id });
 }
});

it('clears local credentials when logout is offline', async () => {
 localStorage.setItem('mss-token', 'old');
 vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
 await api.Logout();
 expect(api.HasSession()).toBe(false);
});
it('expires only the session that received an authenticated 401', async () => {
 localStorage.setItem('mss-token', 'old');
 vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 401 }));
 await api.GetCurrentUser();
 expect(api.HasSession()).toBe(false);
 localStorage.setItem('mss-token', 'old');
 fetch.mockImplementation(async () => { localStorage.setItem('mss-token', 'new'); return {status:401}; });
 await api.GetCurrentUser();
 expect(localStorage.getItem('mss-token')).toBe('new');
});

it('bounds requests with an abort signal',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true}));
 await api.GetActiveSyndicateStreams();
 expect(fetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
});
it('refreshes cached ownership claims from validated current user',async()=>{
 localStorage.setItem('mss-token','token');localStorage.setItem('mss-role','admin');
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({user:{id:2,username:'a',role:'artist',artist_id:null}}))));
 const response=await api.GetCurrentUser();expect((await response.json()).user.id).toBe(2);
 expect(api.IsAdmin()).toBe(false);expect(api.GetSessionUserId()).toBe(2);
});

it('late current-user responses cannot overwrite a newer login identity',async()=>{
 localStorage.setItem('mss-token','old');localStorage.setItem('mss-user','new-user');localStorage.setItem('mss-user-id','9');localStorage.setItem('mss-role','artist');
 let resolve;vi.stubGlobal('fetch',vi.fn(()=>new Promise(r=>{resolve=r;})));
 const pending=api.GetCurrentUser();localStorage.setItem('mss-token','new');
 resolve(new Response(JSON.stringify({user:{id:1,username:'old-admin',role:'admin'}})));await pending;
 expect(api.GetSessionUser()).toBe('new-user');expect(api.GetSessionUserId()).toBe(9);expect(api.IsAdmin()).toBe(false);
});

it('comment cursor requests retain zero and omit absent query fields',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true}));
 await api.GetComments({artist_id:2,event_id:undefined,after_id:0,offset:null,limit:100});
 const query=new URL(fetch.mock.calls[0][0],'http://localhost').searchParams;
 expect(Object.fromEntries(query)).toEqual({artist_id:'2',after_id:'0',limit:'100'});
 await api.GetComments({event_id:3,offset:100,limit:100});
 expect(new URL(fetch.mock.calls[1][0],'http://localhost').searchParams.get('offset')).toBe('100');
});

it('requests optional artist scope without changing homepage pagination',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true}));
 await api.GetMediaLibrary(50,2);
 expect(Object.fromEntries(new URL(fetch.mock.calls[0][0],'http://localhost').searchParams)).toEqual({offset:'50',limit:'50',artistId:'2'});
 await api.GetMediaLibrary();
 expect(Object.fromEntries(new URL(fetch.mock.calls[1][0],'http://localhost').searchParams)).toEqual({offset:'0',limit:'50'});
});

it('sends email-first public contracts without auth and authenticates only email-change completion', async () => {
  localStorage.setItem('mss-token', 'session-fixture');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
  const signup = { username: 'listener', email: 'listener@example.com' };
  const token = { token: 'private-link-token' };
  const completion = { ...token, username: 'fresh', password: 'a fresh password', accept_terms: true, confirm_adult: true, terms_version: '2026-10-03', privacy_version: '2026-10-03', email_alerts_opt_in: false };
  for (const [helper, path, payload] of [[api.Register, '/auth/register', signup], [api.GetVerificationInfo, '/auth/verification-info', token], [api.VerifyEmail, '/auth/verify-email', completion]]) {
    await helper(payload);
    const [url, options] = fetch.mock.calls.at(-1);
    expect(url.endsWith(path)).toBe(true);
    expect(options.method).toBe('POST');
    expect(options.headers.Authorization).toBeUndefined();
    expect(JSON.parse(options.body)).toEqual(payload);
  }
  await api.VerifyEmail({ ...token, current_password: 'existing password' }, true);
  expect(fetch.mock.calls.at(-1)[1].headers.Authorization).toBe('Bearer session-fixture');
  expect(JSON.parse(fetch.mock.calls.at(-1)[1].body)).toEqual({ ...token, current_password: 'existing password' });
  expect(localStorage.length).toBe(1);
  expect(localStorage.getItem('mss-token')).toBe('session-fixture');
});

it('encodes newest comment ordering and exact older-page cursor without legacy fields',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true}));
 const before=JSON.stringify({date:'2026-01-01T00:00:00.000001Z',id:7});
 await api.GetComments({event_id:3,order:'newest',before,limit:100});
 expect(Object.fromEntries(new URL(fetch.mock.calls[0][0],'http://localhost').searchParams)).toEqual({event_id:'3',order:'newest',before,limit:'100'});
});
