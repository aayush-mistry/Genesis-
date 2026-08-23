import { JobPosition, JobType, SkillType, Workplace, WorkplaceType } from '@genesis/shared';
import { WorldEngine } from '../WorldEngine';
import { WorkplaceRepository } from '../repositories/WorkplaceRepository';

let workplaceIdCounter = 1;

export class WorkplaceGenerator {
  constructor(
    private worldEngine: WorldEngine,
    private repository: WorkplaceRepository
  ) {}

  public generateWorkplaces(): void {
    const regions = this.worldEngine.regionManager.getAllRegions();
    
    // 1. Minimum Global Infrastructure (e.g. 2 Hospitals, 2 Schools, 2 Police, 2 Fire)
    // We will place these in the first few cities found.
    const allCities = this.worldEngine.cityManager.getAllCities();
    
    let hospitalsCreated = 0;
    let schoolsCreated = 0;
    let policeCreated = 0;
    let fireCreated = 0;

    for (const city of allCities) {
      if (hospitalsCreated < 2) {
        this.createPublicService(city.regionId, city.id, WorkplaceType.HOSPITAL, JobType.DOCTOR, SkillType.MEDICINE);
        hospitalsCreated++;
      }
      if (schoolsCreated < 2) {
        this.createPublicService(city.regionId, city.id, WorkplaceType.SCHOOL, JobType.TEACHER, SkillType.EDUCATION);
        schoolsCreated++;
      }
      if (policeCreated < 2) {
        this.createPublicService(city.regionId, city.id, WorkplaceType.POLICE_STATION, JobType.POLICE_OFFICER, SkillType.GENERAL_LABOR); // Assuming generalized police skill
        policeCreated++;
      }
      if (fireCreated < 2) {
        this.createPublicService(city.regionId, city.id, WorkplaceType.FIRE_STATION, JobType.FIREFIGHTER, SkillType.GENERAL_LABOR);
        fireCreated++;
      }
    }

    // 2. Resource-driven generation (Farm, Fishing, Mine, Forest)
    // In a real implementation this would query the ResourceEngine.
    // For Phase 3.5, we approximate based on region data.
    for (const region of regions) {
      // Generate Wholesale centers for the region (minimum 2 per populated region)
      // We will place them in the first city found in the region.
      const regionCities = allCities.filter(c => c.regionId === region.id);
      if (regionCities.length > 0) {
        const city = regionCities[0];
        this.createUrbanWorkplace(region.id, city.id, WorkplaceType.WHOLESALE, JobType.WHOLESALER, SkillType.COMMERCE, 20);
        this.createUrbanWorkplace(region.id, city.id, WorkplaceType.WHOLESALE, JobType.WHOLESALER, SkillType.COMMERCE, 20);
      }

      // Assuming climate or metadata has clues.
      // We will generate 1 Farm per region as a base if it's not Arctic.
      if (region.climate !== 'Arctic') {
        this.createResourceWorkplace(region.id, region.id, WorkplaceType.FARM, JobType.FARMER, SkillType.AGRICULTURE, 10);
      }
      
      // Coastal gets fishing
      if (region.climate === 'Coastal') {
        this.createResourceWorkplace(region.id, region.id, WorkplaceType.FISHING_SITE, JobType.FISHERMAN, SkillType.FISHING, 5);
      }

      // Mountain gets mining
      if (region.climate === 'Mountain') {
        this.createResourceWorkplace(region.id, region.id, WorkplaceType.MINE, JobType.MINER, SkillType.MINING, 8);
      }
    }

    // 3. Urban/Building-driven generation (Offices, Shops, Factories)
    for (const city of allCities) {
      const districts = this.worldEngine.districtManager.getAllDistricts().filter(d => d.cityId === city.id);
      
      for (const district of districts) {
        const buildings = this.worldEngine.buildingManager.getAllBuildings().filter(b => b.districtId === district.id);
        
        for (const building of buildings) {
          if (building.type === 'OFFICE') {
            this.createUrbanWorkplace(city.regionId, building.id, WorkplaceType.OFFICE, JobType.OFFICE_WORKER, SkillType.ADMINISTRATION, Math.floor(building.capacity * 0.8));
          } else if (building.type === 'STORE') {
             this.createUrbanWorkplace(city.regionId, building.id, WorkplaceType.SHOP, JobType.SHOPKEEPER, SkillType.COMMERCE, 4);
             this.createUrbanWorkplace(city.regionId, building.id, WorkplaceType.BUSINESS, JobType.SALESPERSON, SkillType.COMMERCE, 6);
          } else if (building.type === 'FACTORY') {
             this.createUrbanWorkplace(city.regionId, building.id, WorkplaceType.FACTORY, JobType.FACTORY_WORKER, SkillType.GENERAL_LABOR, Math.floor(building.capacity * 0.9));
             this.createUrbanWorkplace(city.regionId, building.id, WorkplaceType.FACTORY, JobType.ENGINEER, SkillType.ENGINEERING, Math.floor(building.capacity * 0.1));
          }
        }
      }
    }
  }

  private createPublicService(regionId: string, locationId: string, type: WorkplaceType, jobType: JobType, reqSkill: SkillType): void {
    this.createWorkplace(regionId, locationId, type, jobType, reqSkill, 5); // Base capacity 5 for essential services
  }

  private createResourceWorkplace(regionId: string, locationId: string, type: WorkplaceType, jobType: JobType, reqSkill: SkillType, capacity: number): void {
    this.createWorkplace(regionId, locationId, type, jobType, reqSkill, capacity);
  }

  private createUrbanWorkplace(regionId: string, locationId: string, type: WorkplaceType, jobType: JobType, reqSkill: SkillType, capacity: number): void {
     if (capacity <= 0) return;
     this.createWorkplace(regionId, locationId, type, jobType, reqSkill, capacity);
  }

  private createWorkplace(regionId: string, locationId: string, type: WorkplaceType, jobType: JobType, reqSkill: SkillType, capacity: number): void {
    const id = `wp-${workplaceIdCounter.toString().padStart(6, '0')}`;
    workplaceIdCounter++;

    const positions: JobPosition[] = [];
    for (let i = 0; i < capacity; i++) {
      const schedule = this.getDefaultScheduleForJob(jobType);
      
      positions.push({
        id: `${id}-pos-${i}`,
        workplaceId: id,
        type: jobType,
        requiredSkills: { [reqSkill]: 20 }, // Require level 20 by default
        occupantId: null,
        schedule
      });
    }

    const workplace: Workplace = {
      id,
      type,
      locationId,
      regionId,
      capacity,
      occupiedPositions: 0,
      vacancies: capacity,
      positions
    };

    this.repository.create(workplace);
  }

  private getDefaultScheduleForJob(jobType: JobType) {
    switch (jobType) {
      case JobType.FARMER: return { startTime: 6, endTime: 14 };
      case JobType.MINER: return { startTime: 7, endTime: 15 };
      case JobType.OFFICE_WORKER: return { startTime: 9, endTime: 17 };
      case JobType.TEACHER: return { startTime: 8, endTime: 15 };
      case JobType.SALESPERSON: return { startTime: 10, endTime: 18 };
      default: return { startTime: 9, endTime: 17 };
    }
  }
}
