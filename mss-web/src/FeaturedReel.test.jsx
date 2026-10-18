// @vitest-environment jsdom
import {useState} from 'react';
import {it,expect,vi,afterEach} from 'vitest';
import {render,screen,cleanup,fireEvent,act} from '@testing-library/react';
import {readFileSync} from 'node:fs';
import FeaturedReel from './components/Media/FeaturedReel';
const items=[1,2,3].map(i=>({id:String(i),title:'Item '+i,durationSeconds:60}));
afterEach(()=>{cleanup();vi.useRealTimers();vi.restoreAllMocks();});
it('animates the reel transform to the selected card without scrolling the page',async()=>{
 const pageScroll=vi.spyOn(window,'scrollTo').mockImplementation(()=>{});
 Object.defineProperty(HTMLElement.prototype,'clientWidth',{configurable:true,get(){return this.className?.includes?.('reelViewport')?300:0;}});
 Object.defineProperty(HTMLElement.prototype,'offsetWidth',{configurable:true,get(){return this.hasAttribute?.('data-carousel-slot')?160:0;}});
 Object.defineProperty(HTMLElement.prototype,'offsetLeft',{configurable:true,get(){return this.hasAttribute?.('data-carousel-slot')?400:0;}});
 const view=render(<FeaturedReel items={items} selectedId="2" onSelect={()=>{}} renderSelected={item=><span>Playing {item.title}</span>}/>);
 view.rerender(<FeaturedReel items={items} selectedId="3" onSelect={()=>{}} renderSelected={item=><span>Playing {item.title}</span>}/>);
 await act(async()=>{});
 const reel=screen.getByLabelText('Featured videos').firstElementChild;
 expect(reel.style.transform).toBe('translate3d(-330px, 0, 0)');
 expect(reel.style.transition).toContain('650ms');
 expect(pageScroll).not.toHaveBeenCalled();
});
it('renders a pronounced selected video in one hidden-scrollbar row',()=>{
 render(<FeaturedReel items={items} selectedId="2" onSelect={()=>{}} renderSelected={item=><span>Playing {item.title}</span>}/>);
 expect(screen.getByText('Playing Item 2')).toBeTruthy();
 expect(document.querySelectorAll('[data-carousel-copy]')).toHaveLength(3);
 expect(document.querySelectorAll('[data-carousel-active="true"]')).toHaveLength(1);
 const css=readFileSync('src/components/Media/Featured.module.css','utf8');
 expect(css).toMatch(/\.reel\s*\{[^}]*display:\s*flex[^}]*align-items:\s*center/);
 expect(css).toMatch(/\.reelViewport\s*\{[^}]*overflow-x:\s*hidden/);
 expect(css).toMatch(/--active-scale:\s*2/);
 expect(css).toMatch(/\.tileOverlay\s*\{[^}]*width:\s*calc\(var\(--tile-width\)\s*\*\s*var\(--active-scale\)\)/);
 expect(css.match(/\.tileOverlay\s*\{([^}]*)\}/)[1]).not.toMatch(/scale\(/);
 expect(css).toMatch(/\.activeSlot\s*\{[^}]*margin-inline:\s*var\(--active-gutter\)/);
 expect(css).toMatch(/scrollbar-width:\s*none/);
});


it('uses a near-black carousel surface while retaining visible shadow depth',()=>{
 const css=readFileSync('src/components/Media/Featured.module.css','utf8');
 const screenRule=css.match(/\.screen\s*\{([^}]*)\}/)[1];
 expect(screenRule).toMatch(/background:\s*#030303/i);
 expect(css).toMatch(/\.reelViewport\s*\{[^}]*padding:\s*calc\(clamp\(68px,7\.5vw,108px\) \+ 12px\) 0/);
 expect(screenRule).toMatch(/width:\s*calc\(100% \+ var\(--home-gutter\) \* 2\)/);
 expect(screenRule).toMatch(/margin-top:\s*-48px/);
 expect(screenRule).toMatch(/box-shadow:\s*inset/);
 expect(css).toMatch(/\.tileActive\s*\{[^}]*box-shadow:/);
 expect(css).toMatch(/\.singleSlot\s*\{[^}]*aspect-ratio:\s*16\/9/);
 expect(css).toMatch(/@media\(max-width:900px\)[\s\S]*\.player\s*\{[^}]*min-height:\s*200px/);
 expect(css).toMatch(/@media\(max-width:340px\)[\s\S]*--tile-width:\s*calc\(\(100vw - 28px\) \/ 1\.75\)/);
 expect(css).toMatch(/@media\(max-width:340px\)[\s\S]*\.reelViewport\s*\{[^}]*padding:\s*66px 0/);
});

it('places the last item before the first and loops forward through a duplicate strip',async()=>{
 const onSelect=vi.fn();
 render(<FeaturedReel items={items} selectedId="1" onSelect={onSelect} renderSelected={item=><span>Playing {item.title}</span>}/>);
 const copies=document.querySelectorAll('[data-carousel-copy]');
 expect(copies).toHaveLength(3);
 expect(copies[1].querySelectorAll('[data-carousel-id]')[2].getAttribute('data-carousel-id')).toBe('3');
 expect(copies[1].querySelectorAll('[data-carousel-id]')[0].getAttribute('data-carousel-id')).toBe('1');
 fireEvent.click(screen.getByRole('button',{name:'Select Item 3'}));
 expect(onSelect).toHaveBeenCalledWith('3',expect.objectContaining({direction:-1}));
});
it('exposes one nearest preview for each neighboring identity across copy boundaries',()=>{
 render(<FeaturedReel items={items} selectedId="1" onSelect={()=>{}}/>);
 expect(screen.getAllByRole('button',{name:'Select Item 3'})).toHaveLength(1);
 expect(screen.getAllByRole('button',{name:'Select Item 2'})).toHaveLength(1);
 expect(screen.queryByRole('button',{name:'Select Item 1'})).toBeNull();
 expect(screen.getByRole('button',{name:'Select Item 3'}).closest('[data-carousel-copy]').dataset.carouselCopy).toBe('0');
});
it('renders the selected identity immediately without remounting its iframe when the list reorders',()=>{
 const renderSelected=item=><iframe title={`Player ${item.id}`}/>;
 const view=render(<FeaturedReel items={items} selectedId="2" onSelect={()=>{}} renderSelected={renderSelected}/>);
 const frame=screen.getByTitle('Player 2');
 view.rerender(<FeaturedReel items={[items[1],items[0],items[2]]} selectedId="2" onSelect={()=>{}} renderSelected={renderSelected}/>);
 const active=document.querySelectorAll('[data-carousel-active="true"]');
 expect(active).toHaveLength(1);expect(active[0].getAttribute('data-carousel-id')).toBe('2');
 expect(screen.getByTitle('Player 2')).toBe(frame);
});
it('re-centers a still-matching selection when a shrink leaves its virtual copy outside the rendered loop',async()=>{
 const four=[...items,{id:'4',title:'Item 4',durationSeconds:60}];
 const view=render(<FeaturedReel items={four} selectedId="3" onSelect={()=>{}}/>);
 view.rerender(<FeaturedReel items={items.slice(0,2)} selectedId="1" onSelect={()=>{}}/>);
 await act(async()=>{});
 const active=document.querySelectorAll('[data-carousel-active="true"]');
 expect(active).toHaveLength(1);expect(active[0].getAttribute('data-carousel-id')).toBe('1');
});
it('normalizes a vanished selection and hides preview navigation after shrinking to one',()=>{
 const onSelect=vi.fn();const {rerender}=render(<FeaturedReel items={items} selectedId="3" onSelect={onSelect}/>);
 rerender(<FeaturedReel items={items.slice(0,2)} selectedId="3" onSelect={onSelect}/>);fireEvent.click(screen.getByRole('button',{name:'Select Item 2'}));expect(onSelect).toHaveBeenCalledWith('2',expect.objectContaining({userInitiated:true}));
 rerender(<FeaturedReel items={items.slice(0,1)} selectedId="3" onSelect={onSelect}/>);expect(screen.queryByRole('button')).toBeNull();expect(screen.getByLabelText('Featured video')).toBeTruthy();
});

it('keeps all navigation and pause controls off the carousel',()=>{
 render(<FeaturedReel items={items} selectedId="2" onSelect={()=>{}} renderSelected={item=><div data-testid="video">Playing {item.title}</div>}/>);
 expect(screen.queryByLabelText('Video navigation')).toBeNull();
 expect(screen.queryByRole('button',{name:'Prev'})).toBeNull();
 expect(screen.queryByRole('button',{name:'Next'})).toBeNull();
 expect(screen.queryByRole('button',{name:/Pause carousel|Resume carousel/})).toBeNull();
 expect(screen.queryByText('2 / 3')).toBeNull();
});

it('re-centers the active video when the carousel viewport resizes',async()=>{
 let viewportWidth=600;
 Object.defineProperty(HTMLElement.prototype,'clientWidth',{configurable:true,get(){return this.className?.includes?.('reelViewport')?viewportWidth:0;}});
 Object.defineProperty(HTMLElement.prototype,'offsetWidth',{configurable:true,get(){return this.hasAttribute?.('data-carousel-slot')?300:0;}});
 Object.defineProperty(HTMLElement.prototype,'offsetLeft',{configurable:true,get(){return this.hasAttribute?.('data-carousel-slot')?500:0;}});
 render(<FeaturedReel items={items} selectedId="2" onSelect={()=>{}}/>);
 expect(screen.getByLabelText('Featured videos').firstElementChild.style.transform).toBe('translate3d(-350px, 0, 0)');
 viewportWidth=390;
 await act(async()=>window.dispatchEvent(new Event('resize')));
 expect(screen.getByLabelText('Featured videos').firstElementChild.style.transform).toBe('translate3d(-455px, 0, 0)');
});

it('preserves the active iframe through boundary normalization and list-size changes',async()=>{
 vi.useFakeTimers();
 function Harness({currentItems=items.slice(0,2)}){const [selected,setSelected]=useState('1');return <FeaturedReel items={currentItems} selectedId={selected} onSelect={setSelected} renderSelected={item=><iframe title={`Player ${item.id}`}/>}/>;}
 const view=render(<Harness/>);
 fireEvent.click(screen.getByRole('button',{name:'Select Item 2'}));
 const frame=screen.getByTitle('Player 2');
 await act(async()=>vi.advanceTimersByTimeAsync(700));
 expect(screen.getByTitle('Player 2')).toBe(frame);
 view.rerender(<Harness currentItems={items}/>);
 expect(screen.getByTitle('Player 2')).toBe(frame);
 view.rerender(<Harness currentItems={[items[1]]}/>);
 expect(screen.getByTitle('Player 2')).toBe(frame);
 expect(screen.queryByRole('button',{name:'Select Item 2'})).toBeNull();
 view.rerender(<Harness currentItems={items.slice(0,2)}/>);
 expect(screen.getByTitle('Player 2')).toBe(frame);
});

it('moves keyboard focus to the stable active card after preview selection',async()=>{
 function Harness(){const [selected,setSelected]=useState('1');return <FeaturedReel items={items} selectedId={selected} onSelect={setSelected} renderSelected={item=><iframe title={`Player ${item.id}`}/>}/>;}
 render(<Harness/>);
 const preview=screen.getByRole('button',{name:'Select Item 2'});
 preview.focus();
 fireEvent.click(preview,{detail:0});
 await act(async()=>new Promise(resolve=>setTimeout(resolve,30)));
 expect(document.activeElement).toBe(document.querySelector('[data-carousel-active="true"]'));
});

it('reports embedded-player focus after the browser window yields focus to the iframe',async()=>{
 vi.useFakeTimers();
 const onPlaybackInteraction=vi.fn();
 render(<FeaturedReel items={items} selectedId="2" onSelect={()=>{}} onPlaybackInteraction={onPlaybackInteraction} renderSelected={item=><iframe title={`Player ${item.id}`}/>}/>);
 screen.getByTitle('Player 2').focus();
 window.dispatchEvent(new Event('blur'));
 await act(async()=>vi.advanceTimersByTimeAsync(0));
 expect(onPlaybackInteraction).toHaveBeenCalledTimes(1);
});
