import { SpatialEntity, SpatialStatistics } from '@genesis/shared';

const BASE_URL = '/api/v1/spatial';

export const spatialApi = {
  getStatistics: async (): Promise<SpatialStatistics> => {
    const res = await fetch(`${BASE_URL}/statistics`);
    if (!res.ok) throw new Error('Failed to fetch spatial statistics');
    return res.json();
  },

  getDistance: async (x1: number, y1: number, x2: number, y2: number): Promise<number> => {
    const res = await fetch(`${BASE_URL}/distance?x1=${x1}&y1=${y1}&x2=${x2}&y2=${y2}`);
    if (!res.ok) throw new Error('Failed to fetch distance');
    const data = await res.json();
    return data.distance;
  },

  getNearby: async (x: number, y: number, radius: number, type?: string, limit?: number): Promise<SpatialEntity[]> => {
    let url = `${BASE_URL}/nearby?x=${x}&y=${y}&radius=${radius}`;
    if (type) url += `&type=${type}`;
    if (limit) url += `&limit=${limit}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch nearby entities');
    const data = await res.json();
    return data.entities;
  },

  getNearest: async (x: number, y: number, type?: string): Promise<SpatialEntity | null> => {
    let url = `${BASE_URL}/nearest?x=${x}&y=${y}`;
    if (type) url += `&type=${type}`;
    const res = await fetch(url);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error('Failed to fetch nearest entity');
    const data = await res.json();
    return data.entity;
  }
};
