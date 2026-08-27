import { DecisionContext } from '@genesis/shared';
import { MarketEngine } from '../../market/MarketEngine';
import { InventoryManager } from '../../inventory/InventoryManager';
import { PerceptionSnapshot } from '@genesis/shared';
import { Coordinate } from '@genesis/shared';

export interface StoreCandidate {
  id: string;
  type: string;
  coordinates: Coordinate;
  distance: number;
}

export interface RankedStore extends StoreCandidate {
  score: number;
  price: number;
  availableQuantity: number;
  quality: number;
  travelDistance: number;
  breakdown: any;
}

export class StoreRanker {
  constructor(
    private marketEngine: MarketEngine,
    private inventoryManager: InventoryManager
  ) {}

  public rankStores(context: DecisionContext, stores: StoreCandidate[], productId: string, requiredQuantity: number): RankedStore[] {
    const rankedStores: RankedStore[] = [];
    const personality = context.personality;
    // Assuming simulationTime is available and it's a SimulationTime object, get an approx second timestamp
    const currentTime = context.simulationTime ? (context.simulationTime as any).year * 31536000 : Date.now()/1000;

    // Weights derived from personality (normalized 0-1)
    const wPrice = (personality?.priceSensitivity || 50) / 100;
    const wQuality = (personality?.qualityPreference || 50) / 100;
    const wDistance = (personality?.conveniencePreference || 50) / 100;

    // Find the min/max values for normalization
    let minPrice = Infinity;
    let maxPrice = 0;
    let maxDistance = 0;

    // First pass to find limits
    const validStores: (StoreCandidate & { price: number; availableQuantity: number })[] = [];
    for (const store of stores) {
      // Need to find the store's inventory. We assume the store id matches its inventory owner id (or workplace id)
      // Usually workplace ID is used for inventory owner ID
      const inventory = this.inventoryManager.getInventoryByOwner(store.id);
      if (!inventory) continue;

      const availableQuantity = this.inventoryManager.getUsableQuantity(inventory.id, productId, currentTime);
      if (availableQuantity <= 0) continue; // Skip empty stores

      const price = this.marketEngine.calculateEffectivePrice(productId, 'DEFAULT', 10); // Simplified

      if (price < minPrice) minPrice = price;
      if (price > maxPrice) maxPrice = price;
      if (store.distance > maxDistance) maxDistance = store.distance;

      validStores.push({
        ...store,
        price,
        availableQuantity
      });
    }

    if (maxPrice === 0) maxPrice = 1;
    if (maxDistance === 0) maxDistance = 1;

    // Second pass to score
    for (const store of validStores) {
      // Normalize values (0 to 1)
      // For price and distance, lower is better. For quality and availability, higher is better.
      const priceScore = 1 - ((store.price - minPrice) / (maxPrice - minPrice || 1));
      const distanceScore = 1 - (store.distance / maxDistance);
      const qualityScore = 0.5; // Mock quality score
      const availabilityScore = Math.min(1, store.availableQuantity / requiredQuantity);

      // We combine them based on personality weights
      let finalScore = (priceScore * wPrice) + (distanceScore * wDistance) + (qualityScore * wQuality) + (availabilityScore * 0.5);

      rankedStores.push({
        id: store.id,
        type: store.type,
        coordinates: store.coordinates,
        distance: store.distance,
        price: store.price,
        availableQuantity: store.availableQuantity,
        quality: qualityScore,
        travelDistance: store.distance,
        score: finalScore,
        breakdown: {
          priceScore,
          distanceScore,
          qualityScore,
          availabilityScore
        }
      });
    }

    // Sort descending by score
    return rankedStores.sort((a, b) => b.score - a.score);
  }
}
