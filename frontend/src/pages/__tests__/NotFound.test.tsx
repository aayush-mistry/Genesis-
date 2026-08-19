import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import NotFound from '../NotFound';

describe('NotFound Page', () => {
  it('renders 404 and return link', () => {
    render(
      <MemoryRouter>
        <NotFound />
      </MemoryRouter>
    );
    
    expect(screen.getByText('404')).toBeInTheDocument();
    expect(screen.getByText('System Sector Not Found')).toBeInTheDocument();
    
    const link = screen.getByRole('link', { name: /return to core hub/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/');
  });
});
