import React from 'react';
import { render, screen } from '@testing-library/react';
import CountdownChip from '../CountdownChip.jsx';

// Freeze Date.now via jest (react-scripts/jest uses jsdom)
const fixedNow = new Date('2030-01-01T10:00:00.000Z');

beforeAll(() => {
  jest.useFakeTimers();
  jest.setSystemTime(fixedNow);
});

afterAll(() => {
  jest.useRealTimers();
});

test('shows Overdue for past dueAt', () => {
  const past = new Date(fixedNow.getTime() - 3600_000).toISOString();
  render(<CountdownChip dueAt={past} />);
  expect(screen.getByText(/Overdue/i)).toBeInTheDocument();
});

test('shows Due in for future dueAt', () => {
  const future = new Date(fixedNow.getTime() + 2 * 3600_000).toISOString();
  render(<CountdownChip dueAt={future} />);
  expect(screen.getByText(/Due in/i)).toBeInTheDocument();
});
