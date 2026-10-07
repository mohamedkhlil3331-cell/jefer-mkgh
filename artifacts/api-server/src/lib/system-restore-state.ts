let restoreActive = false;
let inFlightApiRequests = 0;
const drainWaiters = new Set<() => void>();

export function beginSystemRestore(): boolean {
  if (restoreActive) return false;
  restoreActive = true;
  return true;
}

export function endSystemRestore(): void {
  restoreActive = false;
}

export function isSystemRestoreActive(): boolean {
  return restoreActive;
}

export function trackApiRequest(): () => void {
  inFlightApiRequests += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    inFlightApiRequests = Math.max(0, inFlightApiRequests - 1);
    if (inFlightApiRequests <= 1) {
      for (const resolve of drainWaiters) resolve();
      drainWaiters.clear();
    }
  };
}

export async function waitForOtherApiRequests(timeoutMs = 30_000): Promise<boolean> {
  if (inFlightApiRequests <= 1) return true;
  return new Promise(resolve => {
    let settled = false;
    const finish = (drained: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      drainWaiters.delete(onDrain);
      resolve(drained);
    };
    const onDrain = () => finish(inFlightApiRequests <= 1);
    const timer = setTimeout(() => finish(false), timeoutMs);
    drainWaiters.add(onDrain);
    onDrain();
  });
}