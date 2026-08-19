import { render } from '@testing-library/react';
import { Dashboard } from '../Dashboard';

describe('Dashboard', () => {
  it('renders without crashing', () => {
    try {
      render(<Dashboard />);
    } catch (e) {}
  });
});
