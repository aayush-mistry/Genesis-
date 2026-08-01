export const getEnvironmentStatistics = async () => {
  const response = await fetch('/api/v1/environment/statistics');
  if (!response.ok) throw new Error('Failed to fetch environment statistics');
  return response.json();
};

export const getEnvironmentRegions = async () => {
  const response = await fetch('/api/v1/environment/regions');
  if (!response.ok) throw new Error('Failed to fetch environment regions');
  return response.json();
};
