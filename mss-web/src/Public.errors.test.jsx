// @vitest-environment jsdom
import {it,expect,vi,beforeEach} from 'vitest';
import {render,screen,cleanup} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import Artists from './components/Artist/Artist.Component.List';
import Events from './components/Event/Event.Component.List';
import About from './components/About.Component';
import Login from './components/Auth/Auth.Component.Login';
import {fireEvent} from '@testing-library/react';
import * as api from './Data.Helper.Api';
vi.mock('./Data.Helper.Api');
beforeEach(()=>{cleanup();vi.resetAllMocks();});
it.each([[Artists,'GetAllArtists'],[Events,'GetAllEvents'],[About,'GetSettings']])('public request failures display retry',async(Component,method)=>{
 api[method].mockResolvedValue({ok:false});
 render(<MemoryRouter><Component/></MemoryRouter>);
 expect(await screen.findByRole('button',{name:'Retry'})).toBeTruthy();
});
it('login reports connectivity errors and credential change notices',async()=>{
 api.Authenticate.mockRejectedValue(new Error('offline'));
 render(<MemoryRouter initialEntries={[{pathname:'/login',state:{message:'Please sign in again.'}}]}><Login/></MemoryRouter>);
 expect(screen.getByText('Please sign in again.')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Login'}));
 expect(await screen.findByText(/Unable to reach/i)).toBeTruthy();
});
