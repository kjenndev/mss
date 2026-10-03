// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import Comments from './components/Comments/CommentSection';
import * as api from './Data.Helper.Api';
vi.mock('./Data.Helper.Api');
beforeEach(()=>{cleanup();vi.resetAllMocks();api.HasSession.mockReturnValue(true);api.GetCurrentUser.mockResolvedValue({ok:true,json:async()=>({user:{id:7,username:'StoredName',display_name:'Different'}})});api.GetComments.mockResolvedValue({ok:true,json:async()=>({comments:[]})});});
it('presents an accessible open composer with labeled comment field',async()=>{
 render(<Comments eventId={1}/>);
 expect(await screen.findByRole('region',{name:'Write a comment'})).toBeTruthy();
 expect(screen.getByRole('textbox',{name:'Comment'})).toBeTruthy();
 expect(screen.getByRole('button',{name:'Post Comment'}).disabled).toBe(true);
});

it('uses a readonly authenticated Username instead of an editable name',async()=>{
 render(<Comments artistId={1}/>);
 const field=await screen.findByRole('textbox',{name:'Username'});
 expect(field).toHaveValue('StoredName');expect(field).toHaveAttribute('readonly');
});
it('guests can read legacy comments but see a sign-in link instead of a composer',async()=>{
 api.HasSession.mockReturnValue(false);api.GetComments.mockResolvedValue({ok:true,json:async()=>({comments:[{id:1,author_name:'Legacy Guest',content:'Public history'}]})});
 render(<Comments eventId={1}/>);expect(await screen.findByText('Public history')).toBeTruthy();expect(screen.getByText('Legacy Guest')).toBeTruthy();expect(screen.queryByRole('textbox')).toBeNull();expect(screen.getByRole('link',{name:/Sign in/})).toHaveAttribute('href','/login');
});

it.each([{artistId:1},{eventId:1}])('authenticated %j posting omits identity and preserves pending/error draft UX',async target=>{
 let post;api.PostComment.mockImplementation(()=>new Promise(resolve=>{post=resolve;}));render(<Comments {...target}/>);await screen.findByDisplayValue('StoredName');
 const comment=screen.getByRole('textbox',{name:'Comment'});fireEvent.change(comment,{target:{value:'My draft'}});fireEvent.click(screen.getByRole('button',{name:'Post Comment'}));
 expect(screen.getByRole('button',{name:'Post Comment'})).toBeDisabled();expect(api.PostComment).toHaveBeenCalledWith({content:'My draft',artist_id:target.artistId||null,event_id:target.eventId||null});
 await act(async()=>post({ok:false,json:async()=>({error:'Please try again'})}));expect(await screen.findByText('Please try again')).toBeTruthy();expect(comment).toHaveValue('My draft');expect(screen.getByRole('button',{name:'Post Comment'})).not.toBeDisabled();
});
it('signout removes the composer and discards a late username response',async()=>{
 let user;api.GetCurrentUser.mockImplementation(()=>new Promise(resolve=>{user=resolve;}));render(<Comments artistId={1}/>);
 await act(async()=>{api.HasSession.mockReturnValue(false);window.dispatchEvent(new CustomEvent('mss-auth-change'));});
 await act(async()=>user({ok:true,json:async()=>({user:{username:'Late username'}})}));expect(screen.queryByRole('textbox')).toBeNull();expect(screen.getByRole('link',{name:/Sign in/})).toBeTruthy();
});
it('username lookup failure never permits a manual identity or posting',async()=>{
 api.GetCurrentUser.mockRejectedValue(new Error('offline'));render(<Comments artistId={1}/>);await screen.findByText(/Unable to verify your username/);expect(screen.getByRole('textbox',{name:'Username'})).toHaveAttribute('readonly');expect(screen.getByRole('button',{name:'Post Comment'})).toBeDisabled();
});
