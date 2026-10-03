// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import * as api from './Data.Helper.Api';
beforeEach(() => { localStorage.clear(); localStorage.setItem('mss-token', 'fixture'); vi.restoreAllMocks(); });
it('uploads image multipart and removes with authenticated requests', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true });
  const file = new File(['synthetic'], 'photo.png', { type: 'image/png' });
  await api.UploadMyAvatar(file);
  expect(fetch.mock.calls[0][0]).toContain('/auth/me/avatar');
  expect(fetch.mock.calls[0][1].body.get('image')).toBe(file);
  expect(fetch.mock.calls[0][1].headers).toEqual({ Authorization: 'Bearer fixture' });
  await api.DeleteMyAvatar();
  expect(fetch.mock.calls[1][1].method).toBe('DELETE');
});

it('invalidates only the matching session on unauthorized avatar requests',async()=>{
 vi.spyOn(globalThis,'fetch').mockResolvedValue({ok:false,status:401});
 await api.DeleteMyAvatar();expect(localStorage.getItem('mss-token')).toBeNull();
});
it('does not clear a newer session when an older upload receives 401',async()=>{
 let finish;vi.spyOn(globalThis,'fetch').mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 const pending=api.UploadMyAvatar(new File(['x'],'photo.png',{type:'image/png'}));
 localStorage.setItem('mss-token','newer');finish({ok:false,status:401});await pending;
 expect(localStorage.getItem('mss-token')).toBe('newer');
});
