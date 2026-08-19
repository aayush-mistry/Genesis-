import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Home from '../Home';
import { vi } from 'vitest';

// Mock sub-components
vi.mock('../../components/TimeEngineCard', () => ({
  TimeEngineCard: () => <div data-testid="time-engine-card" />
}));
vi.mock('../../components/EventSchedulerCard', () => ({
  EventSchedulerCard: () => <div data-testid="event-scheduler-card" />
}));

const queryClient = new QueryClient();

describe('Home Page', () => {
  it('renders System Overview and cards', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <Home />
      </QueryClientProvider>
    );

    expect(screen.getByText('System Overview')).toBeInTheDocument();
    expect(screen.getByText('Frontend')).toBeInTheDocument();
    expect(screen.getByText('Backend')).toBeInTheDocument();
    expect(screen.getByText('Database')).toBeInTheDocument();
    expect(screen.getByTestId('time-engine-card')).toBeInTheDocument();
    expect(screen.getByTestId('event-scheduler-card')).toBeInTheDocument();
  });
});
