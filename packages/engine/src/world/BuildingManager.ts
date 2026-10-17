import { Building } from '@genesis/shared';
import { randomUUID } from 'crypto';

export class BuildingManager {
  private buildings: Map<string, Building> = new Map();

  public createBuilding(buildingData: Omit<Building, 'id' | 'roomIds' | 'width' | 'height' | 'createdAt' | 'updatedAt'> & { id?: string, width?: number, height?: number, createdAt?: Date, updatedAt?: Date }): Building {
    const building: Building = {
      ...buildingData,
      width: buildingData.width ?? 20,
      height: buildingData.height ?? 20,
      id: (buildingData as any).id || randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date(),
      roomIds: [],
    };
    this.buildings.set(building.id, building);
    return building;
  }

  public getBuilding(id: string): Building | undefined {
    return this.buildings.get(id);
  }

  public getAllBuildings(): Building[] {
    return Array.from(this.buildings.values());
  }

  public updateBuilding(id: string, updates: Partial<Omit<Building, 'id'>>): Building | undefined {
    const building = this.buildings.get(id);
    if (!building) return undefined;

    const updatedBuilding = { ...building, ...updates };
    this.buildings.set(id, updatedBuilding);
    return updatedBuilding;
  }

  public deleteBuilding(id: string): boolean {
    return this.buildings.delete(id);
  }

  public addRoom(buildingId: string, roomId: string): void {
    const building = this.buildings.get(buildingId);
    if (building && !building.roomIds.includes(roomId)) {
      building.roomIds.push(roomId);
    }
  }

  public removeRoom(buildingId: string, roomId: string): void {
    const building = this.buildings.get(buildingId);
    if (building) {
      building.roomIds = building.roomIds.filter((id: string) => id !== roomId);
    }
  }

  public setWaterConnection(buildingId: string, connected: boolean): boolean {
    const building = this.buildings.get(buildingId);
    if (!building) return false;
    building.metadata = {
      ...(building.metadata || {}),
      hasWaterConnection: connected
    };
    (building as any).hasWaterConnection = connected;
    return true;
  }

  public hasWaterConnection(buildingId: string): boolean {
    const building = this.buildings.get(buildingId);
    if (!building) return false;
    return building.metadata?.hasWaterConnection === true || (building as any).hasWaterConnection === true;
  }
}

