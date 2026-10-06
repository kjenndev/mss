// @vitest-environment jsdom
import {beforeEach,it,expect,vi} from 'vitest';
import {render,screen,cleanup,fireEvent,act} from '@testing-library/react';
import Comments from './components/Comments/CommentSection';
import * as api from './Data.Helper.Api';
vi.mock('./Data.Helper.Api',()=>({HasSession:vi.fn(),GetCurrentUser:vi.fn(),GetCommentIdentities:vi.fn(),GetComments:vi.fn(),PostComment:vi.fn(),IsAdmin:vi.fn(),DeleteComment:vi.fn()}));
const response = data => ({ok:true,json:async()=>data});
beforeEach(()=>{cleanup();vi.resetAllMocks();localStorage.setItem('mss-token','one');api.HasSession.mockReturnValue(true);api.GetCurrentUser.mockResolvedValue(response({user:{id:7,username:'Account',role:'artist'}}));api.GetComments.mockResolvedValue(response({comments:[{id:1,author_name:'Legacy',content:'History'}]}));});
it('composer precedes thread and real allowed profile default can be changed without refresh stealing it',async()=>{
 api.GetCommentIdentities.mockResolvedValue(response({identities:[{id:1,name:'First'},{id:2,name:'Second'}]}));
 render(<Comments artistId={2}/>);
 const select=await screen.findByRole('combobox',{name:'Posting as'});expect(select).toHaveValue('2');
 expect(screen.getByText('History').compareDocumentPosition(screen.getByRole('region',{name:'Write a comment'})) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
 fireEvent.change(select,{target:{value:'1'}});fireEvent.change(screen.getByRole('textbox',{name:'Comment'}),{target:{value:'Draft'}});
 await act(async()=>window.dispatchEvent(new CustomEvent('mss-avatar-change')));
 expect(await screen.findByRole('combobox',{name:'Posting as'})).toHaveValue('1');expect(screen.getByRole('textbox',{name:'Comment'})).toHaveValue('Draft');
 api.PostComment.mockResolvedValue(response({comment:{id:3,author_name:'Server first',author_artist_name:'Server first',content:'Draft'}}));
 fireEvent.click(screen.getByRole('button',{name:'Post Comment'}));expect(await screen.findByText('Server first')).toBeTruthy();expect(api.PostComment).toHaveBeenCalledWith({content:'Draft',artist_id:2,event_id:null,author_artist_id:1});
});

it('keeps the empty textarea label above its placeholder',async()=>{
 api.GetCommentIdentities.mockResolvedValue(response({identities:[]}));render(<Comments eventId={1}/>);await screen.findByDisplayValue('Account');
 const field=screen.getByRole('textbox',{name:'Comment'});expect(document.querySelector(`label[for="${field.id}"]`)).toHaveAttribute('data-shrink','true');
});
it.each([{identities:[]},{identities:[{id:1,name:'Only artist'}]}])('zero and one allowed identity have no selector; event uses deterministic first',async ({identities})=>{
 api.GetCommentIdentities.mockResolvedValue(response({identities}));render(<Comments eventId={1}/>);await screen.findByDisplayValue('Account');expect(screen.queryByRole('combobox')).toBeNull();
 api.PostComment.mockResolvedValue(response({comment:{id:3,content:'Post',author_name:'Saved'}}));fireEvent.change(screen.getByRole('textbox',{name:'Comment'}),{target:{value:'Post'}});fireEvent.click(screen.getByRole('button',{name:'Post Comment'}));await screen.findByText('Saved');expect(api.PostComment.mock.calls[0][0].author_artist_id).toBe(identities[0]?.id);
});
it('identity read failure disables posting without discarding draft and can retry',async()=>{
 api.GetCommentIdentities.mockResolvedValue(response({identities:[{id:1,name:'One'},{id:2,name:'Two'}]}));render(<Comments eventId={1}/>);await screen.findByRole('combobox');
 fireEvent.change(screen.getByRole('textbox',{name:'Comment'}),{target:{value:'Draft'}});api.GetCommentIdentities.mockResolvedValue({ok:false});await act(async()=>window.dispatchEvent(new CustomEvent('mss-avatar-change')));
 expect(await screen.findByText(/Unable to verify/)).toBeTruthy();expect(screen.getByRole('button',{name:'Post Comment'})).toBeDisabled();expect(screen.getByRole('textbox',{name:'Comment'})).toHaveValue('Draft');
 api.GetCommentIdentities.mockResolvedValue(response({identities:[{id:2,name:'Two'}]}));fireEvent.click(screen.getByRole('button',{name:'Retry identity'}));await screen.findByDisplayValue('Account');expect(screen.queryByRole('combobox')).toBeNull();expect(screen.getByRole('textbox',{name:'Comment'})).toHaveValue('Draft');
});
it('account changes reset scope and reject late posting completions',async()=>{
 api.GetCommentIdentities.mockResolvedValue(response({identities:[{id:1,name:'One'},{id:2,name:'Two'}]}));let finish;api.PostComment.mockImplementation(()=>new Promise(r=>{finish=r;}));render(<Comments artistId={2}/>);await screen.findByRole('combobox');
 fireEvent.change(screen.getByRole('textbox',{name:'Comment'}),{target:{value:'Old account draft'}});fireEvent.click(screen.getByRole('button',{name:'Post Comment'}));
 api.GetCurrentUser.mockResolvedValue(response({user:{id:8,username:'New account',role:'user'}}));api.GetCommentIdentities.mockResolvedValue(response({identities:[]}));localStorage.setItem('mss-token','two');await act(async()=>window.dispatchEvent(new CustomEvent('mss-auth-change')));await screen.findByDisplayValue('New account');expect(screen.getByRole('textbox',{name:'Comment'})).toHaveValue('');
 fireEvent.change(screen.getByRole('textbox',{name:'Comment'}),{target:{value:'New account draft'}});await act(async()=>finish(response({comment:{id:3,content:'Old account draft'}})));expect(screen.queryByText('Old account draft')).toBeNull();expect(screen.getByRole('textbox',{name:'Comment'})).toHaveValue('New account draft');
});
it('old account identity response cannot overwrite a newer account',async()=>{
 let finish;api.GetCommentIdentities.mockImplementationOnce(()=>new Promise(r=>{finish=r;})).mockResolvedValue(response({identities:[]}));render(<Comments artistId={2}/>);await act(async()=>{});
 api.GetCurrentUser.mockResolvedValue(response({user:{id:8,username:'New account',role:'user'}}));localStorage.setItem('mss-token','two');await act(async()=>window.dispatchEvent(new CustomEvent('mss-auth-change')));await screen.findByDisplayValue('New account');
 await act(async()=>finish(response({identities:[{id:1,name:'Old One'},{id:2,name:'Old Two'}]})));expect(screen.queryByRole('combobox')).toBeNull();expect(screen.getByRole('textbox',{name:'Username'})).toHaveValue('New account');
});
it('preserves edits typed while an earlier post is in flight',async()=>{
 api.GetCommentIdentities.mockResolvedValue(response({identities:[]}));let finish;api.PostComment.mockImplementation(()=>new Promise(r=>{finish=r;}));render(<Comments eventId={1}/>);await screen.findByDisplayValue('Account');
 fireEvent.change(screen.getByRole('textbox',{name:'Comment'}),{target:{value:'First'}});fireEvent.click(screen.getByRole('button',{name:'Post Comment'}));fireEvent.change(screen.getByRole('textbox',{name:'Comment'}),{target:{value:'Next draft'}});await act(async()=>finish(response({comment:{id:3,content:'First',author_name:'Account'}})));expect(screen.getByRole('textbox',{name:'Comment'})).toHaveValue('Next draft');
});

it('clears previous account choices immediately while the next account is still verifying',async()=>{
 api.GetCommentIdentities.mockResolvedValue(response({identities:[{id:1,name:'Old one'},{id:2,name:'Old two'}]}));render(<Comments artistId={2}/>);await screen.findByRole('combobox');
 api.GetCurrentUser.mockImplementation(()=>new Promise(()=>{}));localStorage.setItem('mss-token','two');await act(async()=>window.dispatchEvent(new CustomEvent('mss-auth-change')));
 expect(screen.queryByRole('combobox')).toBeNull();expect(screen.queryByText('Old one')).toBeNull();
});

it('a rejected posting identity can be refreshed without losing the draft',async()=>{
 api.GetCommentIdentities.mockResolvedValue(response({identities:[{id:1,name:'One'}]}));api.PostComment.mockResolvedValue({ok:false,status:403,json:async()=>({error:'Identity revoked'})});render(<Comments eventId={1}/>);await screen.findByDisplayValue('Account');
 fireEvent.change(screen.getByRole('textbox',{name:'Comment'}),{target:{value:'Keep draft'}});fireEvent.click(screen.getByRole('button',{name:'Post Comment'}));await screen.findByText('Identity revoked');
 api.GetCommentIdentities.mockResolvedValue(response({identities:[]}));fireEvent.click(screen.getByRole('button',{name:'Refresh posting identity'}));await screen.findByText('Posting with your username.');expect(screen.getByRole('textbox',{name:'Comment'})).toHaveValue('Keep draft');
});
