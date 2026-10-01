const BASE_URL = '/api/v1/time';

export const timeApi = {
  getTime: async (): Promise<any> => {
    const res = await fetch(BASE_URL);
    if (!res.ok) throw new Error('Failed to fetch time');
    return res.json();
  },
  start: async (): Promise<any> => {
    const res = await fetch(`${BASE_URL}/start`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to start simulation');
    return res.json();
  },
  pause: async (): Promise<any> => {
    const res = await fetch(`${BASE_URL}/pause`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to pause simulation');
    return res.json();
  },
  resume: async (): Promise<any> => {
    const res = await fetch(`${BASE_URL}/resume`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to resume simulation');
    return res.json();
  },
  setSpeed: async (speed: number): Promise<any> => {
    const res = await fetch(`${BASE_URL}/speed`, { 
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ speed })
    });
    if (!res.ok) throw new Error('Failed to set simulation speed');
    return res.json();
  }
};
