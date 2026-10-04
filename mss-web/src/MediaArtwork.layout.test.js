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

// Composite in sRGB before applying WCAG relative luminance. The selection
// pseudo-element sits above both the artwork and text, so tint both pixels.
const hexColor = hex => {
 const channels = hex.slice(1).match(/../g).map(value => parseInt(value, 16));
 return [...channels.slice(0, 3), channels.length === 4 ? channels[3] / 255 : 1];
};
const composite = (foreground, background) => foreground.slice(0, 3).map((value, i) =>
 value * foreground[3] + background[i] * (1 - foreground[3]));
const luminance = color => color.map(value => {
 const channel = value / 255;
 return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}).reduce((sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i], 0);

it.each(['normal', 'hover', 'selected'])('keeps small metadata at 4.5:1 over white artwork when %s', state => {
 const css = readFileSync('src/components/Media/Media.module.css', 'utf8');
 const rule = selector => css.split('\n').find(line => line.startsWith(selector + ' {'));
 const metadata = hexColor(rule('.track .artist, .track .trackMeta').match(/color:(#[\da-f]+)/i)[1]);
 const stops = [...rule('.artwork::after').matchAll(/rgba\(([^)]+)\)/g)].map(match => match[1].split(',').map(Number));
 expect(stops.length).toBeGreaterThanOrEqual(2);
 const selector = state === 'hover' ? '.selectTrack:hover::after' : '.selectTrack[aria-pressed=true]::after';
 const tint = state === 'normal' ? [0, 0, 0, 0] : hexColor(rule(selector).match(/background:(#[\da-f]+)/i)[1]);
 // All stops use the same dark RGB, so white art at the lowest opacity is
 // the brightest possible background anywhere along this gradient.
 for (const stop of stops) expect(stop.slice(0, 3)).toEqual(stops[0].slice(0, 3));
 const weakestStop = stops.reduce((weakest, stop) => stop[3] < weakest[3] ? stop : weakest);
 const background = composite(tint, composite(weakestStop, [255, 255, 255]));
 const foreground = composite(tint, metadata);
 const ratio = (luminance(foreground) + 0.05) / (luminance(background) + 0.05);
 expect(ratio, `${state} worst-case metadata contrast: ${ratio}:1`).toBeGreaterThanOrEqual(4.5);
});
