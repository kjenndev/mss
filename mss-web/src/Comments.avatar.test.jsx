// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import Comments from './components/Comments/CommentSection';
import * as api from './Data.Helper.Api';
vi.mock('./Data.Helper.Api');
beforeEach(()=>{cleanup();vi.resetAllMocks();api.HasSession.mockReturnValue(true);api.GetCurrentUser.mockResolvedValue({ok:true,json:async()=>({user:{username:'Listener',profile_picture:'/uploads/me.webp'}})});api.GetComments.mockResolvedValue({ok:true,json:async()=>({comments:[{id:1,author_name:'Author',author_profile_picture:'/uploads/author.webp',content:'Hello'},{id:2,author_name:'Historical',author_profile_picture:null,content:'Old'}]})});});
it('shows current user and author pictures with initials on absent or broken images',async()=>{
 render(<Comments artistId={1}/>);
 expect(await screen.findByRole('img',{name:"Listener's profile picture"})).toHaveAttribute('src','/uploads/me.webp');
 const author=await screen.findByRole('img',{name:"Author's profile picture"});
 expect(screen.getByText('H')).toBeTruthy(); fireEvent.error(author);
 await waitFor(()=>expect(screen.queryByRole('img',{name:"Author's profile picture"})).toBeNull());
 expect(screen.getByText('A')).toBeTruthy(); expect(screen.getByLabelText('Username')).toHaveAttribute('readonly');
});
