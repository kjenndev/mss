// @vitest-environment jsdom
import {it,expect,vi,beforeEach} from 'vitest';
import {render,screen,cleanup,fireEvent,act} from '@testing-library/react';
import Comments from './components/Comments/CommentSection';
import * as api from './Data.Helper.Api';
vi.mock('./Data.Helper.Api');
const response=data=>({ok:true,json:async()=>data});
const row=(id,date)=>({id,created_at:date,content:`Row ${id}`,author_name:'Account'});
const order=()=>screen.queryAllByText(/^Row /).map(n=>n.textContent);
beforeEach(()=>{cleanup();vi.resetAllMocks();api.HasSession.mockReturnValue(true);api.GetCurrentUser.mockResolvedValue(response({user:{id:7,username:'Account'}}));api.GetCommentIdentities.mockResolvedValue(response({identities:[]}));});
it('composer precedes chronological thread; older pages preserve newest posts and ties',async()=>{
 const cursor=JSON.stringify({date:'2026-01-01 00:00:00+00',id:3});
 api.GetComments.mockResolvedValueOnce(response({comments:[row(3,'2026-01-01'),row(2,'2026-02-01'),row(1,'2026-02-01')],has_more:true,next_cursor:cursor})).mockResolvedValue(response({comments:[row(5,null),row(4,'2025-01-01'),row(3,'2026-01-01')],has_more:false}));
 render(<Comments artistId={1}/>);await screen.findByText('Row 1');
 expect(api.GetComments).toHaveBeenCalledWith({artist_id:1,order:'newest',limit:100});
 expect(order()).toEqual(['Row 2','Row 1','Row 3']);
 expect(screen.getByRole('region',{name:'Write a comment'}).compareDocumentPosition(screen.getByText('Row 2')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
 expect(screen.queryByText(/oldest.first|newest.first/i)).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Load more comments'}));await screen.findByText('Row 4');
 expect(api.GetComments).toHaveBeenLastCalledWith({artist_id:1,order:'newest',before:cursor,limit:100});
 expect(order()).toEqual(['Row 2','Row 1','Row 3','Row 4','Row 5']);
});
it('a posted comment is visible above history even while initial load is pending and dedupes its late page',async()=>{
 let load;api.GetComments.mockImplementation(()=>new Promise(r=>{load=r;}));
 const posted=row(2,'2026-02-01');api.PostComment.mockResolvedValue(response({comment:posted}));
 render(<Comments eventId={1}/>);await screen.findByDisplayValue('Account');
 fireEvent.change(screen.getByRole('textbox',{name:'Comment'}),{target:{value:'Row 2'}});fireEvent.click(screen.getByRole('button',{name:'Post Comment'}));
 expect(await screen.findByText('Row 2',{selector:'p'})).toBeVisible();
 await act(async()=>load(response({comments:[row(1,'2026-01-01'),posted]})));
 expect(order()).toEqual(['Row 2','Row 1']);
});

it('keeps loaded history visible during older-page loading/failure and retries the same boundary without losing a concurrent post',async()=>{
 const cursor=JSON.stringify({date:'2026-01-01T00:00:00.000000Z',id:1});let older;
 api.GetComments.mockResolvedValueOnce(response({comments:[row(1,'2026-01-01')],has_more:true,next_cursor:cursor})).mockImplementationOnce(()=>new Promise(r=>{older=r;})).mockResolvedValue(response({comments:[row(3,'2025-01-01')],has_more:false}));
 api.PostComment.mockResolvedValue(response({comment:row(2,'2026-02-01')}));
 render(<Comments eventId={1}/>);await screen.findByText('Row 1');await screen.findByDisplayValue('Account');
 fireEvent.click(screen.getByRole('button',{name:'Load more comments'}));expect(screen.getByText('Row 1')).toBeVisible();
 fireEvent.change(screen.getByRole('textbox',{name:'Comment'}),{target:{value:'Row 2'}});fireEvent.click(screen.getByRole('button',{name:'Post Comment'}));await screen.findByText('Row 2',{selector:'p'});expect(order()).toEqual(['Row 2','Row 1']);
 await act(async()=>older({ok:false}));expect(order()).toEqual(['Row 2','Row 1']);
 fireEvent.click(screen.getByRole('button',{name:'Retry comments'}));await screen.findByText('Row 3');
 expect(api.GetComments).toHaveBeenLastCalledWith({event_id:1,order:'newest',before:cursor,limit:100});expect(order()).toEqual(['Row 2','Row 1','Row 3']);
});
it('retains exact microsecond ordering, ties by ID and keeps unknown dates after pre-epoch dates',async()=>{
 api.GetComments.mockResolvedValue(response({comments:[row(1,'2026-01-01T00:00:00.000002Z'),row(4,'2026-01-01T00:00:00.000001Z'),row(2,'1960-01-01'),row(3,null),row(5,'2026-01-01T00:00:00.000001Z')]}));
 render(<Comments artistId={1}/>);await screen.findByText('Row 1');expect(order()).toEqual(['Row 1','Row 5','Row 4','Row 2','Row 3']);
});
