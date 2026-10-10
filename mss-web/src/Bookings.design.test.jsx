// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
it('uses scoped responsive dark layouts with visible focus and touch targets on both booking pages', () => {
  const path = 'src/components/Bookings/Bookings.module.css';
  expect(existsSync(path)).toBe(true);
  const css = readFileSync(path, 'utf8');
  expect(css).toContain('@media (max-width: 700px)');
  expect(css).toContain('grid-template-columns: 1fr');
  expect(css).toContain(':focus-visible');
  expect(css).toContain('min-height: 44px');
  expect(css).toContain('min-width: 0');
  expect(css).toContain('overflow-wrap: anywhere');
  for (const file of ['Bookings.jsx', 'AdminBookings.jsx']) expect(readFileSync('src/components/Bookings/' + file, 'utf8')).toContain('className={styles.page}');
});
