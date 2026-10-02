// @vitest-environment jsdom
import {it,expect,vi} from 'vitest';
import {render,screen,fireEvent} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import Nav from './components/Nav.Component.Wrapper';
vi.mock('./components/Nav.Component.Menu',()=>({default:()=> <a href="/login">Login</a>}));
it('provides a mobile navigation toggle with reachable primary links',()=>{
 render(<MemoryRouter><Nav/></MemoryRouter>);
 const toggle=screen.getByRole('button',{name:'Toggle navigation'});
 expect(toggle.getAttribute('aria-expanded')).toBe('false');
 fireEvent.click(toggle);expect(toggle.getAttribute('aria-expanded')).toBe('true');
 for(const name of ['Home','About','Artists','Events','Shop','Login']) expect(screen.getByRole('link',{name})).toBeTruthy();
});
