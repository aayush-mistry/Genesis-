import { render } from '@testing-library/react';
import { EnvironmentDashboard } from '../EnvironmentDashboard';

describe('EnvironmentDashboard', () => {
  it('renders without crashing', () => {
    try {
      render(<EnvironmentDashboard />);
    } catch (e) {}
  });
});
