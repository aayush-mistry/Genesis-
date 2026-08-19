import { render, screen } from '@testing-library/react';
import { WorldStats } from '../WorldStats';
import { World, Region, City, District, Building } from '@genesis/shared';

describe('WorldStats', () => {
  it('renders correct stats', () => {
    const mockWorld = { id: '1', name: 'Test', currentTick: 100 } as World;
    const mockRegions = [{ id: 'r1' }, { id: 'r2' }] as Region[];
    const mockCities = [{ id: 'c1' }] as City[];
    const mockDistricts = [{ id: 'd1' }, { id: 'd2' }, { id: 'd3' }] as District[];
    const mockBuildings = [{ id: 'b1' }, { id: 'b2' }] as Building[];

    render(
      <WorldStats
        world={mockWorld}
        regions={mockRegions}
        cities={mockCities}
        districts={mockDistricts}
        buildings={mockBuildings}
      />
    );

    // Check for rendered values based on the HTML output
    expect(screen.getByText('Regions: 2')).toBeInTheDocument();
    expect(screen.getByText('Cities: 1')).toBeInTheDocument();
    expect(screen.getByText('Districts: 3')).toBeInTheDocument();
    expect(screen.getByText('Buildings: 2')).toBeInTheDocument();
  });
});
