// @vitest-environment jsdom
import {it,expect,vi,beforeEach} from 'vitest';
import {render,screen,cleanup,act} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import RouteGuard from './RouteGuard';
import * as api from './Data.Helper.Api';
vi.mock('./Data.Helper.Api');
beforeEach(()=>{cleanup();vi.resetAllMocks();});
it('does not expose admin forms to a validated nonadmin',async()=>{
 api.HasSession.mockReturnValue(true);
 api.GetCurrentUser.mockResolvedValue({ok:true,json:async()=>({user:{id:2,role:'artist'}})});
 render(<MemoryRouter><RouteGuard admin><button>Save settings</button></RouteGuard></MemoryRouter>);
 expect(screen.queryByText('Save settings')).toBeNull();
 expect(await screen.findByText(/not authorized/i)).toBeTruthy();
});
it('allows a validated admin',async()=>{
 api.HasSession.mockReturnValue(true);
 api.GetCurrentUser.mockResolvedValue({ok:true,json:async()=>({user:{id:1,role:'admin'}})});
 render(<MemoryRouter><RouteGuard admin><button>Save settings</button></RouteGuard></MemoryRouter>);
 expect(await screen.findByText('Save settings')).toBeTruthy();
});
it('offers retry instead of accepting unvalidated credentials offline',async()=>{
 api.HasSession.mockReturnValue(true);api.GetCurrentUser.mockRejectedValue(new Error('offline'));
 render(<MemoryRouter><RouteGuard><button>Create event</button></RouteGuard></MemoryRouter>);
 expect(await screen.findByRole('button',{name:'Retry'})).toBeTruthy();
 expect(screen.queryByText('Create event')).toBeNull();
});

it('ignores old session validation after a new login',async()=>{
 localStorage.setItem('mss-token','old');api.HasSession.mockReturnValue(true);
 let resolve;api.GetCurrentUser.mockImplementationOnce(()=>new Promise(r=>{resolve=r;})).mockResolvedValue({ok:true,json:async()=>({user:{id:2,role:'artist'}})});
 render(<MemoryRouter><RouteGuard admin><button>Save settings</button></RouteGuard></MemoryRouter>);
 await act(async()=>{localStorage.setItem('mss-token','new');window.dispatchEvent(new CustomEvent('mss-auth-change'));});
 await screen.findByText(/not authorized/i);
 await act(async()=>{resolve({ok:true,json:async()=>({user:{id:1,role:'admin'}})});});
 expect(screen.queryByText('Save settings')).toBeNull();
});
