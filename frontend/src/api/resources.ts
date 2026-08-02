import { Resource, ResourceStatistics } from '@genesis/shared';

const BASE_URL = '/api/v1';

export const resourcesApi = {
  getAllResources: async (): Promise<Resource[]> => {
    const res = await fetch(`${BASE_URL}/resources`);
    if (!res.ok) throw new Error('Failed to fetch resources');
    return res.json();
  },

  getStatistics: async (): Promise<ResourceStatistics> => {
    const res = await fetch(`${BASE_URL}/resources/statistics`);
    if (!res.ok) throw new Error('Failed to fetch resource statistics');
    return res.json();
  },

  getResourcesByRegion: async (regionId: string): Promise<Resource[]> => {
    const res = await fetch(`${BASE_URL}/resources/regions/${regionId}`);
    if (!res.ok) throw new Error('Failed to fetch resources for region');
    return res.json();
  },

  regenerate: async (): Promise<void> => {
    const res = await fetch(`${BASE_URL}/resources/regenerate`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to trigger regeneration');
  }
};
