import {readFileSync} from 'node:fs';
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

it('uses the header logo as the favicon',()=>{
 const html=readFileSync('index.html','utf8');
 const doc=new DOMParser().parseFromString(html,'text/html');
 const icon=doc.querySelector('link[rel="icon"]');
 expect(icon.getAttribute('href')).toBe('/msslogo.jpg');
 expect(icon.getAttribute('type')).toBe('image/jpeg');
 expect(readFileSync('public/msslogo.jpg').length).toBeGreaterThan(0);
});
