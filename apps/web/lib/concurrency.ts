/** Caps the number of searches running at the same time on this instance. */
export class ConcurrencyGate {
  private active = 0;

  constructor(private readonly max: number) {}

  get size(): number {
    return this.active;
  }

  /** Returns a release function, or `null` when the server is busy. */
  tryAcquire(): (() => void) | null {
    if (this.active >= this.max) return null;
    this.active++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active--;
    };
  }
}
