import { 
  PerceptionSnapshot, 
  SelfPerception, 
  LocationPerception, 
  EnvironmentPerception, 
  ResourcePerception, 
  BuildingPerception, 
  EntityPerception, 
  SchedulePerception,
  Resource
} from '@genesis/shared';
import { CitizenService } from '../citizen/services/CitizenService';
import { WorldEngine } from '../world/WorldEngine';
import { EnvironmentEngine } from '../environment/EnvironmentEngine';
import { ResourceEngine } from '../resources/ResourceEngine';
import { TimeEngine } from '../time/TimeEngine';
import { SpatialQueryService } from '../spatial/SpatialQueryService';
import { PerceptionConfig } from './PerceptionConfig';

export class PerceptionService {
  constructor(
    private citizenService: CitizenService,
    private worldEngine: WorldEngine,
    private environmentEngine: EnvironmentEngine,
    private resourceEngine: ResourceEngine,
    private timeEngine: TimeEngine,
    private spatialQueryService: SpatialQueryService
  ) {}

  public async generateSnapshot(citizenId: string): Promise<PerceptionSnapshot> {
    const citizen = this.citizenService.getCitizen(citizenId);
    if (!citizen) {
      throw new Error(`PerceptionService: Citizen ${citizenId} not found.`);
    }

    const currentTime = this.timeEngine.getCurrentTime();
    const worldManager = this.worldEngine.worldManager;
    const world = worldManager.getWorld();
    if (!world) {
      throw new Error(`PerceptionService: World not found.`);
    }

    const locationId = citizen.locationId;
    if (!locationId) {
      throw new Error(`PerceptionService: Citizen ${citizenId} has no location.`);
    }

    const hierarchy = this.worldEngine.resolveLocationHierarchy(locationId);
    const coordinates = this.worldEngine.getEntityCoordinates(locationId);
    if (!coordinates) {
      throw new Error(`PerceptionService: Citizen ${citizenId} location coordinates not found.`);
    }

    // Self
    const selfPerception: SelfPerception = {
      citizenId: citizen.id,
      age: this.citizenService.getCitizenAge(citizen),
      vitalState: { ...citizen.vitalState },
      employmentStatus: citizen.employmentStatus,
      workplaceId: citizen.workplaceId,
      activeRoute: citizen.activeRoute ? { ...citizen.activeRoute } : null
    };

    // Location
    const locationPerception: LocationPerception = {
      worldId: world.id,
      regionId: hierarchy.regionId!,
      cityId: hierarchy.cityId ?? null,
      districtId: hierarchy.districtId ?? null,
      buildingId: hierarchy.buildingId ?? null,
      coordinates
    };

    // Environment
    const envState = this.environmentEngine.getEnvironmentalState(hierarchy.regionId!);
    const weather = this.environmentEngine.weatherManager.getRegionWeather(hierarchy.regionId!);
    
    const environmentPerception: EnvironmentPerception = {
      season: this.environmentEngine.seasonManager.getCurrentSeason(),
      weather: weather?.currentType || 'Sunny',
      temperature: envState?.temperature ?? 20,
      humidity: envState?.humidity ?? 50,
      dayPhase: this.environmentEngine.dayCycleManager.getCurrentPhase()
    };

    // Gather Nearby Entities
    const nearbySpatialEntities = this.spatialQueryService.findNearby(
      coordinates, 
      PerceptionConfig.DEFAULT_PERCEPTION_RADIUS
    );

    const nearbyResources: ResourcePerception[] = [];
    const nearbyBuildings: BuildingPerception[] = [];
    const nearbyEntities: EntityPerception[] = [];

    for (const spatialEntity of nearbySpatialEntities) {
      if (spatialEntity.id === citizenId || spatialEntity.id === locationId) {
        // Skip self or exact current building unless necessary, but we keep buildings
      }

      if (spatialEntity.type === 'BUILDING') {
        const building = this.worldEngine.buildingManager.getBuilding(spatialEntity.id);
        if (building) {
          nearbyBuildings.push({
            id: building.id,
            type: building.type,
            distance: spatialEntity.distance,
            coordinates: spatialEntity.position
          });
        }
      } else if (spatialEntity.type === 'CITIZEN' && spatialEntity.id !== citizenId) {
        nearbyEntities.push({
          id: spatialEntity.id,
          type: 'CITIZEN',
          distance: spatialEntity.distance,
          coordinates: spatialEntity.position
        });
      }
    }

    // To find resources, we query the ResourceEngine for regions/cities the citizen is in or nearby
    // For now, we fetch resources in the current region, and treat them as nearby.
    const regionResources = this.resourceEngine.resourceManager.getResourcesByRegion(hierarchy.regionId!);
    
    // We mock spatial distances for regional resources since resources are often attached to the region,
    // not to exact coordinates, or we estimate based on the region's center.
    // Assuming resources in the region are accessible:
    for (const resource of regionResources) {
      if (resource.currentAmount > 0) {
        nearbyResources.push({
          id: resource.id,
          type: resource.type,
          quantity: resource.currentAmount,
          distance: 0, // Fallback since it's regional
          coordinates // Fallback to current location for regional resources
        });
      }
    }

    // Schedule
    let currentActivity = null;
    let nextActivity = null;
    if (citizen.jobSchedule) {
      // Very basic schedule perception based on time
      const hour = currentTime.hour;
      const isWorkHours = hour >= citizen.jobSchedule.startTime && hour < citizen.jobSchedule.endTime;
      if (isWorkHours) {
        currentActivity = 'WORK';
        nextActivity = 'FREE_TIME';
      } else {
        currentActivity = 'FREE_TIME';
        nextActivity = 'WORK';
      }
    }

    const schedulePerception: SchedulePerception = {
      currentTime: { ...currentTime },
      currentActivity,
      nextActivity
    };

    return {
      timestamp: new Date(),
      citizenId: citizen.id,
      self: selfPerception,
      location: locationPerception,
      environment: environmentPerception,
      nearbyResources,
      nearbyBuildings,
      nearbyEntities,
      schedule: schedulePerception
    };
  }

  /**
   * Builds the complete DecisionContext for the DecisionEngine.
   */
  public async buildDecisionContext(citizenId: string): Promise<import('@genesis/shared').DecisionContext> {
    const citizen = this.citizenService.getCitizen(citizenId);
    if (!citizen) {
      throw new Error(`PerceptionService: Citizen ${citizenId} not found.`);
    }

    const perception = await this.generateSnapshot(citizenId);

    return {
      citizenId,
      age: this.citizenService.getCitizenAge(citizen),
      vitalState: { ...citizen.vitalState },
      skills: [...citizen.skills],
      employmentStatus: citizen.employmentStatus,
      workplaceId: citizen.workplaceId,
      currentLocationId: citizen.locationId || '', // Assuming citizens must have a location
      currentDestinationId: citizen.activeRoute?.destinationId ?? null,
      simulationTime: new Date(), // Fallback, could be mapped from TimeEngine more precisely
      perception
    };
  }
}
