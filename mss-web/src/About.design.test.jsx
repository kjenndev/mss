// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import About from './components/About.Component';
import * as api from './Data.Helper.Api';
vi.mock('./Data.Helper.Api');
beforeEach(() => { cleanup(); vi.resetAllMocks(); });
const settings = (data) => ({ok:true,json:async()=>({settings:data})});
function mount(){return render(<MemoryRouter><Routes><Route path="/" element={<About/>}/><Route path="/admin/about" element={<h1>About editor</h1>}/></Routes></MemoryRouter>);}
it('renders identity beside sanitized saved content and real cover, with admin editor',async()=>{
 api.IsAdmin.mockReturnValue(true);
 api.GetSettings.mockResolvedValue(settings({about_content:'<h2>Our actual story</h2><p>Saved description</p><script>alert(1)</script>',about_cover_photo:'/uploads/about.jpg'}));
 const {container}=mount();
 await screen.findByRole('heading',{level:1,name:'About MSS'});
 expect(screen.getByRole('region',{name:'About content'}).textContent).toContain('Saved description');
 expect(screen.getByRole('img',{name:'Midnight Sound Syndicate cover'})).toBeTruthy();
 expect(container.querySelector('script')).toBeNull();
 expect(screen.queryByText(/sample editorial copy/i)).toBeNull();
 expect(screen.getByRole('link',{name:/Meet the artists/i}).getAttribute('href')).toBe('/artists');
 fireEvent.click(screen.getByRole('button',{name:'Edit Page'}));
 expect(await screen.findByRole('heading',{name:'About editor'})).toBeTruthy();
});

it.each([false, true])('omits About breadcrumbs for admin=%s while retaining the page heading',async(isAdmin)=>{
 api.IsAdmin.mockReturnValue(isAdmin);
 api.GetSettings.mockResolvedValue(settings({about_content:'<p>Saved story</p>'}));mount();
 expect(await screen.findByRole('heading',{level:1,name:'About MSS'})).toBeTruthy();
 expect(screen.queryByRole('navigation',{name:/breadcrumb/i})).toBeNull();
 expect(screen.getByRole('link',{name:/Explore events/i}).getAttribute('href')).toBe('/events');
 expect(Boolean(screen.queryByRole('button',{name:'Edit Page'}))).toBe(isAdmin);
});

it('keeps an honest empty state and hides editing for visitors',async()=>{
 api.GetSettings.mockResolvedValue(settings({about_content:null,about_cover_photo:null}));mount();
 expect(await screen.findByText('About content has not been added yet.')).toBeTruthy();
 expect(screen.queryByRole('button',{name:'Edit Page'})).toBeNull();
 expect(screen.queryByRole('img')).toBeNull();
});
it('removes a broken cover without removing the story',async()=>{
 api.GetSettings.mockResolvedValue(settings({about_content:'<p>Actual story</p>',about_cover_photo:'/uploads/broken.jpg'}));mount();
 fireEvent.error(await screen.findByRole('img',{name:'Midnight Sound Syndicate cover'}));
 expect(screen.queryByRole('img',{name:'Midnight Sound Syndicate cover'})).toBeNull();
 expect(screen.getByText('Actual story')).toBeTruthy();
});
it('retries a malformed settings response and shows loading',async()=>{
 api.GetSettings.mockResolvedValueOnce({ok:true,json:async()=>({})}).mockResolvedValueOnce(settings({about_content:'<p>Recovered story</p>'}));mount();
 fireEvent.click(await screen.findByRole('button',{name:'Retry'}));
 expect(screen.getByRole('progressbar')).toBeTruthy();
 expect(await screen.findByText('Recovered story')).toBeTruthy();
});
