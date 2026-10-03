// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import * as api from './Data.Helper.Api';
afterEach(() => localStorage.clear());
it('only authenticated artists and admins may create events', () => {
  for (const role of ['user', 'artist', 'admin']) {
    localStorage.setItem('mss-role', role);
    localStorage.removeItem('mss-token');
    expect(api.CanCreateEvent?.()).toBe(false);
    localStorage.setItem('mss-token', 'fixture');
    expect(api.CanCreateEvent()).toBe(role !== 'user');
  }
});
