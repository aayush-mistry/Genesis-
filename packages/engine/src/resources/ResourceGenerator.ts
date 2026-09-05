import { Resource, ResourceType, ResourceCategory, Region } from '@genesis/shared';
import { SeededRandom } from '../utils/SeededRandom';

export class ResourceGenerator {
  
  /**
   * Deterministically generates initial resources for a region based on its characteristics and the world seed.
   */
  public generateForRegion(region: Region, worldSeed: number): Omit<Resource, 'id' | 'createdAt' | 'updatedAt'>[] {
    const resources: Omit<Resource, 'id' | 'createdAt' | 'updatedAt'>[] = [];
    
    // Create a unique deterministic seed for this specific region using its ID string
    // Simple string hash mixed with worldSeed
    let regionHash = 0;
    for (let i = 0; i < region.id.length; i++) {
      regionHash = ((regionHash << 5) - regionHash) + region.id.charCodeAt(i);
      regionHash |= 0;
    }
    const seed = worldSeed ^ regionHash;
    const rng = new SeededRandom(seed);

    const baseArea = 10000; // Arbitrary base region area
    
    const rawResources = [];

    // Generate Water
    rawResources.push(this.generateWater(region, rng, baseArea));
    
    // Generate Biologicals based on climate
    if (region.climate !== 'Desert' && region.climate !== 'Arctic') {
      rawResources.push(this.generateForests(region, rng, baseArea));
      rawResources.push(this.generateGrasslands(region, rng, baseArea));
      rawResources.push(this.generateWildlife(region, rng, baseArea));
    }
    
    if (region.climate === 'Coastal' || region.climate === 'Tropical' || region.climate === 'Temperate') {
      rawResources.push(this.generateFish(region, rng, baseArea));
    }

    // Generate Minerals (Non-Renewable)
    rawResources.push(this.generateStone(region, rng, baseArea));
    rawResources.push(this.generateIron(region, rng, baseArea));
    rawResources.push(this.generateCopper(region, rng, baseArea));
    rawResources.push(this.generateCoal(region, rng, baseArea));
    rawResources.push(this.generateGold(region, rng, baseArea));
    rawResources.push(this.generateOil(region, rng, baseArea));
    rawResources.push(this.generateNaturalGas(region, rng, baseArea));

    // Generate Potentials
    rawResources.push(this.generateSolarPotential(region, rng, baseArea));
    rawResources.push(this.generateWindPotential(region, rng, baseArea));
    
    rawResources.forEach(res => {
      resources.push({
        ...res,
        coordinates: {
          x: region.coordinates.x + Math.floor(rng.nextFloat(-2000, 2000)),
          y: region.coordinates.y + Math.floor(rng.nextFloat(-2000, 2000))
        },
        radius: Math.floor(rng.nextFloat(50, 500))
      });
    });

    return resources;
  }

  private generateWater(region: Region, rng: SeededRandom, baseArea: number) {
    let multiplier = 1.0;
    if (region.climate === 'Desert') multiplier = 0.1;
    if (region.climate === 'Tropical' || region.climate === 'Coastal') multiplier = 2.0;

    const maxCap = Math.floor(rng.nextFloat(5000000, 15000000) * multiplier); // Cubic meters
    return {
      type: ResourceType.WATER,
      name: 'Water',
      category: ResourceCategory.RENEWABLE,
      unit: 'm³',
      renewable: true,
      regionId: region.id,
      currentAmount: Math.floor(maxCap * rng.nextFloat(0.7, 1.0)),
      maximumAmount: maxCap,
      condition: {
        type: 'Water Quality',
        value: rng.nextFloat(0.5, 1.0)
      },
      naturalRecoveryRate: Math.floor(rng.nextFloat(1000, 5000) * multiplier),
      consumptionRate: null,
      extractionDifficulty: rng.nextFloat(0.1, 0.3)
    };
  }

  private generateForests(region: Region, rng: SeededRandom, baseArea: number) {
    let multiplier = 1.0;
    if (region.climate === 'Tropical') multiplier = 3.0;
    if (region.climate === 'Mountain') multiplier = 1.5;
    if (region.climate === 'Semi-Arid') multiplier = 0.2;

    const maxCap = Math.floor(rng.nextFloat(20000, 80000) * multiplier); // Hectares
    return {
      type: ResourceType.FORESTS,
      name: 'Forests',
      category: ResourceCategory.RENEWABLE,
      unit: 'ha',
      renewable: true,
      regionId: region.id,
      currentAmount: Math.floor(maxCap * rng.nextFloat(0.5, 1.0)),
      maximumAmount: maxCap,
      condition: {
        type: 'Forest Condition',
        value: rng.nextFloat(0.7, 1.0)
      },
      naturalRecoveryRate: Math.floor(rng.nextFloat(5, 20) * multiplier),
      consumptionRate: null,
      extractionDifficulty: rng.nextFloat(0.2, 0.5)
    };
  }

  private generateGrasslands(region: Region, rng: SeededRandom, baseArea: number) {
    let multiplier = 1.0;
    if (region.climate === 'Temperate') multiplier = 2.0;
    if (region.climate === 'Humid Continental') multiplier = 1.8;

    const maxCap = Math.floor(rng.nextFloat(40000, 100000) * multiplier); // Hectares
    return {
      type: ResourceType.GRASSLANDS,
      name: 'Grasslands',
      category: ResourceCategory.RENEWABLE,
      unit: 'ha',
      renewable: true,
      regionId: region.id,
      currentAmount: Math.floor(maxCap * rng.nextFloat(0.6, 1.0)),
      maximumAmount: maxCap,
      condition: {
        type: 'Land Condition',
        value: rng.nextFloat(0.8, 1.0)
      },
      naturalRecoveryRate: Math.floor(rng.nextFloat(20, 60) * multiplier),
      consumptionRate: null,
      extractionDifficulty: rng.nextFloat(0.1, 0.2)
    };
  }

  private generateWildlife(region: Region, rng: SeededRandom, baseArea: number) {
    const maxCap = Math.floor(rng.nextFloat(10000, 40000)); // Individuals
    return {
      type: ResourceType.WILDLIFE,
      name: 'Wildlife',
      category: ResourceCategory.RENEWABLE,
      unit: 'individuals',
      renewable: true,
      regionId: region.id,
      currentAmount: Math.floor(maxCap * rng.nextFloat(0.4, 0.9)),
      maximumAmount: maxCap,
      condition: {
        type: 'Population Health',
        value: rng.nextFloat(0.7, 1.0)
      },
      naturalRecoveryRate: Math.floor(rng.nextFloat(2, 10)),
      consumptionRate: null,
      extractionDifficulty: rng.nextFloat(0.3, 0.6)
    };
  }

  private generateFish(region: Region, rng: SeededRandom, baseArea: number) {
    let multiplier = 1.0;
    if (region.climate === 'Coastal') multiplier = 3.0;

    const maxCap = Math.floor(rng.nextFloat(20000, 60000) * multiplier); // Tonnes
    return {
      type: ResourceType.FISH,
      name: 'Fish',
      category: ResourceCategory.RENEWABLE,
      unit: 'tonnes',
      renewable: true,
      regionId: region.id,
      currentAmount: Math.floor(maxCap * rng.nextFloat(0.6, 1.0)),
      maximumAmount: maxCap,
      condition: {
        type: 'Ecosystem Health',
        value: rng.nextFloat(0.7, 1.0)
      },
      naturalRecoveryRate: Math.floor(rng.nextFloat(10, 30) * multiplier),
      consumptionRate: null,
      extractionDifficulty: rng.nextFloat(0.2, 0.5)
    };
  }

  private generateStone(region: Region, rng: SeededRandom, baseArea: number) {
    let multiplier = 1.0;
    if (region.climate === 'Mountain') multiplier = 3.0;
    
    const qty = Math.floor(rng.nextFloat(100000, 500000) * multiplier); // Tonnes
    return {
      type: ResourceType.STONE,
      name: 'Stone',
      category: ResourceCategory.NON_RENEWABLE,
      unit: 'tonnes',
      renewable: false,
      regionId: region.id,
      currentAmount: qty,
      maximumAmount: qty,
      condition: null,
      naturalRecoveryRate: null,
      consumptionRate: null,
      extractionDifficulty: rng.nextFloat(0.3, 0.7)
    };
  }

  private generateIron(region: Region, rng: SeededRandom, baseArea: number) {
    let multiplier = 1.0;
    if (region.climate === 'Mountain') multiplier = 2.5;
    
    const qty = Math.floor(rng.nextFloat(20000, 80000) * multiplier); // Tonnes
    return {
      type: ResourceType.IRON,
      name: 'Iron',
      category: ResourceCategory.NON_RENEWABLE,
      unit: 'tonnes',
      renewable: false,
      regionId: region.id,
      currentAmount: qty,
      maximumAmount: qty,
      condition: {
        type: 'Ore Purity',
        value: rng.nextFloat(0.4, 0.9)
      },
      naturalRecoveryRate: null,
      consumptionRate: null,
      extractionDifficulty: rng.nextFloat(0.4, 0.8)
    };
  }

  private generateCopper(region: Region, rng: SeededRandom, baseArea: number) {
    let multiplier = 1.0;
    if (region.climate === 'Mountain') multiplier = 2.0;
    if (region.climate === 'Desert') multiplier = 1.5;
    
    const qty = Math.floor(rng.nextFloat(15000, 60000) * multiplier); // Tonnes
    return {
      type: ResourceType.COPPER,
      name: 'Copper',
      category: ResourceCategory.NON_RENEWABLE,
      unit: 'tonnes',
      renewable: false,
      regionId: region.id,
      currentAmount: qty,
      maximumAmount: qty,
      condition: {
        type: 'Ore Purity',
        value: rng.nextFloat(0.4, 0.9)
      },
      naturalRecoveryRate: null,
      consumptionRate: null,
      extractionDifficulty: rng.nextFloat(0.4, 0.8)
    };
  }

  private generateCoal(region: Region, rng: SeededRandom, baseArea: number) {
    let multiplier = 1.0;
    if (region.climate === 'Humid Continental' || region.climate === 'Temperate') multiplier = 2.0;
    
    const qty = Math.floor(rng.nextFloat(30000, 100000) * multiplier); // Tonnes
    return {
      type: ResourceType.COAL,
      name: 'Coal',
      category: ResourceCategory.NON_RENEWABLE,
      unit: 'tonnes',
      renewable: false,
      regionId: region.id,
      currentAmount: qty,
      maximumAmount: qty,
      condition: {
        type: 'Deposit Quality',
        value: rng.nextFloat(0.5, 0.95)
      },
      naturalRecoveryRate: null,
      consumptionRate: null,
      extractionDifficulty: rng.nextFloat(0.5, 0.9)
    };
  }

  private generateGold(region: Region, rng: SeededRandom, baseArea: number) {
    let multiplier = 1.0;
    if (region.climate === 'Mountain') multiplier = 1.5;
    
    const qty = Math.floor(rng.nextFloat(1000, 5000) * multiplier); // kg
    return {
      type: ResourceType.GOLD,
      name: 'Gold',
      category: ResourceCategory.NON_RENEWABLE,
      unit: 'kg',
      renewable: false,
      regionId: region.id,
      currentAmount: qty,
      maximumAmount: qty,
      condition: null,
      naturalRecoveryRate: null,
      consumptionRate: null,
      extractionDifficulty: rng.nextFloat(0.7, 1.0)
    };
  }

  private generateOil(region: Region, rng: SeededRandom, baseArea: number) {
    let multiplier = 1.0;
    if (region.climate === 'Desert' || region.climate === 'Arctic' || region.climate === 'Coastal') multiplier = 2.0;
    
    const qty = Math.floor(rng.nextFloat(20000, 100000) * multiplier); // Barrels
    return {
      type: ResourceType.OIL,
      name: 'Oil',
      category: ResourceCategory.NON_RENEWABLE,
      unit: 'barrels',
      renewable: false,
      regionId: region.id,
      currentAmount: qty,
      maximumAmount: qty,
      condition: {
        type: 'Crude Quality',
        value: rng.nextFloat(0.6, 1.0)
      },
      naturalRecoveryRate: null,
      consumptionRate: null,
      extractionDifficulty: rng.nextFloat(0.6, 0.95)
    };
  }

  private generateNaturalGas(region: Region, rng: SeededRandom, baseArea: number) {
    let multiplier = 1.0;
    if (region.climate === 'Desert' || region.climate === 'Arctic') multiplier = 2.0;
    
    const qty = Math.floor(rng.nextFloat(20000, 90000) * multiplier); // Cubic meters
    return {
      type: ResourceType.NATURAL_GAS,
      name: 'Natural Gas',
      category: ResourceCategory.NON_RENEWABLE,
      unit: 'm³',
      renewable: false,
      regionId: region.id,
      currentAmount: qty,
      maximumAmount: qty,
      condition: null,
      naturalRecoveryRate: null,
      consumptionRate: null,
      extractionDifficulty: rng.nextFloat(0.6, 0.95)
    };
  }

  private generateSolarPotential(region: Region, rng: SeededRandom, baseArea: number) {
    let multiplier = 1.0;
    if (region.climate === 'Desert') multiplier = 3.0;
    if (region.climate === 'Arctic') multiplier = 0.2;
    if (region.climate === 'Tropical') multiplier = 1.5;

    const maxCap = Math.floor(rng.nextFloat(500, 1500) * multiplier); // W/m²
    return {
      type: ResourceType.SOLAR_POTENTIAL,
      name: 'Solar Potential',
      category: ResourceCategory.RENEWABLE,
      unit: 'W/m²',
      renewable: true,
      regionId: region.id,
      currentAmount: maxCap,
      maximumAmount: maxCap,
      condition: null,
      naturalRecoveryRate: maxCap, // Potential is always max available when sunny
      consumptionRate: null,
      extractionDifficulty: rng.nextFloat(0.1, 0.3)
    };
  }

  private generateWindPotential(region: Region, rng: SeededRandom, baseArea: number) {
    let multiplier = 1.0;
    if (region.climate === 'Coastal' || region.climate === 'Mountain') multiplier = 2.5;

    const maxCap = Math.floor(rng.nextFloat(400, 1200) * multiplier); // W/m²
    return {
      type: ResourceType.WIND_POTENTIAL,
      name: 'Wind Potential',
      category: ResourceCategory.RENEWABLE,
      unit: 'W/m²',
      renewable: true,
      regionId: region.id,
      currentAmount: maxCap,
      maximumAmount: maxCap,
      condition: null,
      naturalRecoveryRate: maxCap,
      consumptionRate: null,
      extractionDifficulty: rng.nextFloat(0.2, 0.4)
    };
  }
}
