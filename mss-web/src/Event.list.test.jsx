// @vitest-environment jsdom
import {it,expect,vi,beforeEach} from 'vitest';
import {render,screen,fireEvent,cleanup,within} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import List from './components/Event/Event.Component.List';
import * as api from './Data.Helper.Api';
vi.mock('./Data.Helper.Api');
const events=[{id:1,title:'Later night',date:'2030-06-02T20:00:00Z',location:'Austin',flyer:'/uploads/flyer.jpg'},{id:2,title:'Earlier night',date:'2030-06-01T20:00:00Z',location:'San Antonio'},{id:3,title:'Undated',date:'invalid'}];
const response=(events)=>({ok:true,json:async()=>({events})});
const view=()=>render(<MemoryRouter><List/></MemoryRouter>);
beforeEach(()=>{cleanup();vi.resetAllMocks();api.GetAllEvents.mockResolvedValue(response(events));api.CanEditEvent.mockImplementation(e=>e.id===1);api.HasSession.mockReturnValue(true);});
it('offers searchable event grid with date sorting, counts, and permission-gated actions',async()=>{
 view();await screen.findByRole('heading',{name:'Later night'});
 expect(screen.getByRole('heading',{level:1,name:'Events'})).toBeTruthy();
 expect(screen.getAllByRole('article').map(x=>within(x).getByRole('heading').textContent)).toEqual(['Earlier night','Later night','Undated']);
 expect(screen.getByRole('link',{name:'Create Event'}).getAttribute('href')).toBe('/events/create');
 expect(screen.getByRole('link',{name:'Edit'}).getAttribute('href')).toBe('/events/1/update');
 expect(screen.getAllByRole('link',{name:'Details'})).toHaveLength(3);
 fireEvent.change(screen.getByRole('searchbox',{name:'Search events'}),{target:{value:'aUsTiN'}});
 expect(screen.getAllByRole('article')).toHaveLength(1);expect(screen.getByText('1 of 3 events')).toBeTruthy();
 fireEvent.change(screen.getByRole('searchbox'),{target:{value:''}});
 fireEvent.change(screen.getByRole('combobox'),{target:{value:'desc'}});
 expect(screen.getAllByRole('article').map(x=>within(x).getByRole('heading').textContent)).toEqual(['Later night','Earlier night','Undated']);
 expect(screen.getByText('Date to be announced')).toBeTruthy();
 fireEvent.change(screen.getByRole('searchbox'),{target:{value:'no match'}});expect(screen.getByText(/No matching events/)).toBeTruthy();
});

it('shows pending feedback and honest empty state after retry',async()=>{
 api.GetAllEvents.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(response([]));
 api.HasSession.mockReturnValue(false);api.CanEditEvent.mockReturnValue(false);
 view();expect(screen.getByText('Loading events…')).toBeTruthy();expect(screen.queryByText('0 events')).toBeNull();
 fireEvent.click(await screen.findByRole('button',{name:'Retry'}));expect(screen.getByText('Loading events…')).toBeTruthy();
 expect(await screen.findByText('No events yet.')).toBeTruthy();expect(screen.queryByRole('link',{name:'Create Event'})).toBeNull();
});
it('rejects malformed records rather than crashing during render',async()=>{
 api.GetAllEvents.mockResolvedValue(response([null]));view();expect(await screen.findByRole('button',{name:'Retry'})).toBeTruthy();
});
it('replaces broken flyer with fallback while retaining event details',async()=>{
 view();fireEvent.error(await screen.findByRole('img',{name:'Later night'}));
 expect(screen.queryByRole('img',{name:'Later night'})).toBeNull();expect(screen.getAllByText('No flyer available')).toHaveLength(3);
 expect(screen.getByRole('heading',{name:'Later night'})).toBeTruthy();
});
