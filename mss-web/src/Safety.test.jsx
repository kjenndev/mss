// @vitest-environment jsdom
import {it,expect,vi,beforeEach} from 'vitest';
import {render,screen,cleanup,fireEvent,waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import About from './components/About.Component';
import Profile from './components/User/User.Component.Profile';
import * as api from './Data.Helper.Api';
vi.mock('./Data.Helper.Api');
beforeEach(()=>{cleanup();vi.resetAllMocks();});
it('sanitizes active About HTML while preserving basic formatting',async()=>{
 api.GetSettings.mockResolvedValue({ok:true,json:async()=>({settings:{about_content:'<p>Hello <strong>music</strong><img src=x onerror="alert(1)"><iframe src="https://evil.test"></iframe><a href="javascript:alert(1)">bad</a></p>'}})});
 const {container}=render(<MemoryRouter><About/></MemoryRouter>);
 await screen.findByText('music');expect(container.querySelector('[onerror],iframe,a[href^="javascript:"]')).toBeNull();expect(container.querySelector('strong')).not.toBeNull();
});
it('successful credential changes clear local auth and require login',async()=>{
 api.GetCurrentUser.mockResolvedValue({ok:true,json:async()=>({user:{id:1,username:'old'}})});
 api.UpdateMyProfile.mockResolvedValue({ok:true,json:async()=>({reauthenticate:true})});
 render(<MemoryRouter><Profile/></MemoryRouter>);
 fireEvent.change(await screen.findByLabelText('Username'),{target:{value:'new'}});
 fireEvent.click(screen.getByRole('button',{name:'Save Changes'}));
 await waitFor(()=>expect(api.clearSession).toHaveBeenCalled());
});
