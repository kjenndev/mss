import {readFileSync} from 'node:fs';
import {it,expect} from 'vitest';
it('reserves a fixed neutral artwork square with nonshrinking image bounds',()=>{
 const css=readFileSync('src/components/Media/Media.module.css','utf8');
 expect(css).toMatch(/\.artwork\s*\{[^}]*width:\s*48px/);
 expect(css).toMatch(/\.artwork\s*\{[^}]*height:\s*48px/);
 expect(css).toMatch(/\.artwork\s*\{[^}]*flex-shrink:\s*0/);
 expect(css).toMatch(/\.artwork img\s*\{[^}]*object-fit:\s*cover/);
 expect(css).toMatch(/\.trackTitle\s*\{[^}]*min-width:\s*0/);
});
