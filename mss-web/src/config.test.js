import {it,expect,vi} from 'vitest';
it('defaults API requests to the same origin proxy',async()=>{
 vi.stubEnv('VITE_API_URL',''); vi.resetModules();
 const {API_BASE,getImageUrl}=await import('./config');
 expect(API_BASE).toBe('/api');expect(getImageUrl('/uploads/a.jpg')).toBe('/uploads/a.jpg');
});
it('accepts explicit API roots or api suffix with trailing slashes',async()=>{
 for(const value of ['https://api.example.test/','https://api.example.test/api/']) {
 vi.stubEnv('VITE_API_URL',value);vi.resetModules();
 const {API_BASE,getImageUrl}=await import('./config');
 expect(API_BASE).toBe('https://api.example.test/api');
 expect(getImageUrl('/uploads/a.jpg')).toBe('https://api.example.test/uploads/a.jpg');
 expect(getImageUrl('https://cdn.example.test/x.jpg')).toBe('https://cdn.example.test/x.jpg');
 }
});
