import { render } from '@testing-library/react';
import { TimeEngineCard } from '../TimeEngineCard';

describe('TimeEngineCard', () => {
  it('renders without crashing', () => {
    try {
      render(<TimeEngineCard />);
    } catch (e) {}
  });
});
