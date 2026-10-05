// @vitest-environment jsdom
import {it,expect,vi,afterEach} from 'vitest';
import {render,screen,cleanup,fireEvent} from '@testing-library/react';
import FeaturedReel from './components/Media/FeaturedReel';
const items=[1,2,3].map(i=>({id:String(i),title:'Item '+i,durationSeconds:60}));
afterEach(()=>{cleanup();vi.restoreAllMocks();});
it('keeps an arrow-selected thumbnail inside its horizontal strip without scrolling the page',()=>{
 const scroll=vi.spyOn(window,'scrollTo').mockImplementation(()=>{});
 vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(){return this.getAttribute('aria-label')==='Select Item 3'?{left:400,right:560}: {left:0,right:300};});
 render(<FeaturedReel items={items} selectedId="3" onSelect={()=>{}}/>);
 const strip=screen.getByLabelText('Featured videos');expect(strip.scrollLeft).toBeGreaterThanOrEqual(260);expect(scroll).not.toHaveBeenCalled();
});
it('normalizes a vanished selection and hides all navigation after shrinking to one',()=>{
 const onSelect=vi.fn();const {rerender}=render(<FeaturedReel items={items} selectedId="3" onSelect={onSelect}/>);
 rerender(<FeaturedReel items={items.slice(0,2)} selectedId="3" onSelect={onSelect}/>);expect(screen.getByText('1 / 2')).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'Next'}));expect(onSelect).toHaveBeenCalledWith('2');
 rerender(<FeaturedReel items={items.slice(0,1)} selectedId="3" onSelect={onSelect}/>);expect(screen.queryByRole('button')).toBeNull();
});
