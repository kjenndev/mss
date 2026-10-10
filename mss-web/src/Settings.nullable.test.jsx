import { it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import Settings from './components/Admin/Admin.Settings.Component';
import AboutEditor from './components/Admin/Admin.About.Component';
import * as api from './Data.Helper.Api';
vi.mock('./Data.Helper.Api');
vi.mock('react-quill-new', () => ({default: ({value}) => <textarea aria-label="About editor" value={value} readOnly />}));
beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);
it('accepts the API nullable settings value contract in System Settings', async () => {
 api.GetSettings.mockResolvedValue({ok:true,json:async()=>({settings:{social_twitch:null},raw:[{key:'social_twitch',value:null,description:'Optional Twitch'}]})});
 render(<Settings/>);
 expect(await screen.findByRole('button', {name:'Save social links'})).toBeEnabled();
 expect(screen.getByRole('textbox',{name:'Twitch'})).toHaveValue('');
});
it.each(['about_content','about_cover_photo'])('accepts a valid null %s from the API without locking About', async key => {
 api.GetSettings.mockResolvedValue({ok:true,json:async()=>({settings:{about_content:'<p>Existing music</p>',about_cover_photo:'',[key]:null}})});
 render(<AboutEditor/>);
 expect(await screen.findByRole('button', {name:'Save About Page'})).toBeEnabled();
 expect(screen.getByLabelText('About editor')).toHaveValue(key==='about_content'?'':'<p>Existing music</p>');
});

it('saves a null system setting as normalized empty text', async () => {
 const settings=Object.fromEntries(['social_twitch','social_instagram','social_facebook','social_twitter','social_youtube','social_tiktok','social_soundcloud','social_mixcloud','social_discord','social_bandcamp','social_spotify'].map(key=>[key,'']));
 api.GetSettings.mockResolvedValueOnce({ok:true,json:async()=>({raw:[{key:'social_twitch',value:null}]})}).mockResolvedValueOnce({ok:true,json:async()=>({raw:[],settings})});
 api.UpdateSettingsBatch.mockResolvedValue({ok:true});
 render(<Settings/>);
 fireEvent.click(await screen.findByRole('button',{name:'Save social links'}));
 await waitFor(()=>expect(api.UpdateSettingsBatch).toHaveBeenCalledWith(expect.arrayContaining([{key:'social_twitch',value:''}])));
});
it('recovers About from a failed GET to empty nullable content and cover', async () => {
 api.GetSettings.mockResolvedValueOnce({ok:false}).mockResolvedValueOnce({ok:true,json:async()=>({settings:{about_content:null,about_cover_photo:null}})});
 api.UpdateSettingsBatch.mockResolvedValue({ok:true});
 render(<AboutEditor/>);
 const retry=await screen.findByRole('button',{name:'Retry'});
 expect(screen.queryByRole('button',{name:'Save About Page'})).toBeNull();
 expect(api.UpdateSettingsBatch).not.toHaveBeenCalled();
 fireEvent.click(retry);
 expect(await screen.findByLabelText('About editor')).toHaveValue('');
 expect(screen.queryByRole('img',{name:'Cover'})).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Save About Page'}));
 await waitFor(()=>expect(api.UpdateSettingsBatch).toHaveBeenCalledWith([{key:'about_content',value:''}]));
});
it.each([undefined, null, {}, [{key:'x'}], [{key:'x',value:{}}], [{key:'x',value:[]}], [{key:'x',value:0}], [{key:'x',value:false}]].map(value => [value]))('keeps invalid raw settings blocked: %j', async raw => {
 api.GetSettings.mockResolvedValue({ok:true,json:async()=>({raw})});
 render(<Settings/>);
 expect(await screen.findByRole('button',{name:'Retry'})).toBeEnabled();
 expect(screen.queryByRole('button',{name:'Save'})).toBeNull();
 expect(screen.queryByRole('textbox')).toBeNull();
 expect(api.UpdateSetting).not.toHaveBeenCalled();
});
it.each([undefined, null, [], 'invalid', {about_content:{}}, {about_content:[]}, {about_content:0}, {about_content:false}, {about_cover_photo:{}}, {about_cover_photo:[]}, {about_cover_photo:0}, {about_cover_photo:false}].map(value => [value]))('keeps invalid About settings blocked: %j', async settings => {
 api.GetSettings.mockResolvedValue({ok:true,json:async()=>({settings})});
 render(<AboutEditor/>);
 expect(await screen.findByRole('button',{name:'Retry'})).toBeEnabled();
 expect(screen.queryByRole('button',{name:'Save About Page'})).toBeNull();
 expect(screen.queryByLabelText('About editor')).toBeNull();
 expect(api.UpdateSettingsBatch).not.toHaveBeenCalled();
});
