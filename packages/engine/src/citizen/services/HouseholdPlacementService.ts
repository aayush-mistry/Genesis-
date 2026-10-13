import { Citizen, Building, BuildingType } from '@genesis/shared';
import { WorldEngine } from '../../world/WorldEngine';
import { HouseholdService } from './HouseholdService';
import { SettlementGenerator } from '../../world/services/SettlementGenerator';

export interface PlacementResult {
  success: boolean;
  householdId?: string;
  locationId?: string;
  coordX?: number;
  coordY?: number;
  reason?: string;
  isNewHousehold?: boolean;
}

export class HouseholdPlacementService {
  private unhousedCitizenIds: Set<string> = new Set();

  constructor(
    private worldEngine: WorldEngine,
    private householdService: HouseholdService
  ) {}

  public trackUnhoused(citizenId: string): void {
    this.unhousedCitizenIds.add(citizenId);
  }

  public untrackUnhoused(citizenId: string): void {
    this.unhousedCitizenIds.delete(citizenId);
  }

  public getUnhousedCitizenIds(): string[] {
    return Array.from(this.unhousedCitizenIds);
  }

  public hasUnhousedCitizens(): boolean {
    return this.unhousedCitizenIds.size > 0;
  }

  public clear(): void {
    this.unhousedCitizenIds.clear();
  }

  /**
   * Retrieves all residential buildings (Apartments and Houses) in the world,
   * optionally filtered by a specific city ID.
   */
  public getResidentialBuildings(filterCityId?: string): Building[] {
    const buildings = this.worldEngine.buildingManager.getAllBuildings().filter(b => 
      b.type === BuildingType.APARTMENT || b.type === BuildingType.HOUSE
    );

    if (filterCityId) {
      return buildings.filter(b => {
        const district = this.worldEngine.districtManager.getDistrict(b.districtId);
        return district && district.cityId === filterCityId;
      });
    }

    return buildings;
  }

  /**
   * Calculates the capacity limits (citizens and households) for a building based on its type.
   */
  public getBuildingCapacityLimits(building: Building): { citizenCapacity: number; householdCapacity: number } {
    if (building.type === BuildingType.APARTMENT) {
      return {
        citizenCapacity: building.capacity || SettlementGenerator.APARTMENT_CITIZEN_CAPACITY,
        householdCapacity: SettlementGenerator.APARTMENT_HOUSEHOLD_CAPACITY
      };
    } else if (building.type === BuildingType.HOUSE) {
      return {
        citizenCapacity: building.capacity || SettlementGenerator.HOUSEHOLD_CAPACITY,
        householdCapacity: 1
      };
    }
    return {
      citizenCapacity: building.capacity || SettlementGenerator.HOUSEHOLD_CAPACITY,
      householdCapacity: 1
    };
  }

  /**
   * Evaluates the current residential occupancy and remaining capacity of a building.
   */
  public getBuildingOccupancy(buildingId: string): {
    building?: Building;
    households: import('@genesis/shared').Household[];
    citizenCount: number;
    citizenCapacity: number;
    householdCapacity: number;
    hasCitizenCapacity: boolean;
    hasHouseholdCapacity: boolean;
  } {
    const building = this.worldEngine.buildingManager.getBuilding(buildingId);
    const households = this.householdService.getHouseholdsByLocation(buildingId);
    const citizenCount = households.reduce((sum, h) => sum + h.members.length, 0);

    if (!building) {
      return {
        households,
        citizenCount,
        citizenCapacity: 0,
        householdCapacity: 0,
        hasCitizenCapacity: false,
        hasHouseholdCapacity: false
      };
    }

    const { citizenCapacity, householdCapacity } = this.getBuildingCapacityLimits(building);

    return {
      building,
      households,
      citizenCount,
      citizenCapacity,
      householdCapacity,
      hasCitizenCapacity: citizenCount < citizenCapacity,
      hasHouseholdCapacity: households.length < householdCapacity && citizenCount < citizenCapacity
    };
  }

  /**
   * Finds the first residential building that has capacity to host a new household.
   */
  public findBuildingWithHouseholdCapacity(preferredCityId?: string | null): Building | null {
    // 1. Try preferred city first if provided
    if (preferredCityId) {
      const cityBuildings = this.getResidentialBuildings(preferredCityId);
      for (const building of cityBuildings) {
        const occ = this.getBuildingOccupancy(building.id);
        if (occ.hasHouseholdCapacity) {
          return building;
        }
      }
    }

    // 2. Otherwise search all residential buildings
    const allBuildings = this.getResidentialBuildings();
    for (const building of allBuildings) {
      const occ = this.getBuildingOccupancy(building.id);
      if (occ.hasHouseholdCapacity) {
        return building;
      }
    }

    return null;
  }

  /**
   * Assigns a newborn citizen to a household.
   * Priority 1: Joins parent's household if capacity permits (< HOUSEHOLD_CAPACITY and building not full).
   * Priority 2: If parent's household is full, considers another suitable placement in available residential capacity.
   * Priority 3: If no residential capacity exists, safe outcome as unhoused / awaiting placement without unlimited housing.
   */
  public assignNewborn(newborn: Citizen, parent?: Citizen, rng: () => number = Math.random): PlacementResult {
    // 1. Check idempotency: If newborn is already in a valid household, preserve it
    if (newborn.householdId) {
      const currentHh = this.householdService.getHousehold(newborn.householdId);
      if (currentHh && currentHh.members.includes(newborn.id)) {
        this.untrackUnhoused(newborn.id);
        return {
          success: true,
          householdId: currentHh.id,
          locationId: currentHh.locationId,
          coordX: newborn.coordX,
          coordY: newborn.coordY,
          isNewHousehold: false
        };
      }
    }

    // 2. Try parent's household if available and has capacity
    if (parent && parent.householdId) {
      const parentHh = this.householdService.getHousehold(parent.householdId);
      if (parentHh) {
        const isHouseholdNotFull = parentHh.members.length < SettlementGenerator.HOUSEHOLD_CAPACITY;
        const bOccupancy = this.getBuildingOccupancy(parentHh.locationId);
        
        if (isHouseholdNotFull && bOccupancy.hasCitizenCapacity) {
          // Assign to parent's household
          this.householdService.addMember(parentHh.id, newborn.id);
          newborn.householdId = parentHh.id;
          newborn.locationId = parentHh.locationId;

          // Coordinates inherit from parent or building bounds
          if (parent.coordX != null && parent.coordY != null) {
            newborn.coordX = parent.coordX;
            newborn.coordY = parent.coordY;
          } else if (bOccupancy.building) {
            const b = bOccupancy.building;
            newborn.coordX = b.coordinates.x - b.width / 2 + rng() * b.width;
            newborn.coordY = b.coordinates.y - b.height / 2 + rng() * b.height;
          }

          this.untrackUnhoused(newborn.id);
          return {
            success: true,
            householdId: parentHh.id,
            locationId: parentHh.locationId,
            coordX: newborn.coordX,
            coordY: newborn.coordY,
            isNewHousehold: false
          };
        }
      }
    }

    // 3. Parent's household is full or unavailable:
    // "A full household causes another suitable placement to be considered."
    let parentCityId: string | undefined = undefined;
    if (parent && parent.locationId) {
      const parentBuilding = this.worldEngine.buildingManager.getBuilding(parent.locationId);
      if (parentBuilding) {
        const district = this.worldEngine.districtManager.getDistrict(parentBuilding.districtId);
        if (district) parentCityId = district.cityId;
      }
    }

    const availableBuilding = this.findBuildingWithHouseholdCapacity(parentCityId);
    if (availableBuilding) {
      const household = this.householdService.createHousehold(availableBuilding.id);
      this.householdService.addMember(household.id, newborn.id);
      this.householdService.provisionStarterResources(household.id);

      newborn.householdId = household.id;
      newborn.locationId = availableBuilding.id;

      const w = availableBuilding.width;
      const h = availableBuilding.height;
      newborn.coordX = availableBuilding.coordinates.x - w / 2 + rng() * w;
      newborn.coordY = availableBuilding.coordinates.y - h / 2 + rng() * h;

      this.untrackUnhoused(newborn.id);
      return {
        success: true,
        householdId: household.id,
        locationId: availableBuilding.id,
        coordX: newborn.coordX,
        coordY: newborn.coordY,
        isNewHousehold: true
      };
    }

    // 4. No available residential capacity:
    // "No available residential capacity produces an explicit, safe outcome without creating unlimited housing."
    newborn.householdId = undefined;
    newborn.locationId = parent?.locationId ?? null;
    newborn.coordX = parent?.coordX ?? undefined;
    newborn.coordY = parent?.coordY ?? undefined;

    this.trackUnhoused(newborn.id);
    return {
      success: false,
      reason: 'NO_RESIDENTIAL_CAPACITY'
    };
  }

  /**
   * Assigns an immigrant to a suitable residential placement.
   * An immigrant receives an appropriate placement (forms a household in available residential capacity)
   * rather than automatically being attached to an unrelated family.
   * If no capacity is available, represented explicitly as unhoused / awaiting placement.
   */
  public assignImmigrant(
    immigrant: Citizen, 
    preferredLocationId?: string | null, 
    rng: () => number = Math.random
  ): PlacementResult {
    // 1. Check idempotency: If immigrant is already in a valid household, preserve it
    if (immigrant.householdId) {
      const currentHh = this.householdService.getHousehold(immigrant.householdId);
      if (currentHh && currentHh.members.includes(immigrant.id)) {
        this.untrackUnhoused(immigrant.id);
        return {
          success: true,
          householdId: currentHh.id,
          locationId: currentHh.locationId,
          coordX: immigrant.coordX,
          coordY: immigrant.coordY,
          isNewHousehold: false
        };
      }
    }

    // 2. Resolve preferred city if a locationId is given
    let preferredCityId: string | null = null;
    if (preferredLocationId) {
      const city = this.worldEngine.cityManager.getCity(preferredLocationId);
      if (city) {
        preferredCityId = city.id;
      } else {
        const district = this.worldEngine.districtManager.getDistrict(preferredLocationId);
        if (district) {
          preferredCityId = district.cityId;
        } else {
          const building = this.worldEngine.buildingManager.getBuilding(preferredLocationId);
          if (building) {
            const d = this.worldEngine.districtManager.getDistrict(building.districtId);
            if (d) preferredCityId = d.cityId;
          }
        }
      }
    }

    // 3. Search for a residential building with capacity for a new household
    const building = this.findBuildingWithHouseholdCapacity(preferredCityId);
    if (building) {
      const household = this.householdService.createHousehold(building.id);
      this.householdService.addMember(household.id, immigrant.id);
      this.householdService.provisionStarterResources(household.id);

      immigrant.householdId = household.id;
      immigrant.locationId = building.id;

      const w = building.width;
      const h = building.height;
      immigrant.coordX = building.coordinates.x - w / 2 + rng() * w;
      immigrant.coordY = building.coordinates.y - h / 2 + rng() * h;

      this.untrackUnhoused(immigrant.id);
      return {
        success: true,
        householdId: household.id,
        locationId: building.id,
        coordX: immigrant.coordX,
        coordY: immigrant.coordY,
        isNewHousehold: true
      };
    }

    // 4. No capacity available: explicit safe outcome without creating unlimited housing
    immigrant.householdId = undefined;
    immigrant.locationId = null;
    immigrant.coordX = undefined;
    immigrant.coordY = undefined;

    this.trackUnhoused(immigrant.id);
    return {
      success: false,
      reason: 'NO_RESIDENTIAL_CAPACITY'
    };
  }

  /**
   * Retries placement for tracked unhoused citizens when capacity becomes available.
   * Only iterates citizens known to be unhoused, avoiding expensive O(N) full-population scans.
   */
  public retryUnhousedPlacements(
    getCitizen: (id: string) => Citizen | undefined,
    rng: () => number = Math.random
  ): Citizen[] {
    if (this.unhousedCitizenIds.size === 0) return [];

    const successfullyPlaced: Citizen[] = [];
    const pendingIds = Array.from(this.unhousedCitizenIds);

    for (const citizenId of pendingIds) {
      const citizen = getCitizen(citizenId);
      if (!citizen || citizen.status !== 'ACTIVE') {
        this.untrackUnhoused(citizenId);
        continue;
      }

      // If citizen already has a valid household, preserve it and untrack
      if (citizen.householdId) {
        const hh = this.householdService.getHousehold(citizen.householdId);
        if (hh && hh.members.includes(citizen.id)) {
          this.untrackUnhoused(citizenId);
          continue;
        }
      }

      // Attempt placement
      const result = this.assignImmigrant(citizen, citizen.locationId, rng);
      if (result.success) {
        this.untrackUnhoused(citizenId);
        successfullyPlaced.push(citizen);
      }
    }

    return successfullyPlaced;
  }
}
