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
    
    // Generate Water
    resources.push(this.generateWater(region, rng, baseArea));
    
    // Generate Biologicals based on climate
    if (region.climate !== 'Desert' && region.climate !== 'Arctic') {
      resources.push(this.generateForests(region, rng, baseArea));
      resources.push(this.generateGrasslands(region, rng, baseArea));
      resources.push(this.generateWildlife(region, rng, baseArea));
    }
    
    if (region.climate === 'Coastal' || region.climate === 'Tropical' || region.climate === 'Temperate') {
      resources.push(this.generateFish(region, rng, baseArea));
    }

    // Generate Minerals (Non-Renewable)
    resources.push(this.generateStone(region, rng, baseArea));
    resources.push(this.generateIron(region, rng, baseArea));
    resources.push(this.generateCopper(region, rng, baseArea));
    resources.push(this.generateCoal(region, rng, baseArea));
    resources.push(this.generateGold(region, rng, baseArea));
    resources.push(this.generateOil(region, rng, baseArea));
    resources.push(this.generateNaturalGas(region, rng, baseArea));

    // Generate Potentials
    resources.push(this.generateSolarPotential(region, rng, baseArea));
    resources.push(this.generateWindPotential(region, rng, baseArea));
    
    return resources;
  }

  private generateWater(region: Region, rng: SeededRandom, baseArea: number) {
    let multiplier = 1.0;
    if (region.climate === 'Desert') multiplier = 0.1;
    if (region.climate === 'Tropical' || region.climate === 'Coastal') multiplier = 2.0;

    const maxCap = Math.floor(rng.nextFloat(50000, 150000) * multiplier);
    return {
      type: ResourceType.WATER,
      category: ResourceCategory.RENEWABLE,
      regionId: region.id,
      currentQuantity: Math.floor(maxCap * rng.nextFloat(0.7, 1.0)),
      maximumCapacity: maxCap,
      quality: rng.nextFloat(0.5, 1.0),
      purity: rng.nextFloat(0.6, 1.0),
      health: 1.0,
      regenerationRate: Math.floor(rng.nextFloat(10, 50) * multiplier),
      consumptionRate: 0,
      extractionDifficulty: rng.nextFloat(0.1, 0.3)
    };
  }

  private generateForests(region: Region, rng: SeededRandom, baseArea: number) {
    let multiplier = 1.0;
    if (region.climate === 'Tropical') multiplier = 3.0;
    if (region.climate === 'Mountain') multiplier = 1.5;
    if (region.climate === 'Semi-Arid') multiplier = 0.2;

    const maxCap = Math.floor(rng.nextFloat(20000, 80000) * multiplier);
    return {
      type: ResourceType.FORESTS,
      category: ResourceCategory.RENEWABLE,
      regionId: region.id,
      currentQuantity: Math.floor(maxCap * rng.nextFloat(0.5, 1.0)),
      maximumCapacity: maxCap,
      quality: rng.nextFloat(0.4, 1.0),
      health: rng.nextFloat(0.7, 1.0),
      regenerationRate: Math.floor(rng.nextFloat(5, 20) * multiplier),
      consumptionRate: 0,
      extractionDifficulty: rng.nextFloat(0.2, 0.5)
    };
  }

  private generateGrasslands(region: Region, rng: SeededRandom, baseArea: number) {
    let multiplier = 1.0;
    if (region.climate === 'Temperate') multiplier = 2.0;
    if (region.climate === 'Humid Continental') multiplier = 1.8;

    const maxCap = Math.floor(rng.nextFloat(40000, 100000) * multiplier);
    return {
      type: ResourceType.GRASSLANDS,
      category: ResourceCategory.RENEWABLE,
      regionId: region.id,
      currentQuantity: Math.floor(maxCap * rng.nextFloat(0.6, 1.0)),
      maximumCapacity: maxCap,
      quality: rng.nextFloat(0.5, 1.0),
      health: rng.nextFloat(0.8, 1.0),
      regenerationRate: Math.floor(rng.nextFloat(20, 60) * multiplier),
      consumptionRate: 0,
      extractionDifficulty: rng.nextFloat(0.1, 0.2)
    };
  }

  private generateWildlife(region: Region, rng: SeededRandom, baseArea: number) {
    const maxCap = Math.floor(rng.nextFloat(10000, 40000));
    return {
      type: ResourceType.WILDLIFE,
      category: ResourceCategory.RENEWABLE,
      regionId: region.id,
      currentQuantity: Math.floor(maxCap * rng.nextFloat(0.4, 0.9)),
      maximumCapacity: maxCap,
      quality: rng.nextFloat(0.5, 1.0),
      health: rng.nextFloat(0.7, 1.0),
      regenerationRate: Math.floor(rng.nextFloat(2, 10)),
      consumptionRate: 0,
      extractionDifficulty: rng.nextFloat(0.3, 0.6)
    };
  }

  private generateFish(region: Region, rng: SeededRandom, baseArea: number) {
    let multiplier = 1.0;
    if (region.climate === 'Coastal') multiplier = 3.0;

    const maxCap = Math.floor(rng.nextFloat(20000, 60000) * multiplier);
    return {
      type: ResourceType.FISH,
      category: ResourceCategory.RENEWABLE,
      regionId: region.id,
      currentQuantity: Math.floor(maxCap * rng.nextFloat(0.6, 1.0)),
      maximumCapacity: maxCap,
      quality: rng.nextFloat(0.5, 1.0),
      health: rng.nextFloat(0.7, 1.0),
      regenerationRate: Math.floor(rng.nextFloat(10, 30) * multiplier),
      consumptionRate: 0,
      extractionDifficulty: rng.nextFloat(0.2, 0.5)
    };
  }

  private generateStone(region: Region, rng: SeededRandom, baseArea: number) {
    let multiplier = 1.0;
    if (region.climate === 'Mountain') multiplier = 3.0;
    
    const qty = Math.floor(rng.nextFloat(100000, 500000) * multiplier);
    return {
      type: ResourceType.STONE,
      category: ResourceCategory.NON_RENEWABLE,
      regionId: region.id,
      currentQuantity: qty,
      maximumCapacity: qty,
      quality: rng.nextFloat(0.4, 1.0),
      purity: rng.nextFloat(0.7, 1.0),
      regenerationRate: 0,
      consumptionRate: 0,
      extractionDifficulty: rng.nextFloat(0.3, 0.7)
    };
  }

  private generateIron(region: Region, rng: SeededRandom, baseArea: number) {
    let multiplier = 1.0;
    if (region.climate === 'Mountain') multiplier = 2.5;
    
    const qty = Math.floor(rng.nextFloat(20000, 80000) * multiplier);
    return {
      type: ResourceType.IRON,
      category: ResourceCategory.NON_RENEWABLE,
      regionId: region.id,
      currentQuantity: qty,
      maximumCapacity: qty,
      quality: rng.nextFloat(0.5, 1.0),
      purity: rng.nextFloat(0.4, 0.9),
      regenerationRate: 0,
      consumptionRate: 0,
      extractionDifficulty: rng.nextFloat(0.4, 0.8)
    };
  }

  private generateCopper(region: Region, rng: SeededRandom, baseArea: number) {
    let multiplier = 1.0;
    if (region.climate === 'Mountain') multiplier = 2.0;
    if (region.climate === 'Desert') multiplier = 1.5;
    
    const qty = Math.floor(rng.nextFloat(15000, 60000) * multiplier);
    return {
      type: ResourceType.COPPER,
      category: ResourceCategory.NON_RENEWABLE,
      regionId: region.id,
      currentQuantity: qty,
      maximumCapacity: qty,
      quality: rng.nextFloat(0.5, 1.0),
      purity: rng.nextFloat(0.4, 0.9),
      regenerationRate: 0,
      consumptionRate: 0,
      extractionDifficulty: rng.nextFloat(0.4, 0.8)
    };
  }

  private generateCoal(region: Region, rng: SeededRandom, baseArea: number) {
    let multiplier = 1.0;
    if (region.climate === 'Humid Continental' || region.climate === 'Temperate') multiplier = 2.0;
    
    const qty = Math.floor(rng.nextFloat(30000, 100000) * multiplier);
    return {
      type: ResourceType.COAL,
      category: ResourceCategory.NON_RENEWABLE,
      regionId: region.id,
      currentQuantity: qty,
      maximumCapacity: qty,
      quality: rng.nextFloat(0.4, 1.0),
      purity: rng.nextFloat(0.5, 0.95),
      regenerationRate: 0,
      consumptionRate: 0,
      extractionDifficulty: rng.nextFloat(0.5, 0.9)
    };
  }

  private generateGold(region: Region, rng: SeededRandom, baseArea: number) {
    let multiplier = 1.0;
    if (region.climate === 'Mountain') multiplier = 1.5;
    
    const qty = Math.floor(rng.nextFloat(1000, 5000) * multiplier);
    return {
      type: ResourceType.GOLD,
      category: ResourceCategory.NON_RENEWABLE,
      regionId: region.id,
      currentQuantity: qty,
      maximumCapacity: qty,
      quality: rng.nextFloat(0.8, 1.0),
      purity: rng.nextFloat(0.1, 0.5),
      regenerationRate: 0,
      consumptionRate: 0,
      extractionDifficulty: rng.nextFloat(0.7, 1.0)
    };
  }

  private generateOil(region: Region, rng: SeededRandom, baseArea: number) {
    let multiplier = 1.0;
    if (region.climate === 'Desert' || region.climate === 'Arctic' || region.climate === 'Coastal') multiplier = 2.0;
    
    const qty = Math.floor(rng.nextFloat(20000, 100000) * multiplier);
    return {
      type: ResourceType.OIL,
      category: ResourceCategory.NON_RENEWABLE,
      regionId: region.id,
      currentQuantity: qty,
      maximumCapacity: qty,
      quality: rng.nextFloat(0.6, 1.0),
      purity: rng.nextFloat(0.6, 1.0),
      regenerationRate: 0,
      consumptionRate: 0,
      extractionDifficulty: rng.nextFloat(0.6, 0.95)
    };
  }

  private generateNaturalGas(region: Region, rng: SeededRandom, baseArea: number) {
    let multiplier = 1.0;
    if (region.climate === 'Desert' || region.climate === 'Arctic') multiplier = 2.0;
    
    const qty = Math.floor(rng.nextFloat(20000, 90000) * multiplier);
    return {
      type: ResourceType.NATURAL_GAS,
      category: ResourceCategory.NON_RENEWABLE,
      regionId: region.id,
      currentQuantity: qty,
      maximumCapacity: qty,
      quality: rng.nextFloat(0.6, 1.0),
      purity: rng.nextFloat(0.7, 1.0),
      regenerationRate: 0,
      consumptionRate: 0,
      extractionDifficulty: rng.nextFloat(0.6, 0.95)
    };
  }

  private generateSolarPotential(region: Region, rng: SeededRandom, baseArea: number) {
    let multiplier = 1.0;
    if (region.climate === 'Desert') multiplier = 3.0;
    if (region.climate === 'Arctic') multiplier = 0.2;
    if (region.climate === 'Tropical') multiplier = 1.5;

    const maxCap = Math.floor(rng.nextFloat(500, 1500) * multiplier); // abstract units
    return {
      type: ResourceType.SOLAR_POTENTIAL,
      category: ResourceCategory.RENEWABLE,
      regionId: region.id,
      currentQuantity: maxCap,
      maximumCapacity: maxCap,
      quality: rng.nextFloat(0.7, 1.0),
      regenerationRate: maxCap, // Potential is always max available when sunny
      consumptionRate: 0,
      extractionDifficulty: rng.nextFloat(0.1, 0.3)
    };
  }

  private generateWindPotential(region: Region, rng: SeededRandom, baseArea: number) {
    let multiplier = 1.0;
    if (region.climate === 'Coastal' || region.climate === 'Mountain') multiplier = 2.5;

    const maxCap = Math.floor(rng.nextFloat(400, 1200) * multiplier); // abstract units
    return {
      type: ResourceType.WIND_POTENTIAL,
      category: ResourceCategory.RENEWABLE,
      regionId: region.id,
      currentQuantity: maxCap,
      maximumCapacity: maxCap,
      quality: rng.nextFloat(0.6, 1.0),
      regenerationRate: maxCap,
      consumptionRate: 0,
      extractionDifficulty: rng.nextFloat(0.2, 0.4)
    };
  }
}
