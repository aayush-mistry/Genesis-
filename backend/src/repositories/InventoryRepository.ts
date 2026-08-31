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

  async createInventory(data: any) {
    return prisma.inventory.create({ data });
  }

  async upsertItem(inventoryId: string, productId: string, quantity: number, unit: string) {
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
      },
      create: {
        inventoryId,
        productId,
        totalQuantity: quantity,
        availableQuantity: quantity,
        unit,
      }
    });
  }
}

export const inventoryRepository = new InventoryRepository();
