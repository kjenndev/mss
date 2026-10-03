// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ProfileAvatar from './components/User/ProfileAvatar';
vi.mock('./config',()=>({getImageUrl:path=>path ? `https://fixture.invalid${path}` : ''}));
it('resolves saved uploads against the configured backend and retries replacement after a broken image',()=>{
 const view=render(<ProfileAvatar name="Listener" src="/uploads/first.webp"/>);
 expect(screen.getByRole('img')).toHaveAttribute('src','https://fixture.invalid/uploads/first.webp');
 fireEvent.error(screen.getByRole('img'));expect(screen.getByText('L')).toBeTruthy();
 view.rerender(<ProfileAvatar name="Listener" src="/uploads/second.webp"/>);
 expect(screen.getByRole('img')).toHaveAttribute('src','https://fixture.invalid/uploads/second.webp');
 view.unmount();
});

it('keeps initials legible on dark public comment backgrounds',()=>{
 const view=render(<ProfileAvatar name="Listener"/>);
 expect(screen.getByText('L')).toHaveStyle({color:'rgb(144, 202, 249)'});view.unmount();
});
