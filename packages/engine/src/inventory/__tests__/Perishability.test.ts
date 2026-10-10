import { InventoryManager } from '../InventoryManager';
import { TimeUtils } from '../../utils/TimeUtils';

describe('Inventory Perishability', () => {
  let manager: InventoryManager;

  beforeEach(() => {
    manager = new InventoryManager();
    manager.createInventory('inv-1', 'owner-1', 1000);
    manager.createInventory('inv-2', 'owner-2', 1000);
  });

  test('should handle perishable batch addition and calculate usable quantity correctly', () => {
    const currentTime = 1000;
    const expiryTime = 2000;
    
    // Add 100 perishable items
    manager.addItemQuantity('inv-1', 'wheat', 100, 'kg', currentTime, expiryTime);
    
    const inv = manager.getInventory('inv-1')!;
    expect(inv.items['wheat'].totalQuantity).toBe(100);
    expect(inv.items['wheat'].batches!.length).toBe(1);
    
    // Check usable quantity before expiry
    expect(manager.getUsableQuantity('inv-1', 'wheat', 1500)).toBe(100);
    
    // Check usable quantity after expiry
    expect(manager.getUsableQuantity('inv-1', 'wheat', 2500)).toBe(0);
  });

  test('should mix perishable and non-perishable/fresh batches', () => {
    manager.addItemQuantity('inv-1', 'wheat', 100, 'kg', 1000, 2000); // Expires at 2000
    manager.addItemQuantity('inv-1', 'wheat', 50, 'kg', 1500, undefined); // Never expires
    manager.addItemQuantity('inv-1', 'wheat', 50, 'kg', 1800, 2500); // Expires at 2500

    expect(manager.getUsableQuantity('inv-1', 'wheat', 1000)).toBe(200);
    expect(manager.getUsableQuantity('inv-1', 'wheat', 2100)).toBe(100); // First batch expired
    expect(manager.getUsableQuantity('inv-1', 'wheat', 2600)).toBe(50); // Second batch still valid
  });

  test('transferItemQuantity should preserve batch metadata', () => {
    manager.addItemQuantity('inv-1', 'wheat', 100, 'kg', 1000, 2000);
    manager.addItemQuantity('inv-1', 'wheat', 50, 'kg', 1500, undefined);

    // Transfer 120 items from inv-1 to inv-2
    const success = manager.transferItemQuantity('inv-1', 'inv-2', 'wheat', 120, 'kg');
    expect(success).toBe(true);

    const inv2 = manager.getInventory('inv-2')!;
    expect(inv2.items['wheat'].totalQuantity).toBe(120);
    expect(inv2.items['wheat'].batches!.length).toBe(2);

    // First batch in inv-2 should have quantity 100 and expiry 2000
    expect(inv2.items['wheat'].batches![0].quantity).toBe(100);
    expect(inv2.items['wheat'].batches![0].expiryAt).toBe(2000);

    // Second batch in inv-2 should have quantity 20
    expect(inv2.items['wheat'].batches![1].quantity).toBe(20);
    expect(inv2.items['wheat'].batches![1].expiryAt).toBeUndefined();

    // Check inv-1 remaining
    const inv1 = manager.getInventory('inv-1')!;
    expect(inv1.items['wheat'].totalQuantity).toBe(30);
    expect(inv1.items['wheat'].batches![0].quantity).toBe(30);
  });

  test('removeExpiredItems should physically remove expired batches', () => {
    manager.addItemQuantity('inv-1', 'wheat', 100, 'kg', 1000, 2000); // Expires at 2000
    manager.addItemQuantity('inv-1', 'wheat', 50, 'kg', 1500, undefined); // Never expires
    manager.addItemQuantity('inv-1', 'wheat', 50, 'kg', 1800, 2500); // Expires at 2500

    // Remove expired at 2100
    manager.removeExpiredItems(2100);

    const inv1 = manager.getInventory('inv-1')!;
    expect(inv1.items['wheat'].totalQuantity).toBe(100); // 100 removed
    expect(inv1.items['wheat'].batches!.length).toBe(2);
    
    // Check remaining batches
    expect(inv1.items['wheat'].batches![0].expiryAt).toBeUndefined();
    expect(inv1.items['wheat'].batches![1].expiryAt).toBe(2500);
  });
});
