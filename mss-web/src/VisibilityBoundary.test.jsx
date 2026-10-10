// @vitest-environment jsdom
import React, {useState} from 'react';
import {it,expect,beforeEach} from 'vitest';
import {render,screen,fireEvent,act,cleanup} from '@testing-library/react';
import VisibilityBoundary from './VisibilityBoundary';
function Content(){const [value,setValue]=useState('');return <input aria-label="Selection" value={value} onChange={e=>setValue(e.target.value)}/>;}
beforeEach(()=>{cleanup();localStorage.clear();});
it('clears page/player state on account transitions, not avatar updates or ordinary navigation',()=>{
 localStorage.setItem('mss-token','admin');localStorage.setItem('mss-role','admin');const view=render(<VisibilityBoundary><Content/></VisibilityBoundary>);
 fireEvent.change(screen.getByLabelText('Selection'),{target:{value:'Restricted queue'}});
 act(()=>window.dispatchEvent(new Event('mss-avatar-change')));expect(screen.getByLabelText('Selection').value).toBe('Restricted queue');
 view.rerender(<VisibilityBoundary><Content/></VisibilityBoundary>);expect(screen.getByLabelText('Selection').value).toBe('Restricted queue');
 act(()=>{localStorage.removeItem('mss-token');window.dispatchEvent(new Event('mss-auth-change'));});expect(screen.getByLabelText('Selection').value).toBe('');
 fireEvent.change(screen.getByLabelText('Selection'),{target:{value:'Old role'}});
 act(()=>{localStorage.setItem('mss-role','user');window.dispatchEvent(new Event('mss-role-change'));});expect(screen.getByLabelText('Selection').value).toBe('');
});
