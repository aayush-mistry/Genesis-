import { render } from '@testing-library/react';
import { HierarchyViewer } from '../HierarchyViewer';
import { Region, City, District, Building } from '@genesis/shared';

describe('HierarchyViewer', () => {
  it('renders without crashing', () => {
    const mockRegions = [] as Region[];
    const mockCities = [] as City[];
    const mockDistricts = [] as District[];
    const mockBuildings = [] as Building[];

    render(
      <HierarchyViewer
        regions={mockRegions}
        cities={mockCities}
        districts={mockDistricts}
        buildings={mockBuildings}
      />
    );
  });
});
