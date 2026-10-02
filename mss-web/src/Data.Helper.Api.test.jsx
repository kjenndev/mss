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
