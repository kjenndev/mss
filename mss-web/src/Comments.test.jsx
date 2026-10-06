// @vitest-environment jsdom
import {it,expect,vi,beforeEach} from 'vitest';
import {render,screen,cleanup,fireEvent,act} from '@testing-library/react';
import Comments from './components/Comments/CommentSection';
import * as api from './Data.Helper.Api';
vi.mock('./Data.Helper.Api');
beforeEach(()=>{cleanup();vi.resetAllMocks();api.GetCommentIdentities.mockResolvedValue({ok:true,json:async()=>({identities:[]})});api.HasSession.mockReturnValue(true);api.GetCurrentUser.mockResolvedValue({ok:true,json:async()=>({user:{id:7,username:"StoredName"}})});});
it('distinguishes failed comment loading from emptiness and retries',async()=>{
 api.GetComments.mockResolvedValueOnce({ok:false}).mockResolvedValue({ok:true,json:async()=>({comments:[]})});
 render(<Comments artistId={1}/>);
 fireEvent.click(await screen.findByRole('button',{name:'Retry comments'}));
 expect(await screen.findByText(/No comments yet/)).toBeTruthy();
});
it('failed deletion is visible and retains the comment',async()=>{
 vi.spyOn(window,'confirm').mockReturnValue(true);api.IsAdmin.mockReturnValue(true);
 api.GetComments.mockResolvedValue({ok:true,json:async()=>({comments:[{id:1,author_name:'Guest',content:'Keep me'}]})});
 api.DeleteComment.mockResolvedValue({ok:false});
 render(<Comments artistId={1}/>);fireEvent.click(await screen.findByRole('button',{name:'Delete'}));
 expect(await screen.findByText(/Failed to delete comment/)).toBeTruthy();expect(screen.getByText('Keep me')).toBeTruthy();
});

it('offers explicit pagination instead of silently truncating comments',async()=>{
 api.GetComments.mockResolvedValueOnce({ok:true,json:async()=>({comments:[{id:1,content:'First'}],has_more:true,next_cursor:JSON.stringify({date:null,id:1})})}).mockResolvedValue({ok:true,json:async()=>({comments:[{id:2,content:'Second'}],has_more:false})});
 render(<Comments artistId={1}/>);fireEvent.click(await screen.findByRole('button',{name:'Load more comments'}));
 expect(await screen.findByText('Second')).toBeTruthy();expect(screen.getByText('First')).toBeTruthy();
});

it('late comment route loads cannot replace the new route or its draft',async()=>{
 let resolveA;
 api.GetComments.mockImplementation(({artist_id})=>artist_id===1?new Promise(r=>{resolveA=r;}):Promise.resolve({ok:true,json:async()=>({comments:[{id:2,content:'Route B'}]})}));
 const view=render(<Comments artistId={1}/>);
 fireEvent.change(screen.getByPlaceholderText('Write a comment...'),{target:{value:'Old draft'}});
 view.rerender(<Comments artistId={2}/>);
 await screen.findByText('Route B');
 expect(screen.getByPlaceholderText('Write a comment...')).toHaveValue('');
 await act(async()=>resolveA({ok:true,json:async()=>({comments:[{id:1,content:'Route A'}]})}));
 expect(screen.getByText('Route B')).toBeTruthy();expect(screen.queryByText('Route A')).toBeNull();
});

it('concurrent post and delete completions preserve both changes',async()=>{
 vi.spyOn(window,'confirm').mockReturnValue(true);api.IsAdmin.mockReturnValue(true);
 api.GetComments.mockResolvedValue({ok:true,json:async()=>({comments:[{id:1,content:'Remove me'},{id:2,content:'Keep me'}]})});
 let post,del;
 api.PostComment.mockImplementation(()=>new Promise(r=>{post=r;}));
 api.DeleteComment.mockImplementation(()=>new Promise(r=>{del=r;}));
 render(<Comments artistId={1}/>);await screen.findByText('Remove me');
 expect(await screen.findByDisplayValue('StoredName')).toHaveAttribute('readonly');
 fireEvent.change(screen.getByPlaceholderText('Write a comment...'),{target:{value:'New comment'}});
 fireEvent.click(screen.getByRole('button',{name:'Post Comment'}));
 fireEvent.click(screen.getAllByRole('button',{name:'Delete'})[1]);
 await act(async()=>post({ok:true,json:async()=>({comment:{id:3,content:'New comment'}})}));
 await act(async()=>del({ok:true}));
 expect(screen.getByText('New comment')).toBeTruthy();expect(screen.getByText('Keep me')).toBeTruthy();expect(screen.queryByText('Remove me')).toBeNull();
});

it('initial page completing after a post must not erase the new comment',async()=>{
 let load;
 api.GetComments.mockImplementation(()=>new Promise(r=>{load=r;}));
 api.PostComment.mockResolvedValue({ok:true,json:async()=>({comment:{id:2,content:'Posted during load'}})});
 render(<Comments eventId={1}/>);
 expect(await screen.findByDisplayValue('StoredName')).toHaveAttribute('readonly');
 fireEvent.change(screen.getByPlaceholderText('Write a comment...'),{target:{value:'Posted during load'}});
 fireEvent.click(screen.getByRole('button',{name:'Post Comment'}));
 await act(async()=>{});
 await act(async()=>load({ok:true,json:async()=>({comments:[{id:1,content:'Existing comment'}]})}));
 expect(screen.getByText('Posted during load')).toBeTruthy();expect(screen.getByText('Existing comment')).toBeTruthy();
});

it.each([true,false])('late old-route post (ok=%s) cannot affect the new thread or its draft',async ok=>{
 let post;
 api.GetComments.mockImplementation(async({event_id})=>({ok:true,json:async()=>({comments:[{id:event_id,content:`Thread ${event_id}`}]})}));
 api.PostComment.mockImplementation(()=>new Promise(r=>{post=r;}));
 const view=render(<Comments eventId={1}/>);await screen.findByText('Thread 1');
 expect(await screen.findByDisplayValue('StoredName')).toHaveAttribute('readonly');
 fireEvent.change(screen.getByPlaceholderText('Write a comment...'),{target:{value:'Old pending post'}});
 fireEvent.click(screen.getByRole('button',{name:'Post Comment'}));
 view.rerender(<Comments eventId={2}/>);await screen.findByText('Thread 2');
 fireEvent.change(screen.getByPlaceholderText('Write a comment...'),{target:{value:'New draft'}});
 await act(async()=>post({ok,json:async()=>({comment:{id:3,content:'Old pending post'},error:'Old failure'})}));
 expect(screen.getByPlaceholderText('Write a comment...')).toHaveValue('New draft');
 expect(screen.getByText('Thread 2')).toBeTruthy();expect(screen.queryByText('Old pending post')).toBeNull();expect(screen.queryByText('Old failure')).toBeNull();
});
