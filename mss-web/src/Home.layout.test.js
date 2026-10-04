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

it('stacks event links edge-to-edge with separators inside their hit targets',()=>{
 const css=readFileSync('src/components/Home.Component.module.css','utf8');
 const item=css.match(/\.list li\s*\{([^}]*)\}/)[1];
 const card=css.match(/\.eventCard\s*\{([^}]*)\}/)[1];
 expect(item).toMatch(/padding:\s*0\s*;/);
 expect(item).not.toMatch(/border/);
 expect(card).toMatch(/border-radius:\s*0\s*;/);
 expect(card).toMatch(/border-bottom:\s*1px solid #303236/);
 expect(card).toMatch(/padding:\s*12px\s*;/);
 expect(card).toMatch(/gap:\s*12px\s*;/);
 expect(card).toMatch(/min-height:\s*112px/);
 expect(css).toMatch(/\.sectionHeading\s*\{[^}]*margin-bottom:\s*12px/);
 expect(css).toMatch(/\.eventsColumn\s*\{[^}]*gap:\s*28px/);
 expect(css).toMatch(/a:focus-visible[^}]*outline:\s*2px/);
});

it('matches the library blue wash on event hover and keyboard focus without tinting text',()=>{
 const css=readFileSync('src/components/Home.Component.module.css','utf8');
 expect(css).toMatch(/\.eventCard:hover::after,\s*\.eventCard:focus-visible::after\s*\{[^}]*background:\s*#90caf90d/);
 expect(css).toMatch(/\.eventCard::after\s*\{[^}]*position:\s*absolute[^}]*inset:\s*0[^}]*z-index:\s*1[^}]*pointer-events:\s*none/);
 expect(css.match(/\.eventCard:hover::after,\s*\.eventCard:focus-visible::after\s*\{([^}]*)\}/)[1]).not.toMatch(/box-shadow|border|outline/);
 expect(css).toMatch(/\.eventCard > span, \.eventCard > time\s*\{[^}]*z-index:\s*2/);
});

it('uses the event background indicator instead of underlining event text',()=>{
 const css=readFileSync('src/components/Home.Component.module.css','utf8');
 expect(css).toMatch(/\.container a\.eventCard,\s*\.container a\.eventCard:hover,\s*\.container a\.eventCard:focus-visible\s*\{\s*text-decoration:\s*none/);
 expect(css).toMatch(/\.container a:hover\s*\{\s*text-decoration:\s*underline/);
});

it('washes gallery images blue on hover and focus without a highlighted edge',()=>{
 const css=readFileSync('src/components/Home.Component.module.css','utf8');
 expect(css).toMatch(/\.galleryItem\s*\{[^}]*position:\s*relative/);
 expect(css).toMatch(/\.galleryItem::after\s*\{[^}]*content:\s*""[^}]*position:\s*absolute[^}]*inset:\s*0[^}]*pointer-events:\s*none/);
 expect(css).toMatch(/\.galleryItem:hover::after,\s*\.galleryItem:focus-visible::after\s*\{[^}]*background:\s*#90caf90d/);
 const states=[...css.matchAll(/[^{}]*\.galleryItem[^{}]*:(?:hover|focus-visible)[^{}]*\{([^}]*)\}/g)];
 expect(states.length).toBeGreaterThan(0);
 for(const [,rule] of states) expect(rule).not.toMatch(/border|box-shadow|outline/);
 expect(css).toMatch(/\.container button:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--primary-main\)/);
 expect(css).toMatch(/\.galleryItem img\s*\{[^}]*width:\s*100%[^}]*height:\s*100%[^}]*object-fit:\s*cover/);
});
