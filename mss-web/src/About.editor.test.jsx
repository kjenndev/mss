// @vitest-environment jsdom
import {it,expect,vi,beforeEach} from 'vitest';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import Editor from './components/Admin/Admin.About.Component';
import * as api from './Data.Helper.Api';
vi.mock('./Data.Helper.Api');
vi.mock('react-quill-new',()=>({default:({value,onChange,formats})=><><textarea aria-label="Editor" value={value} onChange={e=>onChange(e.target.value)}/><div data-testid="formats">{JSON.stringify(formats)}</div></>}));
beforeEach(()=>vi.resetAllMocks());
it('sanitizes editor input and saved output and limits formats',async()=>{
 api.GetSettings.mockResolvedValue({ok:true,json:async()=>({settings:{about_content:'<p>hello</p><iframe src="https://evil.test"></iframe>'}})});
 api.UpdateSettingsBatch.mockResolvedValue({ok:true});
 render(<Editor/>);const field=await screen.findByLabelText('Editor');
 expect(field.value).not.toContain('iframe');
 expect(screen.getByTestId('formats').textContent).not.toMatch(/video|formula/);
 fireEvent.change(field,{target:{value:'<p onclick="bad()">Music</p><script>bad()</script>'}});
 fireEvent.click(screen.getByRole('button',{name:'Save About Page'}));
 await waitFor(()=>expect(api.UpdateSettingsBatch).toHaveBeenCalledWith([{key:'about_content',value:'<p>Music</p>'}]));
});

it.each([
 ['HTTP failure',()=>Promise.resolve({ok:false,status:500})],
 ['network failure',()=>Promise.reject(new Error('offline'))],
 ['missing settings',()=>Promise.resolve({ok:true,json:async()=>({})})],
 ['malformed settings',()=>Promise.resolve({ok:true,json:async()=>({settings:[]})})],
 ['invalid content',()=>Promise.resolve({ok:true,json:async()=>({settings:{about_content:{}}})})],
])('blocks editing and saving after %s until Retry succeeds',async(_label,failure)=>{
 api.GetSettings.mockImplementationOnce(failure).mockResolvedValue({ok:true,json:async()=>({settings:{about_content:'<p>Existing music</p><script>bad()</script>'}})});
 render(<Editor/>);
 const retry=await screen.findByRole('button',{name:/Retry/});
 expect(screen.queryByLabelText('Editor')).toBeNull();
 expect(screen.queryByRole('button',{name:'Save About Page'})).toBeNull();
 expect(api.UpdateSettingsBatch).not.toHaveBeenCalled();
 fireEvent.click(retry);
 expect(await screen.findByLabelText('Editor')).toHaveValue('<p>Existing music</p>');
 expect(screen.getByRole('button',{name:'Save About Page'})).toBeEnabled();
});
