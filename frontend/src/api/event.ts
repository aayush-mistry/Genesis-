const BASE_URL = '/api/v1/events';

export const eventApi = {
  getHistory: async (): Promise<any> => {
    const res = await fetch(`${BASE_URL}/history`);
    if (!res.ok) throw new Error('Failed to fetch event history');
    return res.json();
  }
};
