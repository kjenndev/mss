// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import RouteGuard from './RouteGuard';
import Profile from './components/User/User.Component.Profile';
import { MemoryRouter } from 'react-router-dom';
import * as api from './Data.Helper.Api';
vi.mock('./Data.Helper.Api');
const user = { id: 7, username: 'Listener', role: 'user', profile_picture: null };
const response = picture => ({ok:true,json:async()=>({user:{...user,profile_picture:picture}})});
beforeEach(()=>{ cleanup(); vi.resetAllMocks(); localStorage.setItem('mss-token','fixture'); api.HasSession.mockReturnValue(true); URL.createObjectURL = vi.fn(()=>'blob:fixture'); URL.revokeObjectURL = vi.fn(); api.GetCurrentUser.mockResolvedValue(response(null)); });
it('ordinary accounts upload their picture separately from credentials',async()=>{
 api.UploadMyAvatar.mockResolvedValue(response('/uploads/photo.webp'));
 render(<MemoryRouter><Profile/></MemoryRouter>);
 const input = await screen.findByLabelText('Choose profile picture');
 fireEvent.change(input,{target:{files:[new File(['fixture'],'photo.png',{type:'image/png'})]}});
 fireEvent.click(screen.getByRole('button',{name:'Save picture'}));
 expect(await screen.findByText('Profile picture saved.')).toBeTruthy();
 expect(api.UploadMyAvatar).toHaveBeenCalledTimes(1);
 expect(api.UpdateMyProfile).not.toHaveBeenCalled();
 expect(input.value).toBe('');
});

it('removes the saved picture and falls back to the username initial',async()=>{
 api.GetCurrentUser.mockResolvedValue(response('/uploads/old.webp')); api.DeleteMyAvatar.mockResolvedValue(response(null));
 render(<MemoryRouter><Profile/></MemoryRouter>);
 fireEvent.click(await screen.findByRole('button',{name:'Remove picture'}));
 expect(await screen.findByText('Profile picture removed.')).toBeTruthy();
 expect(screen.queryByRole('button',{name:'Remove picture'})).toBeNull();
});
it.each([['bad.gif','image/gif',1],['big.png','image/png',5242881],['empty.png','image/png',0]])('rejects invalid file %s without sending it',async(name,type,size)=>{
 render(<MemoryRouter><Profile/></MemoryRouter>);
 const file=new File(['x'],name,{type}); Object.defineProperty(file,'size',{value:size});
 fireEvent.change(await screen.findByLabelText('Choose profile picture'),{target:{files:[file]}});
 expect(await screen.findByText('Choose a JPG, PNG or WebP image up to 5 MiB.')).toBeTruthy(); expect(api.UploadMyAvatar).not.toHaveBeenCalled();
});
it('retains selection after failure, retries and releases preview URLs',async()=>{
 api.UploadMyAvatar.mockResolvedValueOnce({ok:false,json:async()=>({error:'Try again'})}).mockResolvedValue(response('/uploads/new.webp'));
 const view=render(<MemoryRouter><Profile/></MemoryRouter>);
 fireEvent.change(await screen.findByLabelText('Choose profile picture'),{target:{files:[new File(['x'],'photo.png',{type:'image/png'})]}});
 fireEvent.click(screen.getByRole('button',{name:'Save picture'}));
 expect(await screen.findByText('Try again')).toBeTruthy(); expect(screen.queryByText('Profile picture saved.')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Retry save picture'}));
 await screen.findByText('Profile picture saved.'); expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fixture'); view.unmount();
});
it('discards an upload response after sign out',async()=>{
 let finish; api.UploadMyAvatar.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 render(<MemoryRouter><Profile/></MemoryRouter>);
 fireEvent.change(await screen.findByLabelText('Choose profile picture'),{target:{files:[new File(['x'],'photo.png',{type:'image/png'})]}});
 fireEvent.click(screen.getByRole('button',{name:'Save picture'}));
 act(()=>{localStorage.removeItem('mss-token');window.dispatchEvent(new Event('mss-auth-change'));});
 await act(async()=>finish(response('/uploads/stale.webp')));
 expect(screen.queryByText('Profile picture saved.')).toBeNull(); expect(screen.queryByRole('img',{name:"Listener's profile picture"})).toBeNull();
});

it('does not expose an old account picture when its initial load finishes after an auth change',async()=>{
 let finish; api.GetCurrentUser.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 render(<MemoryRouter><Profile/></MemoryRouter>);
 act(()=>{localStorage.setItem('mss-token','other-session');window.dispatchEvent(new Event('mss-auth-change'));});
 await act(async()=>finish(response('/uploads/old-user.webp')));
 expect(screen.queryByRole('img',{name:"Listener's profile picture"})).toBeNull();
});

it('preserves the success notice and credential draft inside the real route guard',async()=>{
 api.UploadMyAvatar.mockResolvedValue(response('/uploads/new.webp'));
 render(<MemoryRouter><RouteGuard><Profile/></RouteGuard></MemoryRouter>);
 fireEvent.change(await screen.findByLabelText('Display Name'),{target:{value:'Unsaved draft'}});
 fireEvent.change(screen.getByLabelText('Choose profile picture'),{target:{files:[new File(['x'],'photo.png',{type:'image/png'})]}});
 fireEvent.click(screen.getByRole('button',{name:'Save picture'}));
 await act(async()=>{});
 expect(screen.getByText('Profile picture saved.')).toBeTruthy();
 expect(screen.getByLabelText('Display Name')).toHaveValue('Unsaved draft');
});

it('retains saved picture on removal failure and retries removal',async()=>{
 api.GetCurrentUser.mockResolvedValue(response('/uploads/old.webp'));
 api.DeleteMyAvatar.mockResolvedValueOnce({ok:false,json:async()=>({error:'Removal failed'})}).mockResolvedValue(response(null));
 render(<MemoryRouter><Profile/></MemoryRouter>);
 fireEvent.click(await screen.findByRole('button',{name:'Remove picture'}));await screen.findByText(/Removal failed/);
 expect(screen.getByRole('img')).toHaveAttribute('src','/uploads/old.webp');
 fireEvent.click(screen.getByRole('button',{name:'Remove picture'}));await screen.findByText('Profile picture removed.');
});
it('ignores completion after unmount and revokes its pending preview',async()=>{
 let finish;api.UploadMyAvatar.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 const event=vi.fn();window.addEventListener('mss-avatar-change',event);
 const view=render(<MemoryRouter><Profile/></MemoryRouter>);
 fireEvent.change(await screen.findByLabelText('Choose profile picture'),{target:{files:[new File(['x'],'photo.png',{type:'image/png'})]}});
 fireEvent.click(screen.getByRole('button',{name:'Save picture'}));view.unmount();
 await act(async()=>finish(response('/uploads/stale.webp')));expect(event).not.toHaveBeenCalled();expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fixture');window.removeEventListener('mss-avatar-change',event);
});
it('never reports success for a malformed successful response',async()=>{
 api.UploadMyAvatar.mockResolvedValue({ok:true,json:async()=>({user:{id:99,profile_picture:'/uploads/wrong-user.webp'}})});
 render(<MemoryRouter><Profile/></MemoryRouter>);
 fireEvent.change(await screen.findByLabelText('Choose profile picture'),{target:{files:[new File(['x'],'photo.png',{type:'image/png'})]}});
 fireEvent.click(screen.getByRole('button',{name:'Save picture'}));await screen.findByText('Could not confirm the saved picture. Please retry.');expect(screen.queryByText('Profile picture saved.')).toBeNull();
});
