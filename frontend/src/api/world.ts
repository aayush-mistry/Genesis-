import { World, Region, City, District, Building } from '@genesis/shared';

const BASE_URL = '/api/v1';

export const worldApi = {
  // World
  getWorldStatus: async (): Promise<{ initialized: boolean }> => {
    const res = await fetch(`${BASE_URL}/world/status`);
    if (!res.ok) throw new Error('Failed to fetch world status');
    return res.json();
  },

  getHierarchy: async (): Promise<any> => {
    const res = await fetch(`${BASE_URL}/world/hierarchy`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error('Failed to fetch world hierarchy');
    return res.json();
  },

  getWorld: async (): Promise<World> => {
    const res = await fetch(`${BASE_URL}/world`);
    if (!res.ok) throw new Error('Failed to fetch world');
    return res.json();
  },
  createWorld: async (payload: { name: string; description: string; seed: number }): Promise<World> => {
    const res = await fetch(`${BASE_URL}/world`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Failed to create world');
    return res.json();
  },
  deleteWorld: async (): Promise<{ success: boolean }> => {
    const res = await fetch(`${BASE_URL}/world`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete world');
    return res.json();
  },

  // Regions
  getRegions: async (): Promise<Region[]> => {
    const res = await fetch(`${BASE_URL}/regions`);
    if (!res.ok) throw new Error('Failed to fetch regions');
    return res.json();
  },
  createRegion: async (payload: Omit<Region, 'id' | 'cityIds'>): Promise<Region> => {
    const res = await fetch(`${BASE_URL}/regions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Failed to create region');
    return res.json();
  },

  // Cities
  getCities: async (): Promise<City[]> => {
    const res = await fetch(`${BASE_URL}/cities`);
    if (!res.ok) throw new Error('Failed to fetch cities');
    return res.json();
  },
  createCity: async (payload: Omit<City, 'id' | 'districtIds' | 'districtCount' | 'buildingCount'>): Promise<City> => {
    const res = await fetch(`${BASE_URL}/cities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Failed to create city');
    return res.json();
  },

  // Districts
  getDistricts: async (): Promise<District[]> => {
    const res = await fetch(`${BASE_URL}/districts`);
    if (!res.ok) throw new Error('Failed to fetch districts');
    return res.json();
  },
  createDistrict: async (payload: Omit<District, 'id' | 'buildingIds'>): Promise<District> => {
    const res = await fetch(`${BASE_URL}/districts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Failed to create district');
    return res.json();
  },

  // Buildings
  getBuildings: async (): Promise<Building[]> => {
    const res = await fetch(`${BASE_URL}/buildings`);
    if (!res.ok) throw new Error('Failed to fetch buildings');
    return res.json();
  },
  createBuilding: async (payload: Omit<Building, 'id' | 'roomIds'>): Promise<Building> => {
    const res = await fetch(`${BASE_URL}/buildings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Failed to create building');
    return res.json();
  },
};
