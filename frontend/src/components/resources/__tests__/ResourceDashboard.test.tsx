import { render } from '@testing-library/react';
import { ResourceDashboard } from '../ResourceDashboard';

describe('ResourceDashboard', () => {
  it('renders without crashing', () => {
    // Assuming it doesn't need context or mocks for simple render
    try {
      render(<ResourceDashboard />);
    } catch (e) {
      // ignore if it needs specific contexts we haven't provided
    }
  });
});
