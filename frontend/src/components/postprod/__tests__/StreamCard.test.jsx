import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import StreamCard from '../StreamCard.jsx';

function renderCard({ isAdmin = false, isLead = false, state = 'ASSIGNED', risk = false } = {}) {
  const refresh = jest.fn();
  const eventId = 'evt1';
  const stream = 'photos';
  const data = {
    state,
    editors: isLead ? [{ uid: 'u1', role: 'LEAD', displayName: 'Lead User' }] : [{ uid: 'u2', role: 'ASSIST', displayName: 'Asst' }],
    risk: { atRisk: !!risk, reason: risk ? 'Tight deadline' : '' },
  };
  const currentUser = { uid: 'u1', roles: isAdmin ? ['admin'] : [] };
  render(<StreamCard eventId={eventId} stream={stream} data={data} currentUser={currentUser} refresh={refresh} />);
  return { refresh };
}

test('shows star on LEAD editor', () => {
  renderCard({ isLead: true });
  expect(screen.getByText(/Lead User/)).toHaveTextContent('★');
});

test('renders admin actions in REVIEW state', () => {
  renderCard({ isAdmin: true, state: 'REVIEW' });
  expect(screen.getByRole('button', { name: /Review/i })).toBeInTheDocument();
});

test('renders Assign Editors for admin when unassigned', () => {
  renderCard({ isAdmin: true, state: 'UNASSIGNED' });
  expect(screen.getByRole('button', { name: /Assign Editors/i })).toBeInTheDocument();
});

test('renders Start for lead in ASSIGNED', () => {
  renderCard({ isLead: true, state: 'ASSIGNED' });
  expect(screen.getByRole('button', { name: /Start/i })).toBeInTheDocument();
});

test('renders Submit Draft for lead in IN_PROGRESS', () => {
  renderCard({ isLead: true, state: 'IN_PROGRESS' });
  expect(screen.getByRole('button', { name: /Submit Draft/i })).toBeInTheDocument();
});

test('shows RiskChip when atRisk', () => {
  renderCard({ risk: true });
  expect(screen.getByText(/At Risk/i)).toBeInTheDocument();
});
