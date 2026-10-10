import { prisma } from './prisma';

export class InventoryRepository {
  async getInventory(id: string) {
    return prisma.inventory.findUnique({
      where: { id },
      include: {
        items: true,
      }
    });
  }

  async getInventoryByOwner(ownerId: string) {
    return prisma.inventory.findFirst({
      where: { ownerId },
      include: {
        items: true,
      }
    });
  }

  async createInventory(data: any) {
    return prisma.inventory.create({ data });
  }

  async upsertItem(inventoryId: string, productId: string, quantity: number, unit: string, batchesJson?: string) {
    return prisma.inventoryItem.upsert({
      where: {
        inventoryId_productId: {
          inventoryId,
          productId
        }
      },
      update: {
        totalQuantity: { increment: quantity },
        availableQuantity: { increment: quantity },
        ...(batchesJson !== undefined && { batchesJson }),
      },
      create: {
        inventoryId,
        productId,
        totalQuantity: quantity,
        availableQuantity: quantity,
        unit,
        batchesJson,
      }
    });
  }

  async setItemExactQuantity(inventoryId: string, productId: string, quantity: number, unit: string, batchesJson?: string) {
    if (quantity <= 0) {
      return prisma.inventoryItem.deleteMany({
        where: { inventoryId, productId }
      });
    }

    return prisma.inventoryItem.upsert({
      where: {
        inventoryId_productId: {
          inventoryId,
          productId
        }
      },
      update: {
        totalQuantity: quantity,
        availableQuantity: quantity,
        ...(batchesJson !== undefined && { batchesJson }),
      },
      create: {
        inventoryId,
        productId,
        totalQuantity: quantity,
        availableQuantity: quantity,
        unit,
        batchesJson,
      }
    });
  }
}

export const inventoryRepository = new InventoryRepository();
