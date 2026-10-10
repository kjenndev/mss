// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import ArtistList from './components/Artist/Artist.Component.List';
import * as api from './Data.Helper.Api';
vi.mock('./Data.Helper.Api');
import styles from './components/Artist/Artist.Component.List.module.css';
import {readFileSync} from 'node:fs';
const cardCss=readFileSync('src/components/Artist/Artist.Component.List.module.css','utf8');
it('stretches the native profile link over the card with independent provider and Edit controls',async()=>{
 api.GetAllArtists.mockResolvedValue(response([{...artists[1],soundcloud:'https://soundcloud.com/fixture'}]));
 api.CanEditArtist.mockReturnValue(true);
 const {container}=render(<ArtistList/>);
 const card=(await screen.findByRole('heading',{name:'Alpha Test'})).closest('article');
 expect(within(card).queryByText(/^Details$|^View details$|^View Profile$/i)).toBeNull();
 const details=within(card).getByRole('link',{name:'Alpha Test'});
 expect(within(card).getByRole('heading',{name:'Alpha Test'}).contains(details)).toBe(true);
 const edit=within(card).getByRole('link',{name:'Edit'});
 expect(details.classList.contains(styles.cardLink)).toBe(true);
 expect(edit.classList.contains(styles.secondaryAction)).toBe(true);
 const provider=within(card).getByRole('link',{name:'SoundCloud'});
 expect(provider.classList.contains(styles.secondaryAction)).toBe(true);
 expect(provider.getAttribute('href')).toBe('https://soundcloud.com/fixture');
 expect(provider.getAttribute('target')).toBe('_blank');
 expect(provider.getAttribute('rel')).toBe('noopener noreferrer');
 expect(details.getAttribute('href')).toBe('/artists/1');
 expect(edit.getAttribute('href')).toBe('/artists/1/update');
 expect(container.querySelector('a a')).toBeNull();
 expect(card.hasAttribute('tabindex')).toBe(false);
 details.focus();expect(document.activeElement).toBe(details);
 for(const modifiers of [{ctrlKey:true},{metaKey:true},{shiftKey:true},{button:1}]) {
  const click=new MouseEvent('click',{bubbles:true,cancelable:true,...modifiers});
  let intercepted;
  const observe=event=>{intercepted=event.defaultPrevented;event.preventDefault();};
  document.addEventListener('click',observe,{once:true});
  details.dispatchEvent(click);expect(intercepted).toBe(false);
 }
 const style=document.createElement('style');style.textContent=cardCss;document.head.append(style);
 try {
  const rule=selector=>Array.from(style.sheet.cssRules).find(rule=>rule.selectorText===selector)?.style;
  expect(rule('.artist')?.position).toBe('relative');
  expect(rule('.artist')?.isolation).toBe('isolate');
  expect(rule('.cardLink::after')?.position).toBe('absolute');
  expect(rule('.cardLink::after')?.inset).toBe('0px');
  expect(rule('.cardLink::after')?.zIndex).toBe('1');
  expect(rule('.secondaryAction')?.position).toBe('relative');
  expect(rule('.secondaryAction')?.zIndex).toBe('2');
  expect(rule('.cardLink:focus-visible::after')?.outline).toContain('2px solid');
 } finally {style.remove();}
});

const response = artists => ({ ok: true, json: async () => ({ artists }) });
const artists = [
  { id: 2, user_id: 20, name: 'Zulu Test', location: 'Detroit', profile_picture: '/uploads/fixture.jpg' },
  { id: 1, user_id: 10, name: 'Alpha Test', location: 'Chicago' },
];
beforeEach(() => { vi.resetAllMocks(); api.GetAllArtists.mockResolvedValue(response(artists)); });
afterEach(cleanup);
it('renders the portrait directory with semantic identity and existing owner actions', async () => {
  api.CanEditArtist.mockImplementation((id, owner) => id === 1 && owner === 10);
  const { container } = render(<ArtistList />);
  expect(await screen.findByRole('heading', { level: 1, name: 'Artists' })).toBeTruthy();
  const cards = await screen.findAllByRole('article');
  expect(cards).toHaveLength(2);
  expect(within(cards[0]).getByRole('heading', { name: 'Alpha Test' })).toBeTruthy();
  expect(screen.getByRole('img', { name: 'Zulu Test' }).getAttribute('src')).toBe('/uploads/fixture.jpg');
  expect(screen.getByText('AT')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Edit' }).getAttribute('href')).toBe('/artists/1/update');
  expect(cards.map(card => within(card).getByRole('link', { name: within(card).getByRole('heading').textContent }).getAttribute('href'))).toEqual(['/artists/1', '/artists/2']);
  expect(container.querySelector('.MuiPaper-root')).toBeNull();
});

it('searches names and locations case-insensitively, sorts without mutating records, and counts results', async () => {
  render(<ArtistList />);
  await screen.findByText('Alpha Test');
  const names = () => screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent);
  expect(names()).toEqual(['Alpha Test', 'Zulu Test']);
  expect(screen.getByRole('status').textContent).toBe('2 artists');
  fireEvent.change(screen.getByRole('combobox', { name: 'Sort artists' }), { target: { value: 'za' } });
  expect(names()).toEqual(['Zulu Test', 'Alpha Test']);
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search artists' }), { target: { value: '  cHiCaGo  ' } });
  expect(names()).toEqual(['Alpha Test']);
  expect(screen.getByRole('status').textContent).toBe('1 of 2 artists');
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'nothing' } });
  expect(screen.getByText('No matching artists. Try another name or location.')).toBeTruthy();
  expect(screen.getByRole('status').textContent).toBe('0 of 2 artists');
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'test' } });
  expect(names()).toEqual(['Zulu Test', 'Alpha Test']);
  expect(artists.map(a => a.id)).toEqual([2, 1]);
});

it('replaces a broken portrait with initials and omits absent location copy', async () => {
  api.GetAllArtists.mockResolvedValue(response([{ ...artists[0], location: null }, { id: 3, name: '  single  ' }]));
  render(<ArtistList />);
  fireEvent.error(await screen.findByRole('img', { name: 'Zulu Test' }));
  expect(screen.queryByRole('img', { name: 'Zulu Test' })).toBeNull();
  expect(screen.getByText('ZT')).toBeTruthy();
  expect(screen.getByText('S')).toBeTruthy();
  expect(screen.queryByText(/Unknown Location|Demo artist|Photo placeholder/i)).toBeNull();
  expect(screen.queryByRole('link', { name: 'Edit' })).toBeNull();
});

it('links only supplied safe provider URLs without inventing provider metadata', async () => {
  api.GetAllArtists.mockResolvedValue(response([
    { id: 1, name: 'Linked Test', soundcloud: 'https://soundcloud.com/fixture', mixcloud: 'https://www.mixcloud.com/fixture/', youtube: 'https://youtube.com/@fixture', twitch: 'fixture_channel' },
    { id: 2, name: 'Unsafe Test', soundcloud: 'javascript:alert(1)', mixcloud: '//evil.test', youtube: 'data:text/html,bad' },
    { id: 3, name: 'Absent Test' },
  ]));
  render(<ArtistList />);
  const cards = await screen.findAllByRole('article');
  const linked = cards.find(card => within(card).queryByText('Linked Test'));
  for (const [name, href] of [['SoundCloud', 'https://soundcloud.com/fixture'], ['Mixcloud', 'https://www.mixcloud.com/fixture/'], ['YouTube', 'https://youtube.com/@fixture'], ['Twitch', 'https://twitch.tv/fixture_channel']]) {
    const link = within(linked).getByRole('link', { name });
    expect(link.getAttribute('href')).toBe(href);
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  }
  for (const card of cards.filter(card => card !== linked)) expect(within(card).getAllByRole('link')).toHaveLength(1);
});

it('distinguishes loading from a successful empty directory', async () => {
  let finish;
  api.GetAllArtists.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  render(<ArtistList />);
  expect(screen.getByRole('status').textContent).toBe('Loading artists…');
  expect(screen.queryByText(/No artists/)).toBeNull();
  finish(response([]));
  expect(await screen.findByText('No artists yet.')).toBeTruthy();
  expect(screen.getByRole('status').textContent).toBe('0 artists');
  expect(screen.queryByText(/No matching/)).toBeNull();
});
it.each(['network', 'http', 'malformed'])('retries %s failures without showing misleading empty state', async failure => {
  if (failure === 'network') api.GetAllArtists.mockRejectedValueOnce(new Error('offline'));
  else api.GetAllArtists.mockResolvedValueOnce(failure === 'http' ? { ok: false } : { ok: true, json: async () => ({ artists: {} }) });
  api.GetAllArtists.mockResolvedValueOnce(response([]));
  render(<ArtistList />);
  fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
  expect(screen.queryByText(/No artists/)).toBeNull();
  expect(await screen.findByText('No artists yet.')).toBeTruthy();
  expect(screen.queryByRole('alert')).toBeNull();
  expect(api.GetAllArtists).toHaveBeenCalledTimes(2);
});

const disabledLabel = 'Disabled artist — visible only to artists and admins';
it('places a focusable non-action disabled icon immediately before Edit with an explanatory tooltip', async () => {
  api.GetAllArtists.mockResolvedValue(response([{ ...artists[1], is_disabled: true }]));
  api.CanEditArtist.mockReturnValue(true);
  render(<ArtistList />);
  const indicator = await screen.findByRole('status', { name: disabledLabel });
  expect(indicator.tagName).toBe('SPAN');
  expect(indicator.tabIndex).toBe(0);
  expect(indicator.textContent).toBe('');
  expect(indicator.nextElementSibling).toBe(screen.getByRole('link', { name: 'Edit' }));
  expect(indicator.closest('a')).toBeNull();
  act(() => indicator.focus());
  expect(document.activeElement).toBe(indicator);
  fireEvent.mouseOver(indicator);
  expect((await screen.findByRole('tooltip')).textContent).toBe(disabledLabel);
});

it.each([true, false])('preserves non-editor status without granting Edit (disabled=%s)', async disabled => {
 api.GetAllArtists.mockResolvedValue(response([{...artists[1],is_disabled:disabled}]));
 api.CanEditArtist.mockReturnValue(false);
 render(<ArtistList/>);
 await screen.findByRole('heading',{name:'Alpha Test'});
 expect(screen.queryByRole('link',{name:'Edit'})).toBeNull();
 expect(Boolean(screen.queryByRole('status',{name:disabledLabel}))).toBe(disabled);
 if(disabled) expect(screen.getByRole('status',{name:disabledLabel}).tabIndex).toBe(0);
});
it('omits status for an enabled editable artist',async()=>{
 api.CanEditArtist.mockReturnValue(true);render(<ArtistList/>);
 await screen.findAllByRole('link',{name:'Edit'});
 expect(screen.queryByRole('status',{name:disabledLabel})).toBeNull();
});
