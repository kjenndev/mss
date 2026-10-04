import {readFileSync} from 'node:fs';
import {it,expect} from 'vitest';
it('layers full-width natural-aspect art behind readable content and full-row selection',()=>{
 const css=readFileSync('src/components/Media/Media.module.css','utf8');
 const rule=selector=>css.split('\n').find(line=>line.startsWith(selector+' {'));
 expect(rule('.track')).toContain('position:relative');
 expect(rule('.artwork')).toContain('position:absolute');
 expect(rule('.artwork')).toContain('inset:0');
 expect(rule('.artwork')).toContain('pointer-events:none');
 for(const value of ['width:100%', 'height:auto', 'top:50%', 'transform:translateY(-50%)']) expect(rule('.artwork img')).toContain(value);
 expect(rule('.artwork::after')).toContain('linear-gradient');
 expect(rule('.selectTrack::after')).toContain('inset:0');
 expect(rule('.selectTrack:focus-visible::after')).toContain('outline:');
 expect(rule('.trackTitle')).toContain('min-width:0');
 expect(rule('.provider')).toContain('white-space:nowrap');
 expect(rule('.trackMeta')).toContain('min-width:0');
 expect(css).toContain('grid-template-columns:auto minmax(0,1fr)');
 expect(css).not.toMatch(/(?:^|[;{])\s*filter\s*:/);
});
