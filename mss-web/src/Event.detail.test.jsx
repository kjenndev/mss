// @vitest-environment jsdom
import {it,expect,vi} from 'vitest';
import {render,screen,fireEvent} from '@testing-library/react';
import {MemoryRouter,Routes,Route} from 'react-router-dom';
import Detail from './components/Event/Event.Component.Detail';
import * as api from './Data.Helper.Api';
vi.mock('./Data.Helper.Api');vi.mock('./components/Comments/CommentSection',()=>({default:()=>null}));
it('displays failed gallery uploads and permits retry',async()=>{
 api.GetEventById.mockResolvedValue({ok:true,json:async()=>({event:{id:1,title:'Event',artists:[],images:[]}})});api.IsAdmin.mockReturnValue(true);
 api.UploadEventImage.mockResolvedValue({ok:false});
 const {container}=render(<MemoryRouter initialEntries={['/events/1']}><Routes><Route path="/events/:id" element={<Detail/>}/></Routes></MemoryRouter>);
 await screen.findByText('Event');fireEvent.change(container.querySelector('input[type=file]'),{target:{files:[new File(['x'],'a.png')]}});
 expect(await screen.findByText(/upload failed/i)).toBeTruthy();
});
