import { SpatialSnapshot } from '../types/spatial.types';

const API_BASE = '/api/v1';

export const spatialApi = {
  getSnapshot: async (): Promise<SpatialSnapshot> => {
    const response = await fetch(`${API_BASE}/world/spatial`);
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('World not initialized');
      }
      throw new Error(`API Error: ${response.status}`);
    }
    return response.json();
  }
};
