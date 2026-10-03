// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import Comments from './components/Comments/CommentSection';
import * as api from './Data.Helper.Api';
vi.mock('./Data.Helper.Api');
beforeEach(()=>{cleanup();vi.resetAllMocks();api.GetComments.mockResolvedValue({ok:true,json:async()=>({comments:[]})});});
it('presents an accessible open composer with labeled comment field',async()=>{
 render(<Comments eventId={1}/>);
 expect(await screen.findByRole('region',{name:'Write a comment'})).toBeTruthy();
 expect(screen.getByRole('textbox',{name:'Comment'})).toBeTruthy();
 expect(screen.getByRole('button',{name:'Post Comment'}).disabled).toBe(true);
});
