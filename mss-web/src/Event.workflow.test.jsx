// @vitest-environment jsdom
import { expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import dayjs from 'dayjs';
import UpdateEvent from './components/Event/Event.Component.Update';
import CreateEvent from './components/Event/Event.Component.Create';
import * as api from './Data.Helper.Api';
vi.mock('./Data.Helper.Api');
vi.mock('./components/Artist/Artist.Helper.DropDown',()=>({default:()=>null}));
vi.mock('@mui/x-date-pickers/DateTimePicker',()=>({DateTimePicker:({onChange})=><><button onClick={()=>onChange(dayjs('invalid'))}>Invalid date</button><button onClick={()=>onChange(null)}>Clear date</button></>}));
beforeEach(()=>{cleanup();vi.resetAllMocks();});
it('retries a failed flyer without creating a second event',async()=>{
 api.CreateEvent.mockResolvedValue({ok:true,json:async()=>({event:{id:8}})});
 api.UploadEventFlyer.mockResolvedValue({ok:false});
 const {container}=render(<MemoryRouter><CreateEvent/></MemoryRouter>);
 fireEvent.change(screen.getByLabelText(/Event Title/),{target:{value:'Concert'}});
 fireEvent.change(container.querySelector('input[type=file]'),{target:{files:[new File(['x'],'flyer.png')]}});
 fireEvent.click(screen.getByRole('button',{name:'Create Event'}));
 await screen.findByText(/flyer upload failed/i);
 fireEvent.click(screen.getByRole('button',{name:/Retry flyer|Create Event/i}));
 await waitFor(()=>expect(api.UploadEventFlyer).toHaveBeenCalledTimes(2));
 expect(api.CreateEvent).toHaveBeenCalledTimes(1);
});

it('invalid dates show validation instead of serializing and cleared dates submit null',async()=>{
 api.CreateEvent.mockResolvedValue({ok:false,json:async()=>({error:'stop'})});
 render(<MemoryRouter><CreateEvent/></MemoryRouter>);
 fireEvent.change(screen.getByLabelText(/Event Title/),{target:{value:'Concert'}});
 fireEvent.click(screen.getByText('Invalid date'));
 expect(await screen.findByText('Enter a valid date or clear the date.')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Create Event'}));
 expect(api.CreateEvent).not.toHaveBeenCalled();
 fireEvent.click(screen.getByText('Clear date'));
 fireEvent.click(screen.getByRole('button',{name:'Create Event'}));
 await waitFor(()=>expect(api.CreateEvent).toHaveBeenCalledWith(expect.objectContaining({date:null})));
});

it('event editing refuses unrelated owners before exposing a draft',async()=>{
 api.GetEventById.mockResolvedValue({ok:true,json:async()=>({event:{id:1,title:'Private draft',creator_id:7}})});
 api.CanEditEvent.mockReturnValue(false);
 render(<MemoryRouter initialEntries={['/events/1/update']}><Routes><Route path="/events/:id/update" element={<UpdateEvent/>}/></Routes></MemoryRouter>);
 expect(await screen.findByText(/not authorized/i)).toBeTruthy();
 expect(screen.queryByLabelText(/Event Title/)).toBeNull();
});
it('event edit failures offer retry rather than permanent loading',async()=>{
 api.GetEventById.mockRejectedValue(new Error('offline'));
 render(<MemoryRouter initialEntries={['/events/1/update']}><Routes><Route path="/events/:id/update" element={<UpdateEvent/>}/></Routes></MemoryRouter>);
 expect(await screen.findByRole('button',{name:'Retry'})).toBeTruthy();
});
it('an undated event update submits null',async()=>{
 api.GetEventById.mockResolvedValue({ok:true,json:async()=>({event:{id:1,title:'Event',date:null}})});api.CanEditEvent.mockReturnValue(true);
 api.UpdateEvent.mockResolvedValue({ok:false,json:async()=>({error:'stop'})});
 render(<MemoryRouter initialEntries={['/events/1/update']}><Routes><Route path="/events/:id/update" element={<UpdateEvent/>}/></Routes></MemoryRouter>);
 await screen.findByLabelText(/Event Title/);
 fireEvent.click(screen.getByRole('button',{name:'Update Event'}));
 await waitFor(()=>expect(api.UpdateEvent).toHaveBeenCalledWith('1',expect.objectContaining({date:null})));
});
