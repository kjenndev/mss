// @vitest-environment jsdom
import { it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import AdminSettings from './components/Admin/Admin.Settings.Component';
import * as api from './Data.Helper.Api';
vi.mock('./Data.Helper.Api');
beforeEach(() => { vi.resetAllMocks(); });
afterEach(cleanup);
it('links to the dedicated homepage curation settings',async()=>{api.GetSettings.mockResolvedValue({ok:true,json:async()=>({raw:[]})});render(<AdminSettings/>);expect((await screen.findByRole('link',{name:'Homepage featured videos'})).getAttribute('href')).toBe('/admin/homepage');});
const response = raw => ({ ok: true, json: async () => ({ raw }) });
it.each([
 ['network failure', () => Promise.reject(new Error('offline'))],
 ['HTTP failure', () => Promise.resolve({ ok: false })],
 ['invalid settings', () => Promise.resolve(response([{ value: 'bad' }]))],
 ['missing settings', () => Promise.resolve(response(undefined))],
])('retries %s without allowing unloaded settings to be saved', async (_name, failure) => {
 api.GetSettings.mockImplementationOnce(failure).mockResolvedValueOnce(response([
  { key: 'streaming_platform_url', value: 'https://stream.test', description: 'Streaming service' },
 ]));
 api.UpdateSetting.mockResolvedValue({ ok: true });
 render(<AdminSettings />);
 expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Failed to load settings');
 expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
 fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
 expect(await screen.findByDisplayValue('https://stream.test')).toBeTruthy();
 expect(screen.queryByRole('alert')).toBeNull();
 expect(api.GetSettings).toHaveBeenCalledTimes(2);
 expect(api.UpdateSetting).not.toHaveBeenCalled();
 fireEvent.change(screen.getByDisplayValue('https://stream.test'), { target: { value: 'https://new.test' } });
 fireEvent.click(screen.getByRole('button', { name: 'Save' }));
 await waitFor(() => expect(api.UpdateSetting).toHaveBeenCalledWith('streaming_platform_url', 'https://new.test'));
});
