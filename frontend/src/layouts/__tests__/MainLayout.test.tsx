import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import MainLayout from '../MainLayout';

describe('MainLayout', () => {
  it('renders Outlet content', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<MainLayout />}>
            <Route index element={<div data-testid="outlet-content">Test Content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );
    
    expect(screen.getByTestId('outlet-content')).toBeInTheDocument();
    expect(screen.getByText('Test Content')).toBeInTheDocument();
  });
});
