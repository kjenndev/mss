import {readFileSync} from 'node:fs';
import {it,expect} from 'vitest';
it('stretches the homepage library scroll area only on shared-row desktop layouts',()=>{
 const css=readFileSync('src/components/Media/Media.module.css','utf8');
 expect(css).toMatch(/@media\s*\(min-width:\s*801px\)/);
 expect(css).toMatch(/\.fillHeight\s*\{[^}]*display:\s*flex/);
 expect(css).toMatch(/\.fillHeight \.tracks\s*\{[^}]*flex:\s*1 1 0/);
 expect(css).toMatch(/\.fillHeight \.tracks\s*\{[^}]*max-height:\s*none/);
 expect(css).toMatch(/\.tracks\s*\{[^}]*overflow:\s*auto/);
 const home=readFileSync('src/components/Home.Component.module.css','utf8');
 expect(home).toMatch(/\.eventsColumn\s*\{[^}]*gap:\s*28px/);
 expect(home).toMatch(/\.lower > \*\s*\{[^}]*min-width:\s*0/);
});

it('keeps one modest 16px homepage-to-footer gap, not stacked spacing',()=>{
 const css=readFileSync('src/components/Home.Component.module.css','utf8');
 expect(css).toMatch(/\.container\s*\{[^}]*padding:\s*0 clamp\(20px, 4\.45vw, 80px\) 16px;/);
 expect(css).toMatch(/\.container\s*\{[^}]*padding:\s*0 20px 16px;/);
 expect(css).toMatch(/\.container \+ footer\s*\{[^}]*margin-top:\s*0;/);
});
