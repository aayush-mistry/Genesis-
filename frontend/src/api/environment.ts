const BASE_URL = '/api/v1/environment';

export const environmentApi = {
  getEnvironment: async (): Promise<any> => {
    const response = await fetch(BASE_URL);
    if (!response.ok) throw new Error('Failed to fetch environment');
    return response.json();
  },
  getEnvironmentStatistics: async (): Promise<any> => {
    const response = await fetch(`${BASE_URL}/statistics`);
    if (!response.ok) throw new Error('Failed to fetch environment statistics');
    return response.json();
  },
  getEnvironmentRegions: async (): Promise<any> => {
    const response = await fetch(`${BASE_URL}/regions`);
    if (!response.ok) throw new Error('Failed to fetch environment regions');
    return response.json();
  }
};

export const getEnvironmentStatistics = environmentApi.getEnvironmentStatistics;
export const getEnvironmentRegions = environmentApi.getEnvironmentRegions;
