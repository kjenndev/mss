import { act, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import ArtistName from './components/Artist/ArtistName';

let width = 300;
let resize;
const disconnect = vi.fn();
afterEach(() => { delete document.fonts; vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function geometry() {
  vi.useFakeTimers();
  width = 300;
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback) { resize = callback; }
    observe() {}
    disconnect() { disconnect(); }
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
    const font = parseFloat(this.style.fontSize) || 80;
    return { width: this.style.width === 'min-content' ? Math.max(...this.textContent.split(' ').map(word => word.length)) * font / 2 : width };
  });
  const original = window.getComputedStyle;
  vi.spyOn(window, 'getComputedStyle').mockImplementation(el => {
    const style = original(el);
    Object.defineProperty(style, 'fontSize', { value: el.style.fontSize || '80px' });
    return style;
  });
}
it('shrinks an unbreakable name before splitting and restores size as the column grows', () => {
  geometry();
  const { unmount } = render(<ArtistName name="Interdimensional" />);
  const heading = screen.getByRole('heading', { level: 1, name: 'Interdimensional' });
  expect(parseFloat(heading.style.fontSize)).toBeGreaterThanOrEqual(24);
  expect(parseFloat(heading.style.fontSize)).toBeLessThan(80);
  width = 900;
  act(() => { resize(); vi.runAllTimers(); });
  expect(heading.style.fontSize).toBe('');
  unmount();
  expect(disconnect).toHaveBeenCalled();
});
it('keeps the intended size for multiword names whose individual words fit', () => {
  geometry();
  render(<ArtistName name="Low Tone Club" />);
  expect(screen.getByRole('heading', { name: 'Low Tone Club' }).style.fontSize).toBe('');
});
it('stops shrinking at 24px and recalculates on name changes', () => {
  geometry();
  const { rerender } = render(<ArtistName name={'W'.repeat(90)} />);
  expect(screen.getByRole('heading').style.fontSize).toBe('24px');
  rerender(<ArtistName name="Echo" />);
  expect(screen.getByRole('heading', { name: 'Echo' }).style.fontSize).toBe('');
  expect(document.querySelectorAll('h1')).toHaveLength(1);
});
it('refits after fonts load and cleans font/resize listeners and scheduled work', async () => {
  geometry();
  const fonts = new EventTarget();
  let ready;
  fonts.ready = new Promise(resolve => { ready = resolve; });
  Object.defineProperty(document, 'fonts', { configurable: true, value: fonts });
  const removeFont = vi.spyOn(fonts, 'removeEventListener');
  const removeResize = vi.spyOn(window, 'removeEventListener');
  const { unmount } = render(<ArtistName name="Interdimensional" />);
  width = 900;
  act(() => { fonts.dispatchEvent(new Event('loadingdone')); vi.runAllTimers(); });
  expect(screen.getByRole('heading').style.fontSize).toBe('');
  act(() => { window.dispatchEvent(new Event('resize')); });
  unmount();
  await act(async () => { ready(); await fonts.ready; vi.runAllTimers(); });
  expect(removeFont).toHaveBeenCalledWith('loadingdone', expect.any(Function));
  expect(removeResize).toHaveBeenCalledWith('resize', expect.any(Function));
  expect(document.querySelectorAll('h1')).toHaveLength(0);
});
