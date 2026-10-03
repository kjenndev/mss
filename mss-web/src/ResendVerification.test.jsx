// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ResendVerification from './components/Auth/ResendVerification';
import * as api from './Data.Helper.Api';
vi.mock('./Data.Helper.Api');
afterEach(cleanup);
it('resends only on user action with generic pending messaging', async () => {
  api.ResendVerification.mockResolvedValue({
    ok: true,
    status: 202
  });
  render(<MemoryRouter><ResendVerification /></MemoryRouter>);
  expect(api.ResendVerification).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText(/Email address/), {
    target: {
      value: 'person@example.com'
    }
  });
  fireEvent.click(screen.getByRole('button', {
    name: 'Resend verification email'
  }));
  await screen.findByText(/If this address is eligible/);
  expect(api.ResendVerification).toHaveBeenCalledWith({
    email: 'person@example.com'
  });
});
