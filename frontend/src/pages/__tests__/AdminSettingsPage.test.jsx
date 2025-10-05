import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import AdminSettingsPage from '../AdminSettingsPage.jsx';
import { financeTheme } from '../../theme/financeTheme';
import { useAuth } from '../../contexts/AuthContext';

jest.mock('../../contexts/AuthContext', () => ({
  useAuth: jest.fn(),
}));

const renderWithProviders = (ui) => (
  render(
    <ThemeProvider theme={financeTheme}>
      {ui}
    </ThemeProvider>
  )
);

describe('AdminSettingsPage', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('blocks non-admin users from accessing settings', () => {
    useAuth.mockReturnValue({ user: { getIdToken: jest.fn() }, claims: { role: 'member' } });

    renderWithProviders(<AdminSettingsPage />);

    expect(screen.getByText(/need admin privileges/i)).toBeInTheDocument();
  });

  it('submits teammate code allocation requests', async () => {
    useAuth.mockReturnValue({
      user: { getIdToken: jest.fn().mockResolvedValue('token-123') },
      claims: { role: 'admin' },
    });

    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue([]),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({ code: 'ASTR-EDITOR-00001' }),
      });

    renderWithProviders(<AdminSettingsPage />);

    const orgCodeField = screen.getByLabelText(/org code/i);
    fireEvent.change(orgCodeField, { target: { name: 'orgCode', value: 'astr' } });

    const teammateUidField = screen.getByLabelText(/teammate uid/i);
    fireEvent.change(teammateUidField, { target: { name: 'teammateUid', value: 'uid-999' } });

    const submitButton = screen.getByRole('button', { name: /generate code/i });
    fireEvent.click(submitButton);

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));

    expect(global.fetch).toHaveBeenLastCalledWith(
      '/api/team/codes',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer token-123' }),
      })
    );

  const successAlert = await screen.findByRole('alert');
  expect(within(successAlert).getByText(/ASTR-EDITOR-00001/)).toBeInTheDocument();

    const historyList = screen.getByRole('list', { name: /recent code allocations/i });
    expect(within(historyList).getByText(/ASTR-EDITOR-00001/)).toBeInTheDocument();
  });
});
