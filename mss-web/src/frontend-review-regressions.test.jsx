import {it,expect,vi,beforeEach} from 'vitest';
import {render,screen,fireEvent,waitFor,cleanup,act} from '@testing-library/react';
import {MemoryRouter,Routes,Route,Link} from 'react-router-dom';
import ArtistUpdate from './components/Artist/Artist.Component.Update';
import UpdateEvent from './components/Event/Event.Component.Update';
import Comments from './components/Comments/CommentSection';
import {sanitizeRichText} from './sanitize';
import Quill from 'quill';
import * as api from './Data.Helper.Api';
vi.mock('./Data.Helper.Api');
vi.mock('./components/Artist/Artist.Helper.DropDown',()=>({default:()=>null}));
vi.mock('@mui/x-date-pickers/DateTimePicker',()=>({DateTimePicker:({value,onChange})=><input aria-label="Date test field" value={value?.isValid() ? value.toISOString() : value ? 'invalid' : ''} onChange={()=>onChange({isValid:()=>false})}/>}));
beforeEach(()=>{cleanup();vi.resetAllMocks();});
it('late route A load must not overwrite the event B draft',async()=>{
 let resolveA;
 api.CanEditEvent.mockReturnValue(true);
 api.GetEventById.mockImplementation(id=>id==='1'?new Promise(r=>{resolveA=r;}):Promise.resolve({ok:true,json:async()=>({event:{id:2,title:'Event B'}})}));
 render(<MemoryRouter initialEntries={['/events/1/update']}><Link to="/events/2/update">Go B</Link><Routes><Route path="/events/:id/update" element={<UpdateEvent/>}/></Routes></MemoryRouter>);
 fireEvent.click(screen.getByText('Go B'));
 await waitFor(()=>expect(screen.getByLabelText(/Event Title/).value).toBe('Event B'));
 fireEvent.change(screen.getByLabelText(/Event Title/),{target:{value:'Event B draft'}});
 await act(async()=>{resolveA({ok:true,json:async()=>({event:{id:1,title:'Event A'}})});});
 expect(screen.getByLabelText(/Event Title/).value).toBe('Event B draft');
});
it('successful event deletion must navigate to event list',async()=>{
 vi.spyOn(window,'confirm').mockReturnValue(true);
 api.GetEventById.mockResolvedValue({ok:true,json:async()=>({event:{id:1,title:'Concert'}})});
 api.CanEditEvent.mockReturnValue(true);api.DeleteEvent.mockResolvedValue({ok:true});
 render(<MemoryRouter initialEntries={['/events/1/update']}><Routes><Route path="/events/:id/update" element={<UpdateEvent/>}/><Route path="/events" element={<div>Event list destination</div>}/></Routes></MemoryRouter>);
 fireEvent.click(await screen.findByRole('button',{name:/Delete Event/i}));
 await waitFor(()=>expect(api.DeleteEvent).toHaveBeenCalledWith('1'));
 expect(await screen.findByText('Event list destination')).toBeTruthy();
});
it('deleting a loaded comment must not skip the first unseen comment',async()=>{
 vi.spyOn(window,'confirm').mockReturnValue(true);api.IsAdmin.mockReturnValue(true);
 let rows=Array.from({length:101},(_,i)=>({id:i+1,content:`Comment-${i+1}`,author_name:'Guest'}));
 api.GetComments.mockImplementation(async({offset=0,after_id,limit})=>{
  const remaining=after_id === undefined ? rows.slice(offset) : rows.filter(row=>row.id>after_id);
  const comments=remaining.slice(0,limit);const has_more=remaining.length>limit;
  return {ok:true,json:async()=>({comments,has_more,next_offset:has_more?offset+limit:null,next_cursor:has_more?comments.at(-1).id:null})};
 });
 api.DeleteComment.mockImplementation(async id=>{rows=rows.filter(row=>row.id!==id);return {ok:true};});
 render(<Comments artistId={1}/>);await screen.findByText('Comment-1');
 fireEvent.click(screen.getAllByRole('button',{name:'Delete'})[0]);await waitFor(()=>expect(screen.queryByText('Comment-1')).toBeNull());
 fireEvent.click(screen.getByRole('button',{name:'Load more comments'}));
 expect(await screen.findByText('Comment-101')).toBeTruthy();
 expect(api.GetComments).toHaveBeenLastCalledWith({artist_id:1,after_id:100,limit:100});
});
it('sanitized real Quill bullet lists must preserve the selected format',()=>{
 const host=document.createElement('div');document.body.appendChild(host);const editor=new Quill(host);
 editor.setContents([{insert:'Bullet item'},{insert:'\n',attributes:{list:'bullet'}}]);
 const raw=editor.root.innerHTML;const clean=sanitizeRichText(raw);
 expect(editor.clipboard.convert({html:clean}).ops.some(op=>op.attributes?.list==='bullet')).toBe(true);
 host.remove();
});
it('sanitized real Quill code blocks must preserve the selected format',()=>{
 const host=document.createElement('div');document.body.appendChild(host);const editor=new Quill(host);
 editor.setContents([{insert:'const x = 1;'},{insert:'\n',attributes:{'code-block':'plain'}}]);
 const raw=editor.root.innerHTML;const clean=sanitizeRichText(raw);
 expect(editor.clipboard.convert({html:clean}).ops.some(op=>op.attributes?.['code-block'])).toBe(true);
 host.remove();
});

it('late artist load cannot overwrite the next route draft',async()=>{
 let resolveA;
 api.GetArtistImages.mockResolvedValue({ok:true,json:async()=>({images:[]})});
 api.GetArtistManageData.mockImplementation(id=>id==='1'?new Promise(r=>{resolveA=r;}):Promise.resolve({ok:true,json:async()=>({artist:{id:2,name:'Artist B'}})}));
 render(<MemoryRouter initialEntries={['/artists/1/update']}><Link to="/artists/2/update">Go B</Link><Routes><Route path="/artists/:id/update" element={<ArtistUpdate/>}/></Routes></MemoryRouter>);
 fireEvent.click(screen.getByText('Go B'));
 await waitFor(()=>expect(screen.getByLabelText(/Artist Name/).value).toBe('Artist B'));
 fireEvent.change(screen.getByLabelText(/Artist Name/),{target:{value:'Artist B draft'}});
 await act(async()=>{resolveA({ok:true,json:async()=>({artist:{id:1,name:'Artist A'}})});});
 expect(screen.getByLabelText(/Artist Name/).value).toBe('Artist B draft');
});

it('event route changes reset date errors, flyer selection and draft while loading',async()=>{
 let loadB;
 api.CanEditEvent.mockReturnValue(true);
 api.GetEventById.mockImplementation(id=>id==='1'?Promise.resolve({ok:true,json:async()=>({event:{id:1,title:'A',date:'2026-10-01T12:00:00Z'}})}):new Promise(r=>{loadB=r;}));
 const {container}=render(<MemoryRouter initialEntries={['/events/1/update']}><Link to="/events/2/update">Go B</Link><Routes><Route path="/events/:id/update" element={<UpdateEvent/>}/></Routes></MemoryRouter>);
 fireEvent.change(await screen.findByLabelText(/Event Title/),{target:{value:'Unsaved A'}});
 fireEvent.change(screen.getByLabelText('Date test field'),{target:{value:'invalid'}});
 fireEvent.change(container.querySelector('input[type=file]'),{target:{files:[new File(['x'],'old-flyer.png',{type:'image/png'})]}});
 expect(screen.getByText(/Enter a valid date/)).toBeTruthy();expect(screen.getByText('old-flyer.png')).toBeTruthy();
 fireEvent.click(screen.getByText('Go B'));
 expect(screen.queryByLabelText(/Event Title/)).toBeNull();expect(screen.getByRole('progressbar')).toBeTruthy();
 await act(async()=>loadB({ok:true,json:async()=>({event:{id:2,title:'B',date:null}})}));
 expect(screen.getByLabelText(/Event Title/)).toHaveValue('B');expect(screen.getByLabelText('Date test field')).toHaveValue('');
 expect(screen.queryByText(/Enter a valid date/)).toBeNull();expect(screen.queryByText('old-flyer.png')).toBeNull();
 expect(container.querySelector('input[type=file]').files).toHaveLength(0);
});
it('event forbidden state does not survive a route change',async()=>{
 api.CanEditEvent.mockImplementation(event=>event.id===2);
 api.GetEventById.mockImplementation(async id=>({ok:true,json:async()=>({event:{id:Number(id),title:'Allowed B'}})}));
 render(<MemoryRouter initialEntries={['/events/1/update']}><Link to="/events/2/update">Go B</Link><Routes><Route path="/events/:id/update" element={<UpdateEvent/>}/></Routes></MemoryRouter>);
 await screen.findByText(/not authorized/);fireEvent.click(screen.getByText('Go B'));
 expect(await screen.findByLabelText(/Event Title/)).toHaveValue('Allowed B');expect(screen.queryByText(/not authorized/)).toBeNull();
});
it('late event save cannot redirect away from the new route draft',async()=>{
 let saveA;api.CanEditEvent.mockReturnValue(true);
 api.GetEventById.mockImplementation(async id=>({ok:true,json:async()=>({event:{id:Number(id),title:`Event ${id}`}})}));
 api.UpdateEvent.mockImplementation(()=>new Promise(r=>{saveA=r;}));
 render(<MemoryRouter initialEntries={['/events/1/update']}><Link to="/events/2/update">Go B</Link><Routes><Route path="/events/:id/update" element={<UpdateEvent/>}/><Route path="/events/:id" element={<div>Wrong destination</div>}/></Routes></MemoryRouter>);
 await screen.findByLabelText(/Event Title/);fireEvent.click(screen.getByRole('button',{name:'Update Event'}));
 fireEvent.click(screen.getByText('Go B'));fireEvent.change(await screen.findByLabelText(/Event Title/),{target:{value:'B draft'}});
 await act(async()=>saveA({ok:true}));expect(screen.getByLabelText(/Event Title/)).toHaveValue('B draft');expect(screen.queryByText('Wrong destination')).toBeNull();
});
it('artist route changes reset errors, selected files and upload state',async()=>{
 let uploadA;
 api.GetArtistImages.mockResolvedValue({ok:true,json:async()=>({images:[]})});
 api.GetArtistManageData.mockImplementation(async id=>({ok:true,json:async()=>({artist:{id:Number(id),name:`Artist ${id}`}})}));
 api.UploadArtistImage.mockImplementation(()=>new Promise(r=>{uploadA=r;}));
 const {container}=render(<MemoryRouter initialEntries={['/artists/1/update']}><Link to="/artists/2/update">Go B</Link><Routes><Route path="/artists/:id/update" element={<ArtistUpdate/>}/></Routes></MemoryRouter>);
 await screen.findByLabelText(/Artist Name/);
 fireEvent.change(container.querySelector('input[type=file]'),{target:{files:[new File(['x'],'old.png',{type:'image/png'})]}});
 expect(screen.getByRole('progressbar')).toBeTruthy();fireEvent.click(screen.getByText('Go B'));
 fireEvent.change(await screen.findByLabelText(/Artist Name/),{target:{value:'B draft'}});
 expect(container.querySelector('input[type=file]').files).toHaveLength(0);expect(screen.queryByRole('progressbar')).toBeNull();
 await act(async()=>uploadA({ok:false,json:async()=>({error:'Old upload failed'})}));
 expect(screen.queryByText('Old upload failed')).toBeNull();expect(screen.getByLabelText(/Artist Name/)).toHaveValue('B draft');
});
