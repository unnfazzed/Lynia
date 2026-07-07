export interface Fix {
  orderId: string;
  lat: number;
  lng: number;
}

/**
 * Holds the rider's location fix while the socket is DOWN, coalesced to just the freshest one.
 *
 * A rider on the road loses signal constantly. The GPS keeps producing fixes the whole time, so the
 * question is what to do with the ones that land while we can't send them. Socket.IO's own buffer would
 * queue every single fix and then flood the entire stale trail up the moment the link returns — wasteful
 * on a just-recovered uplink, and pointless, because the customer's map only cares where the rider is
 * NOW, not the breadcrumb of where they were during the dead-zone. So we don't emit while disconnected;
 * we keep only the latest fix here and flush that one on reconnect. One coordinate, freshest wins.
 *
 * Pure and framework-free so the coalescing is unit-tested without a device or a live socket.
 */
export class PendingFix {
  private pending: Fix | null = null;

  /** Remember the newest fix produced while offline, discarding any older one still waiting. */
  hold(fix: Fix): void {
    this.pending = fix;
  }

  /** Take the held fix (if any) to flush on reconnect, clearing it so it's sent exactly once. */
  take(): Fix | null {
    const fix = this.pending;
    this.pending = null;
    return fix;
  }

  get pendingFix(): Fix | null {
    return this.pending;
  }
}
