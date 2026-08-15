const BASE_URL = '/api/v1/time';

export const timeApi = {
  getTime: async (): Promise<any> => {
    const res = await fetch(BASE_URL);
    if (!res.ok) throw new Error('Failed to fetch time');
    return res.json();
  }
};
