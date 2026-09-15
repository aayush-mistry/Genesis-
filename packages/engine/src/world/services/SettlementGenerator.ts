import { WorldEngine } from '../WorldEngine';
import { DistrictType, BuildingType, District, Building } from '@genesis/shared';
import { SpatialGenerator } from './SpatialGenerator';

export class SettlementGenerator {
  public static readonly HOUSEHOLD_CAPACITY = 5;
  public static readonly APARTMENT_HOUSEHOLD_CAPACITY = 100;
  public static readonly APARTMENT_CITIZEN_CAPACITY = 
    SettlementGenerator.APARTMENT_HOUSEHOLD_CAPACITY * SettlementGenerator.HOUSEHOLD_CAPACITY;

  constructor(private worldEngine: WorldEngine) {}

  /**
   * Generates or retrieves a Residential District for a given city.
   */
  public getOrCreateResidentialDistrict(cityId: string, seed: string): District {
    const city = this.worldEngine.cityManager.getCity(cityId);
    if (!city) throw new Error(`City ${cityId} not found.`);

    // Check if one exists
    for (const dId of city.districtIds) {
      const dist = this.worldEngine.districtManager.getDistrict(dId);
      if (dist && dist.type === DistrictType.RESIDENTIAL) {
        return dist;
      }
    }

    // Determine position using seed based on city coordinates
    const districtWidth = 500;
    const districtHeight = 500;
    
    // Fallback to simplistic placement relative to city
    const residentialDistrict = this.worldEngine.districtManager.createDistrict({
      name: 'Residential District',
      cityId: city.id,
      type: DistrictType.RESIDENTIAL,
      coordinates: { x: city.coordinates.x - 200, y: city.coordinates.y + 100 },
      width: districtWidth,
      height: districtHeight,
      area: districtWidth * districtHeight,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    this.worldEngine.cityManager.addDistrict(city.id, residentialDistrict.id);
    return residentialDistrict;
  }

  /**
   * Calculates the required number of apartment complexes for a given population target.
   */
  public calculateRequiredApartments(population: number): number {
    if (population <= 0) return 0;
    return Math.ceil(population / SettlementGenerator.APARTMENT_CITIZEN_CAPACITY);
  }

  /**
   * Ensures the district has at least the required number of apartments.
   * Returns an array of newly created apartment buildings (if any) so they can be persisted.
   */
  public generateApartmentsForPopulation(
    district: District, 
    population: number, 
    seed: string
  ): Building[] {
    const requiredCount = this.calculateRequiredApartments(population);
    const existingApartments: Building[] = [];
    
    for (const bId of district.buildingIds) {
      const b = this.worldEngine.buildingManager.getBuilding(bId);
      if (b && b.type === BuildingType.APARTMENT) {
        existingApartments.push(b);
      }
    }

    const currentCount = existingApartments.length;
    const newApartments: Building[] = [];

    if (currentCount >= requiredCount) {
      return newApartments; // We have enough capacity
    }

    const boundsToAvoid = existingApartments.map(a => ({
      x: a.coordinates.x - a.width / 2,
      y: a.coordinates.y - a.height / 2,
      width: a.width,
      height: a.height
    }));

    const districtBounds = {
      x: district.coordinates.x - district.width / 2,
      y: district.coordinates.y - district.height / 2,
      width: district.width,
      height: district.height
    };

    const toGenerate = requiredCount - currentCount;
    for (let i = 0; i < toGenerate; i++) {
      const index = currentCount + i + 1;
      
      const aptWidth = 30;
      const aptHeight = 30;

      // Try deterministic bounds placement
      const placement = SpatialGenerator.generateNonOverlappingBounds(
        districtBounds,
        aptWidth,
        aptHeight,
        boundsToAvoid,
        `${seed}-apt-${index}`
      );

      // Default fallback if placement fails
      let coordX = district.coordinates.x - 350 + (index % 5) * 60;
      let coordY = district.coordinates.y + Math.floor(index / 5) * 60;

      if (placement) {
        coordX = placement.x + aptWidth / 2;
        coordY = placement.y + aptHeight / 2;
        boundsToAvoid.push(placement);
      }

      const apartment = this.worldEngine.buildingManager.createBuilding({
        name: `Apartment Complex ${index}`,
        districtId: district.id,
        type: BuildingType.APARTMENT,
        capacity: SettlementGenerator.APARTMENT_CITIZEN_CAPACITY,
        coordinates: { x: coordX, y: coordY },
        width: aptWidth,
        height: aptHeight,
        status: 'ACTIVE',
        createdAt: new Date(),
        updatedAt: new Date()
      });
      this.worldEngine.districtManager.addBuilding(district.id, apartment.id);
      newApartments.push(apartment);
    }

    return newApartments;
  }

  /**
   * Assigns a list of citizens to households within the given apartments.
   * Creates new households as needed up to APARTMENT_HOUSEHOLD_CAPACITY per apartment.
   * Returns the list of created households and the list of assigned citizens.
   */
  public assignCitizensToHouseholds(
    apartments: Building[],
    citizensToAssign: any[],
    householdService: any,
    seed: string
  ): { households: any[], assignedCitizens: any[] } {
    let citizenIndex = 0;
    const generatedHouseholds: any[] = [];
    const assignedCitizens: any[] = [];
    
    // Simple deterministic random for placement within bounds
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = Math.imul(31, hash) + seed.charCodeAt(i) | 0;
    }
    const rng = () => {
      hash = Math.imul(1597334677, hash) + 1 | 0;
      let t = Math.imul((hash ^ (hash >>> 16)), 116282283);
      hash = t ^ (t >>> 13);
      return (hash >>> 0) / 4294967296;
    };

    for (const apartment of apartments) {
      if (citizenIndex >= citizensToAssign.length) break;

      // In a real scenario, we'd check how many households already exist in the apartment.
      // For this migration, we'll assume we can just fill up to the capacity.
      for (let h = 0; h < SettlementGenerator.APARTMENT_HOUSEHOLD_CAPACITY; h++) {
        if (citizenIndex >= citizensToAssign.length) break;

        const household = householdService.createHousehold(apartment.id);
        generatedHouseholds.push(household);

        for (let m = 0; m < SettlementGenerator.HOUSEHOLD_CAPACITY; m++) {
          if (citizenIndex < citizensToAssign.length) {
            const c = citizensToAssign[citizenIndex];
            c.locationId = household.locationId;
            c.householdId = household.id;
            
            // Generate exact coordinates inside the apartment bounds using deterministic RNG
            const w = apartment.width;
            const h2 = apartment.height;
            c.coordX = apartment.coordinates.x - w/2 + rng() * w;
            c.coordY = apartment.coordinates.y - h2/2 + rng() * h2;
            
            householdService.addMember(household.id, c.id);
            assignedCitizens.push(c);
            citizenIndex++;
          }
        }
      }
    }
    
    return { households: generatedHouseholds, assignedCitizens };
  }
}
