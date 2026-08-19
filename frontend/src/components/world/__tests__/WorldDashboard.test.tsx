import { render, screen, waitFor } from '@testing-library/react';
import { WorldDashboard } from '../WorldDashboard';
import { worldApi } from '../../../api/world';
import { vi } from 'vitest';

vi.mock('../../../api/world', () => ({
  worldApi: {
    getWorldStatus: vi.fn(),
    getWorld: vi.fn(),
    getRegions: vi.fn(),
    getCities: vi.fn(),
    getDistricts: vi.fn(),
    getBuildings: vi.fn(),
  }
}));

// Mock subcomponents
vi.mock('../WorldStats', () => ({ WorldStats: () => <div data-testid="world-stats" /> }));
vi.mock('../HierarchyViewer', () => ({ HierarchyViewer: () => <div data-testid="hierarchy-viewer" /> }));

describe('WorldDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state initially', () => {
    (worldApi.getWorldStatus as any).mockImplementation(() => new Promise(() => {})); // pending promise
    render(<WorldDashboard />);
    expect(screen.getByText('Loading world data...')).toBeInTheDocument();
  });

  it('renders "No World Initialized" when uninitialized', async () => {
    (worldApi.getWorldStatus as any).mockResolvedValue({ initialized: false });
    
    render(<WorldDashboard />);
    
    await waitFor(() => {
      expect(screen.getByText('No World Initialized')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Initialize World/i })).toBeInTheDocument();
    });
  });

  it('renders world data when initialized', async () => {
    (worldApi.getWorldStatus as any).mockResolvedValue({ initialized: true });
    (worldApi.getWorld as any).mockResolvedValue({ id: '1', name: 'Test World' });
    (worldApi.getRegions as any).mockResolvedValue([]);
    (worldApi.getCities as any).mockResolvedValue([]);
    (worldApi.getDistricts as any).mockResolvedValue([]);
    (worldApi.getBuildings as any).mockResolvedValue([]);

    render(<WorldDashboard />);

    await waitFor(() => {
      expect(screen.getByTestId('world-stats')).toBeInTheDocument();
      expect(screen.getByTestId('hierarchy-viewer')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Destroy World/i })).toBeInTheDocument();
    });
  });
});
