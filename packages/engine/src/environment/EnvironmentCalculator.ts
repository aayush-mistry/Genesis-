import { ClimateProfile, EnvironmentalState, WeatherData, SeasonType, DayPhaseType } from '@genesis/shared';

export class EnvironmentCalculator {
  
  public calculateCurrentState(
    regionId: string,
    climate: ClimateProfile,
    weather: WeatherData,
    season: SeasonType,
    dayPhase: DayPhaseType
  ): EnvironmentalState {
    
    // 1. Temperature Calculation
    // Base + Seasonal Offset + Day Phase Offset + Weather Offset + Noise
    let temp = climate.averageTemperature + climate.seasonalTemperatureOffsets[season];
    
    const dayPhaseTempOffset: Record<DayPhaseType, number> = {
      'Night': - (climate.temperatureRange * 0.4),
      'Dawn': - (climate.temperatureRange * 0.2),
      'Morning': 0,
      'Afternoon': + (climate.temperatureRange * 0.4),
      'Evening': + (climate.temperatureRange * 0.1)
    };
    temp += dayPhaseTempOffset[dayPhase];

    const weatherTempOffset: Record<string, number> = {
      'Sunny': 2,
      'Cloudy': -1,
      'Fog': -2,
      'Light Rain': -3,
      'Rain': -5,
      'Storm': -8,
      'Light Snow': -3,
      'Heavy Snow': -6
    };
    temp += weatherTempOffset[weather.currentType] || 0;
    
    // Random noise (-1 to +1)
    temp += (Math.random() * 2) - 1;

    // 2. Humidity Calculation
    // Base Random within Climate Range + Weather Effect
    let humidity = this.randomInRange(climate.humidityRange[0], climate.humidityRange[1]);
    if (['Rain', 'Light Rain', 'Storm'].includes(weather.currentType)) {
      humidity = Math.min(100, humidity + 20); // Rain increases humidity
    } else if (weather.currentType === 'Fog') {
      humidity = Math.min(100, humidity + 30);
    } else if (weather.currentType === 'Sunny') {
      humidity = Math.max(0, humidity - 10);
    }
    
    // 3. Wind Speed (km/h)
    let windSpeed = 10 * climate.windCharacteristics;
    if (weather.currentType === 'Storm') windSpeed *= 3;
    if (weather.currentType === 'Sunny') windSpeed *= 0.5;
    windSpeed += (Math.random() * 5); // noise

    // 4. Cloud Coverage (0-100%)
    let cloudCoverage = 0;
    switch(weather.currentType) {
      case 'Sunny': cloudCoverage = this.randomInRange(0, 20); break;
      case 'Cloudy': cloudCoverage = this.randomInRange(50, 90); break;
      case 'Light Rain': cloudCoverage = this.randomInRange(60, 100); break;
      case 'Rain': cloudCoverage = 100; break;
      case 'Storm': cloudCoverage = 100; break;
      case 'Fog': cloudCoverage = 100; break;
      case 'Light Snow': cloudCoverage = this.randomInRange(60, 100); break;
      case 'Heavy Snow': cloudCoverage = 100; break;
    }

    // 5. Visibility (km, max ~20)
    let visibility = 20;
    if (weather.currentType === 'Fog') visibility = 0.5;
    else if (weather.currentType === 'Storm' || weather.currentType === 'Heavy Snow') visibility = 2;
    else if (weather.currentType === 'Rain') visibility = 5;
    else if (weather.currentType === 'Light Rain' || weather.currentType === 'Light Snow') visibility = 10;
    if (dayPhase === 'Night') visibility *= 0.3; // Harder to see at night

    // 6. UV Index (0-11+)
    let uvIndex = 0;
    if (dayPhase === 'Morning' || dayPhase === 'Afternoon') {
      uvIndex = season === 'Summer' ? 8 : 4;
      uvIndex *= (1 - (cloudCoverage / 100)); // Clouds block UV
    }
    
    // 7. Air Pressure (hPa, standard 1013)
    let airPressure = 1013;
    if (weather.currentType === 'Storm') airPressure -= 30; // Low pressure brings storms
    else if (weather.currentType === 'Rain') airPressure -= 15;
    else if (weather.currentType === 'Sunny') airPressure += 10; // High pressure brings clear skies

    // 8. Feels Like (simple heat index / wind chill approximation)
    let feelsLike = temp;
    if (temp > 25 && humidity > 60) {
      feelsLike += (humidity - 60) * 0.1; // Sticky
    } else if (temp < 10 && windSpeed > 10) {
      feelsLike -= (windSpeed - 10) * 0.2; // Wind chill
    }

    return {
      regionId,
      temperature: Number(temp.toFixed(1)),
      feelsLikeTemperature: Number(feelsLike.toFixed(1)),
      humidity: Number(humidity.toFixed(1)),
      windSpeed: Number(windSpeed.toFixed(1)),
      visibility: Number(visibility.toFixed(1)),
      cloudCoverage: Number(cloudCoverage.toFixed(1)),
      uvIndex: Number(uvIndex.toFixed(1)),
      airPressure: Number(airPressure.toFixed(1))
    };
  }

  private randomInRange(min: number, max: number): number {
    return Math.random() * (max - min) + min;
  }
}
