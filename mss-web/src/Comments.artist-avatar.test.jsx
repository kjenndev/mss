// @vitest-environment jsdom
import {beforeEach,it,expect,vi} from 'vitest';
import {render,screen,cleanup,fireEvent,within} from '@testing-library/react';
import Comments from './components/Comments/CommentSection';
import * as api from './Data.Helper.Api';
vi.mock('./Data.Helper.Api',()=>({HasSession:vi.fn(),GetCurrentUser:vi.fn(),GetCommentIdentities:vi.fn(),GetComments:vi.fn(),PostComment:vi.fn(),IsAdmin:vi.fn(),DeleteComment:vi.fn()}));
const response=data=>({ok:true,json:async()=>data});
beforeEach(()=>{cleanup();vi.resetAllMocks();api.HasSession.mockReturnValue(true);api.GetCurrentUser.mockResolvedValue(response({user:{username:'Account',profile_picture:'/uploads/account.webp'}}));api.GetCommentIdentities.mockResolvedValue(response({identities:[{id:1,name:'First'},{id:2,name:'Second'}]}));api.GetComments.mockResolvedValue(response({comments:[]}));});
it('uses posted artist profile only, keeps account avatar across selections, and renders server post image',async()=>{
 api.GetComments.mockResolvedValue(response({comments:[{id:1,author_name:'Historic Artist',author_artist_id:2,author_artist_name:'Historic Artist',author_artist_profile_picture:'/uploads/artist.webp',author_profile_picture:'/uploads/account.webp',content:'History'}]}));
 render(<Comments artistId={2}/>);
 expect(await screen.findByRole('img',{name:"Historic Artist's profile picture"})).toHaveAttribute('src','/uploads/artist.webp');
 const composer=within(screen.getByRole('region',{name:'Write a comment'}));
 const select=await composer.findByRole('combobox');expect(select).toHaveValue('2');
 for(const value of ['1','2','1']){fireEvent.change(select,{target:{value}});expect(composer.getByRole('img')).toHaveAttribute('src','/uploads/account.webp');expect(composer.getAllByRole('img')).toHaveLength(1);}
 api.PostComment.mockResolvedValue(response({comment:{id:2,author_name:'First',author_artist_name:'First',author_artist_id:1,author_artist_profile_picture:'/uploads/first.webp',content:'New'}}));
 fireEvent.change(screen.getByRole('textbox',{name:'Comment'}),{target:{value:'New'}});fireEvent.click(screen.getByRole('button',{name:'Post Comment'}));
 expect(await screen.findByRole('img',{name:"First's profile picture"})).toHaveAttribute('src','/uploads/first.webp');
 expect(api.PostComment).toHaveBeenCalledWith({content:'New',artist_id:2,event_id:null,author_artist_id:1});
});
it('missing broken and deleted artist photos fall back to historic initials, never account; legacy stays unchanged',async()=>{
 api.GetComments.mockResolvedValue(response({comments:[
 {id:1,author_name:'Missing',author_artist_name:'Missing',author_artist_id:1,author_artist_profile_picture:null},
 {id:2,author_name:'Broken',author_artist_name:'Broken',author_artist_id:2,author_artist_profile_picture:'/uploads/broken.webp'},
 {id:3,author_name:'Deleted',author_artist_name:'Deleted',author_artist_id:null,author_artist_profile_picture:null},
 {id:4,author_name:'Legacy'},
 {id:5,author_name:'Unsafe',author_artist_name:'Unsafe',author_artist_id:3,author_artist_profile_picture:'javascript:alert(1)'},
 ].map(c=>({...c,author_profile_picture:'/uploads/account.webp',content:'Comment '+c.id}))}));
 render(<Comments eventId={1}/>);
 fireEvent.error(await screen.findByRole('img',{name:"Broken's profile picture"}));
 for(const name of ['Missing','Broken','Deleted','Unsafe']){expect(screen.queryByRole('img',{name:`${name}'s profile picture`})).toBeNull();expect(screen.getByText(name[0],{exact:true})).toBeTruthy();}
 expect(screen.getByRole('img',{name:"Legacy's profile picture"})).toHaveAttribute('src','/uploads/account.webp');
});

it('route identity changes do not reuse broken or old artist portraits',async()=>{
 const comment=src=>({id:1,author_name:'Artist',author_artist_name:'Artist',author_artist_id:1,author_artist_profile_picture:src,content:'History'});
 api.GetComments.mockResolvedValue(response({comments:[comment('/uploads/broken.webp')]}));
 const view=render(<Comments artistId={1}/>);fireEvent.error(await screen.findByRole('img',{name:"Artist's profile picture"}));expect(screen.queryByRole('img',{name:"Artist's profile picture"})).toBeNull();
 api.GetComments.mockResolvedValue(response({comments:[comment('/uploads/replacement.webp')]}));view.rerender(<Comments artistId={2}/>);
 expect(await screen.findByRole('img',{name:"Artist's profile picture"})).toHaveAttribute('src','/uploads/replacement.webp');
 expect(within(screen.getByRole('region',{name:'Write a comment'})).getByRole('img')).toHaveAttribute('src','/uploads/account.webp');
});
