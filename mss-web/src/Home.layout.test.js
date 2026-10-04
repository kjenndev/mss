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

it('keeps the photo gallery in three equal shrinkable columns at every breakpoint',()=>{
 const css=readFileSync('src/components/Home.Component.module.css','utf8');
 const galleryRules=[...css.matchAll(/\.galleryGrid\s*\{([^}]*)\}/g)];
 expect(galleryRules).toHaveLength(1);
 expect(galleryRules[0][1]).toMatch(/grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
});

it('shows the full flyer width and clips only vertical overflow in event rows',()=>{
 const css=readFileSync('src/components/Home.Component.module.css','utf8');
 const backdrop=css.match(/\.eventBackdrop\s*\{([^}]*)\}/)[1];
 expect(backdrop).toMatch(/width:\s*100%/);
 expect(backdrop).toMatch(/height:\s*auto/);
 expect(backdrop).toMatch(/top:\s*50%/);
 expect(backdrop).toMatch(/transform:\s*translateY\(-50%\)/);
 expect(backdrop).not.toMatch(/object-fit:\s*cover/);
 expect(css).toMatch(/\.eventCard\s*\{[^}]*overflow:\s*hidden/);
});
