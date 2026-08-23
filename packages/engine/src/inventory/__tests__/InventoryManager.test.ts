import { InventoryManager } from '../InventoryManager';

describe('InventoryManager', () => {
  let manager: InventoryManager;

  beforeEach(() => {
    manager = new InventoryManager();
  });

  test('should create inventory', () => {
    const inv = manager.createInventory('inv-1', 'owner-1', 1000);
    expect(inv.id).toBe('inv-1');
    expect(inv.storageCapacity).toBe(1000);
    expect(manager.getInventory('inv-1')).toBeDefined();
  });

  test('should add and remove items within capacity', () => {
    manager.createInventory('inv-1', 'owner-1', 100);
    
    // Add 60 kg of wheat
    const added = manager.addItemQuantity('inv-1', 'wheat', 60, 'kg');
    expect(added).toBe(true);
    
    let inv = manager.getInventory('inv-1')!;
    expect(inv.items['wheat'].totalQuantity).toBe(60);
    expect(inv.items['wheat'].availableQuantity).toBe(60);

    // Try to add 50 kg more (exceeds 100 total capacity)
    const addedMore = manager.addItemQuantity('inv-1', 'wheat', 50, 'kg');
    expect(addedMore).toBe(false);

    // Remove 20 kg
    const removed = manager.removeItemQuantity('inv-1', 'wheat', 20);
    expect(removed).toBe(true);
    
    inv = manager.getInventory('inv-1')!;
    expect(inv.items['wheat'].totalQuantity).toBe(40);
  });

  test('should handle reservations', () => {
    manager.createInventory('inv-1', 'owner-1', 100);
    manager.addItemQuantity('inv-1', 'wheat', 60, 'kg');

    const reserved = manager.reserveItemQuantity('inv-1', 'wheat', 20);
    expect(reserved).toBe(true);

    const inv = manager.getInventory('inv-1')!;
    expect(inv.items['wheat'].availableQuantity).toBe(40);
    expect(inv.items['wheat'].reservedQuantity).toBe(20);

    // Cannot remove more than available
    const removed = manager.removeItemQuantity('inv-1', 'wheat', 50);
    expect(removed).toBe(false);

    // Consume reserved
    const consumed = manager.consumeReservedItem('inv-1', 'wheat', 20);
    expect(consumed).toBe(true);

    expect(inv.items['wheat'].totalQuantity).toBe(40);
    expect(inv.items['wheat'].reservedQuantity).toBe(0);
  });
});
