// @vitest-environment jsdom
import {it,expect,vi} from 'vitest';
import {render,screen,fireEvent} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import Create from './components/Artist/Artist.Component.Create';
import * as api from './Data.Helper.Api';
vi.mock('./Data.Helper.Api');vi.mock('./components/User/User.Helper.DropDown',()=>({default:()=>null}));
it('validates manual channel syntax and shows duplicate server feedback',async()=>{
 api.CreateArtist.mockResolvedValue({ok:false,status:409,json:async()=>({error:'Channel already assigned'})});
 render(<MemoryRouter><Create/></MemoryRouter>);
 fireEvent.change(screen.getByLabelText(/Artist Name/),{target:{value:'Artist'}});
 const field=screen.getByLabelText('Streaming Platform Channel Name');
 fireEvent.change(field,{target:{value:'bad channel'}});fireEvent.click(screen.getByRole('button',{name:'Create Artist'}));
 expect(await screen.findByText(/1.100.*letters/i)).toBeTruthy();expect(api.CreateArtist).not.toHaveBeenCalled();
 fireEvent.change(field,{target:{value:'valid-channel'}});fireEvent.click(screen.getByRole('button',{name:'Create Artist'}));
 expect(await screen.findByText('Channel already assigned')).toBeTruthy();
});

it('rejects backend-invalid leading punctuation and excessive channel length',async()=>{
 const {unmount}=render(<MemoryRouter><Create/></MemoryRouter>);
 fireEvent.change(screen.getAllByLabelText(/Artist Name/).at(-1),{target:{value:'Artist'}});
 const fields=screen.getAllByLabelText('Streaming Platform Channel Name');const field=fields.at(-1);
 fireEvent.change(field,{target:{value:'_channel'}});fireEvent.click(screen.getAllByRole('button',{name:'Create Artist'}).at(-1));
 expect(await screen.findByText(/start with a letter or number/)).toBeTruthy();unmount();
});
