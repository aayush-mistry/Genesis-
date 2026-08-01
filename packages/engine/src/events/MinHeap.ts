import { SimulationEvent } from './SimulationEvent';
import { TimeUtils } from '../utils/TimeUtils';

export class MinHeap {
  private heap: SimulationEvent[] = [];

  /**
   * Priority values to map EventPriority to a sortable integer
   */
  private readonly priorityMap: Record<string, number> = {
    'Critical': 0,
    'High': 1,
    'Normal': 2,
    'Low': 3
  };

  public insert(event: SimulationEvent): void {
    this.heap.push(event);
    this.bubbleUp(this.heap.length - 1);
  }

  public extractMin(): SimulationEvent | undefined {
    if (this.heap.length === 0) return undefined;
    if (this.heap.length === 1) return this.heap.pop();

    const min = this.heap[0];
    this.heap[0] = this.heap.pop() as SimulationEvent;
    this.bubbleDown(0);
    return min;
  }

  public peek(): SimulationEvent | undefined {
    return this.heap.length > 0 ? this.heap[0] : undefined;
  }

  public size(): number {
    return this.heap.length;
  }

  public clear(): void {
    this.heap = [];
  }

  public getEvents(): SimulationEvent[] {
    // Return a shallow copy of the heap array (not guaranteed strictly sorted, just heap ordered)
    return [...this.heap];
  }

  /**
   * Removes an event from the heap by its ID.
   * Runs in O(n) as it must search the array.
   */
  public removeById(id: string): boolean {
    const index = this.heap.findIndex(e => e.id === id);
    if (index === -1) return false;
    
    // Swap with the last element and pop
    if (index === this.heap.length - 1) {
      this.heap.pop();
    } else {
      this.heap[index] = this.heap.pop() as SimulationEvent;
      // After swapping, we might need to bubble up or down
      this.bubbleUp(index);
      this.bubbleDown(index);
    }
    return true;
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (this.compareEvents(this.heap[index], this.heap[parentIndex]) >= 0) {
        break; // Order is correct
      }
      this.swap(index, parentIndex);
      index = parentIndex;
    }
  }

  private bubbleDown(index: number): void {
    const length = this.heap.length;
    while (index < length) {
      let smallest = index;
      const leftChild = 2 * index + 1;
      const rightChild = 2 * index + 2;

      if (leftChild < length && this.compareEvents(this.heap[leftChild], this.heap[smallest]) < 0) {
        smallest = leftChild;
      }

      if (rightChild < length && this.compareEvents(this.heap[rightChild], this.heap[smallest]) < 0) {
        smallest = rightChild;
      }

      if (smallest === index) {
        break;
      }

      this.swap(index, smallest);
      index = smallest;
    }
  }

  private swap(i: number, j: number): void {
    const temp = this.heap[i];
    this.heap[i] = this.heap[j];
    this.heap[j] = temp;
  }

  /**
   * Compares two events based on their scheduled time.
   * If scheduled times are equal, higher priority wins.
   * Returns negative if e1 should come before e2.
   */
  private compareEvents(e1: SimulationEvent, e2: SimulationEvent): number {
    const timeDiff = TimeUtils.compare(e1.scheduledTime, e2.scheduledTime);
    if (timeDiff !== 0) return timeDiff;

    // Time is equal, check priority
    const p1 = this.priorityMap[e1.priority];
    const p2 = this.priorityMap[e2.priority];
    
    if (p1 !== p2) return p1 - p2;

    // Both time and priority are equal, preserve insertion order (or rely on stable handling)
    return 0; // Not stable, but acceptable for this use-case
  }
}
