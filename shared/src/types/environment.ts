export type SeasonType = 'Spring' | 'Summer' | 'Autumn' | 'Winter';

export type DayPhaseType = 'Night' | 'Dawn' | 'Morning' | 'Afternoon' | 'Evening';

export type ClimateType = 
  | 'Tropical'
  | 'Temperate'
  | 'Desert'
  | 'Coastal'
  | 'Mountain'
  | 'Arctic'
  | 'Semi-Arid'
  | 'Humid Continental';

export type WeatherType = 
  | 'Sunny'
  | 'Cloudy'
  | 'Fog'
  | 'Light Rain'
  | 'Rain'
  | 'Storm'
  | 'Light Snow'
  | 'Heavy Snow';

export interface ClimateProfile {
  type: ClimateType;
  averageTemperature: number;      // Celsius
  temperatureRange: number;        // +/- Celsius variance
  humidityRange: [number, number]; // [min%, max%]
  rainfallProbability: number;     // 0.0 to 1.0
  windCharacteristics: number;     // Base wind speed multiplier
  seasonalTemperatureOffsets: Record<SeasonType, number>;
  metadata: Record<string, unknown>;
}

export interface WeatherData {
  regionId: string;
  currentType: WeatherType;
  durationHours: number;
  timeInCurrentWeather: number;
  frontId?: string; // Optional ID for tracking a weather front moving across regions
}

export interface EnvironmentalState {
  regionId: string;
  temperature: number;      // Celsius
  feelsLikeTemperature: number;
  humidity: number;         // 0-100%
  windSpeed: number;        // km/h
  visibility: number;       // km
  cloudCoverage: number;    // 0-100%
  uvIndex: number;          // 0-11+
  airPressure: number;      // hPa
}
