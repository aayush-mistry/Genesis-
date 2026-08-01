import { ClimateType, ClimateProfile } from '@genesis/shared';

export class ClimateManager {
  private profiles: Map<ClimateType, ClimateProfile>;

  constructor() {
    this.profiles = new Map();
    this.initializeProfiles();
  }

  private initializeProfiles(): void {
    const tropical: ClimateProfile = {
      type: 'Tropical',
      averageTemperature: 28,
      temperatureRange: 5,
      humidityRange: [70, 95],
      rainfallProbability: 0.6,
      windCharacteristics: 1.2,
      seasonalTemperatureOffsets: {
        Spring: 1,
        Summer: 2,
        Autumn: 0,
        Winter: -1
      },
      metadata: {}
    };

    const temperate: ClimateProfile = {
      type: 'Temperate',
      averageTemperature: 15,
      temperatureRange: 15,
      humidityRange: [40, 70],
      rainfallProbability: 0.3,
      windCharacteristics: 1.0,
      seasonalTemperatureOffsets: {
        Spring: 5,
        Summer: 12,
        Autumn: 2,
        Winter: -10
      },
      metadata: {}
    };

    const desert: ClimateProfile = {
      type: 'Desert',
      averageTemperature: 30,
      temperatureRange: 20,
      humidityRange: [10, 30],
      rainfallProbability: 0.05,
      windCharacteristics: 1.5,
      seasonalTemperatureOffsets: {
        Spring: 5,
        Summer: 15,
        Autumn: 2,
        Winter: -15
      },
      metadata: {}
    };

    const coastal: ClimateProfile = {
      type: 'Coastal',
      averageTemperature: 18,
      temperatureRange: 8,
      humidityRange: [60, 85],
      rainfallProbability: 0.4,
      windCharacteristics: 1.8,
      seasonalTemperatureOffsets: {
        Spring: 2,
        Summer: 6,
        Autumn: 3,
        Winter: -4
      },
      metadata: {}
    };

    const mountain: ClimateProfile = {
      type: 'Mountain',
      averageTemperature: 5,
      temperatureRange: 12,
      humidityRange: [30, 60],
      rainfallProbability: 0.35,
      windCharacteristics: 2.0,
      seasonalTemperatureOffsets: {
        Spring: 4,
        Summer: 10,
        Autumn: -2,
        Winter: -12
      },
      metadata: {}
    };

    const arctic: ClimateProfile = {
      type: 'Arctic',
      averageTemperature: -15,
      temperatureRange: 10,
      humidityRange: [20, 50],
      rainfallProbability: 0.2,
      windCharacteristics: 2.5,
      seasonalTemperatureOffsets: {
        Spring: 5,
        Summer: 15,
        Autumn: -5,
        Winter: -20
      },
      metadata: {}
    };

    const semiArid: ClimateProfile = {
      type: 'Semi-Arid',
      averageTemperature: 22,
      temperatureRange: 15,
      humidityRange: [20, 45],
      rainfallProbability: 0.15,
      windCharacteristics: 1.3,
      seasonalTemperatureOffsets: {
        Spring: 4,
        Summer: 10,
        Autumn: 2,
        Winter: -8
      },
      metadata: {}
    };

    const humidContinental: ClimateProfile = {
      type: 'Humid Continental',
      averageTemperature: 12,
      temperatureRange: 18,
      humidityRange: [50, 80],
      rainfallProbability: 0.45,
      windCharacteristics: 1.1,
      seasonalTemperatureOffsets: {
        Spring: 6,
        Summer: 14,
        Autumn: 2,
        Winter: -14
      },
      metadata: {}
    };

    this.profiles.set('Tropical', tropical);
    this.profiles.set('Temperate', temperate);
    this.profiles.set('Desert', desert);
    this.profiles.set('Coastal', coastal);
    this.profiles.set('Mountain', mountain);
    this.profiles.set('Arctic', arctic);
    this.profiles.set('Semi-Arid', semiArid);
    this.profiles.set('Humid Continental', humidContinental);
  }

  public getProfile(type: ClimateType): ClimateProfile | undefined {
    return this.profiles.get(type);
  }

  public getAllProfiles(): ClimateProfile[] {
    return Array.from(this.profiles.values());
  }
}
