// @vitest-environment jsdom
import React from 'react';
import { expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ArtistUpdate from './components/Artist/Artist.Component.Update';
import * as api from './Data.Helper.Api';
vi.mock('./Data.Helper.Api');
const saved = {id:1,name:'Saved',description:'old',cover_photo:'/old.jpg',user_id:2};
beforeEach(() => { cleanup(); vi.resetAllMocks(); api.IsAdmin.mockReturnValue(true); api.GetArtistManageData.mockResolvedValue({ok:true,json:async()=>({artist:saved})}); api.GetArtistImages.mockResolvedValue({ok:true,json:async()=>({images:[{id:2,url:'/new.jpg'}]})}); api.GetAllUsers.mockResolvedValue({ok:true,json:async()=>({users:[{id:2,username:"owner",role:"artist"}]})}); });
it('sets cover with a narrow update without replacing unsaved text', async()=>{
 api.UpdateArtist.mockResolvedValue({ok:true,json:async()=>({artist:{...saved,cover_photo:'/new.jpg'}})});
 render(<MemoryRouter initialEntries={['/artists/1/update']}><Routes><Route path="/artists/:id/update" element={<ArtistUpdate/>}/></Routes></MemoryRouter>);
 fireEvent.change(await screen.findByLabelText(/Artist Name/),{target:{value:'Dirty'}});
 fireEvent.click(screen.getByRole('tab',{name:'Gallery Management'}));
 fireEvent.click(screen.getByLabelText('Set as Cover Photo'));
 await waitFor(()=>expect(api.UpdateArtist).toHaveBeenCalledWith({id:'1',cover_photo:'/new.jpg'}));
 expect(screen.getByLabelText(/Artist Name/).value).toBe('Dirty');
});

it('deleting a cover preserves the dirty draft and reflects cleared cover',async()=>{
 vi.spyOn(window,'confirm').mockReturnValue(true);
 api.DeleteArtistImage.mockResolvedValue({ok:true});
 api.GetArtistById.mockResolvedValue({ok:true,json:async()=>({artist:{...saved,cover_photo:null}})});
 render(<MemoryRouter initialEntries={['/artists/1/update']}><Routes><Route path="/artists/:id/update" element={<ArtistUpdate/>}/></Routes></MemoryRouter>);
 fireEvent.change(await screen.findByLabelText(/Artist Name/),{target:{value:'Dirty'}});
 fireEvent.click(screen.getByRole('tab',{name:'Gallery Management'}));
 fireEvent.click(screen.getByLabelText('Delete Image'));
 await waitFor(()=>expect(screen.queryByLabelText('Delete Image')).toBeNull());
 expect(screen.getByLabelText(/Artist Name/).value).toBe('Dirty');
});

it('uploading keeps dirty text',async()=>{
 api.UploadArtistImage.mockResolvedValue({ok:true});
 api.GetArtistById.mockResolvedValue({ok:true,json:async()=>({artist:saved})});
 const {container}=render(<MemoryRouter initialEntries={['/artists/1/update']}><Routes><Route path="/artists/:id/update" element={<ArtistUpdate/>}/></Routes></MemoryRouter>);
 fireEvent.change(await screen.findByLabelText(/Artist Name/),{target:{value:'Dirty'}});
 fireEvent.click(screen.getByRole('tab',{name:'Gallery Management'}));
 fireEvent.change(container.querySelector('input[type=file]'),{target:{files:[new File(['x'],'a.png',{type:'image/png'})]}});
 await waitFor(()=>expect(api.GetArtistById).toHaveBeenCalled());
 expect(screen.getByLabelText(/Artist Name/).value).toBe('Dirty');
});

it('only admins can edit manual channel mapping',async()=>{
 api.IsAdmin.mockReturnValue(false);
 render(<MemoryRouter initialEntries={['/artists/1/update']}><Routes><Route path="/artists/:id/update" element={<ArtistUpdate/>}/></Routes></MemoryRouter>);
 const field=await screen.findByLabelText('Streaming Platform Channel Name');expect(field.disabled || field.readOnly).toBe(true);
});
it('rejects invalid channel names before save',async()=>{
 render(<MemoryRouter initialEntries={['/artists/1/update']}><Routes><Route path="/artists/:id/update" element={<ArtistUpdate/>}/></Routes></MemoryRouter>);
 fireEvent.change(await screen.findByLabelText('Streaming Platform Channel Name'),{target:{value:'bad channel'}});
 fireEvent.click(screen.getByRole('button',{name:'Save Changes'}));
 expect(await screen.findByText(/1.100.*letters/i)).toBeTruthy();expect(api.UpdateArtist).not.toHaveBeenCalled();
});

it('does not replace a failed artist manage request with a misleading form or not-found state',async()=>{
 api.GetArtistManageData.mockRejectedValue(new Error('offline'));
 render(<MemoryRouter initialEntries={['/artists/1/update']}><Routes><Route path="/artists/:id/update" element={<ArtistUpdate/>}/></Routes></MemoryRouter>);
 expect(await screen.findByRole('button',{name:'Retry'})).toBeTruthy();expect(screen.queryByText('Artist not found')).toBeNull();
});
