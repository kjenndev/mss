// @vitest-environment jsdom
import React from 'react';
import {it,expect,vi,beforeEach} from 'vitest';
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import {MemoryRouter,Routes,Route} from 'react-router-dom';
import ArtistUpdate from './components/Artist/Artist.Component.Update';
import * as api from './Data.Helper.Api';
vi.mock('./Data.Helper.Api');
const saved={id:1,name:'Saved',is_disabled:false};
beforeEach(()=>{cleanup();vi.resetAllMocks();api.IsAdmin.mockReturnValue(true);api.GetCurrentUser.mockResolvedValue({ok:true,json:async()=>({user:{role:'admin'}})});api.GetArtistManageData.mockResolvedValue({ok:true,json:async()=>({artist:saved})});api.GetArtistImages.mockResolvedValue({ok:true,json:async()=>({images:[]})});api.GetAllUsers.mockResolvedValue({ok:true,json:async()=>({users:[]})});});
function mount(){render(<MemoryRouter initialEntries={['/artists/1/update']}><Routes><Route path="/artists/:id/update" element={<ArtistUpdate/>}/></Routes></MemoryRouter>);}
it('admin disable, failed save, read-back and re-enable preserve the editor draft',async()=>{
 mount();fireEvent.change(await screen.findByLabelText(/Artist Name/),{target:{value:'Draft'}});
 const button=await screen.findByRole('switch',{name:'Profile enabled',checked:true});
 api.SetArtistVisibility.mockResolvedValueOnce({ok:false,json:async()=>({error:'Try again'})});fireEvent.click(button);
 expect(await screen.findByText('Try again')).toBeTruthy();expect(screen.getByLabelText(/Artist Name/).value).toBe('Draft');
 api.SetArtistVisibility.mockResolvedValue({ok:true});api.GetArtistById.mockResolvedValue({ok:true,json:async()=>({artist:{...saved,is_disabled:true}})});
 fireEvent.click(screen.getByRole('switch',{name:'Profile enabled',checked:true}));await screen.findByRole('switch',{name:'Profile enabled',checked:false});
 expect(screen.getByLabelText(/Artist Name/).value).toBe('Draft');expect(api.SetArtistVisibility).toHaveBeenLastCalledWith('1',true);
 api.GetArtistById.mockResolvedValue({ok:true,json:async()=>({artist:saved})});fireEvent.click(screen.getByRole('switch',{name:'Profile enabled',checked:false}));await screen.findByRole('switch',{name:'Profile enabled',checked:true});expect(api.SetArtistVisibility).toHaveBeenLastCalledWith('1',false);
});
it('cached admin hint does not grant an artist the toggle',async()=>{api.GetCurrentUser.mockResolvedValue({ok:true,json:async()=>({user:{role:'artist'}})});mount();await screen.findByLabelText(/Artist Name/);await waitFor(()=>expect(api.GetCurrentUser).toHaveBeenCalled());expect(screen.queryByRole('switch',{name:'Profile enabled',checked:true})).toBeNull();});

it('failed read-back never claims success and retry preserves the draft',async()=>{
 mount();fireEvent.change(await screen.findByLabelText(/Artist Name/),{target:{value:'Keep this draft'}});
 api.SetArtistVisibility.mockResolvedValue({ok:true});api.GetArtistById.mockResolvedValue({ok:true,json:async()=>({artist:{...saved,is_disabled:'true'}})});
 fireEvent.click(await screen.findByRole('switch',{name:'Profile enabled',checked:true}));await screen.findByText('Could not confirm visibility. Try again.');expect(screen.queryByRole('switch',{name:'Profile enabled',checked:false})).toBeNull();expect(screen.getByLabelText(/Artist Name/).value).toBe('Keep this draft');
 api.GetArtistById.mockResolvedValue({ok:true,json:async()=>({artist:{...saved,is_disabled:true}})});fireEvent.click(screen.getByRole('switch',{name:'Profile enabled',checked:true}));await screen.findByRole('switch',{name:'Profile enabled',checked:false});expect(screen.getByLabelText(/Artist Name/).value).toBe('Keep this draft');
});

it('disabled profiles start unchecked and pending changes prevent duplicate requests',async()=>{
 api.GetArtistManageData.mockResolvedValue({ok:true,json:async()=>({artist:{...saved,is_disabled:true}})});
 let resolve;api.SetArtistVisibility.mockImplementation(()=>new Promise(done=>{resolve=done;}));
 api.GetArtistById.mockResolvedValue({ok:true,json:async()=>({artist:saved})});
 mount();const toggle=await screen.findByRole('switch',{name:'Profile enabled',checked:false});
 fireEvent.click(toggle);expect(toggle.disabled).toBe(true);expect(toggle.checked).toBe(false);
 fireEvent.click(toggle);expect(api.SetArtistVisibility).toHaveBeenCalledTimes(1);expect(api.SetArtistVisibility).toHaveBeenCalledWith('1',false);
 resolve({ok:true});await waitFor(()=>expect(toggle.checked).toBe(true));expect(toggle.disabled).toBe(false);
 expect(api.UpdateArtist).not.toHaveBeenCalled();
});
it('network failure retains the confirmed checked state and current public visibility',async()=>{
 api.SetArtistVisibility.mockRejectedValue(new Error('Network unavailable'));
 mount();const toggle=await screen.findByRole('switch',{name:'Profile enabled',checked:true});fireEvent.click(toggle);
 await screen.findByText('Network unavailable');expect(toggle.checked).toBe(true);expect(toggle.disabled).toBe(false);
 expect(screen.getByText('Public — visible to everyone.')).toBeTruthy();expect(api.UpdateArtist).not.toHaveBeenCalled();
});
