const actorTails = new Map<string, Promise<void>>();

export async function acquireActorLock(actorKey: string): Promise<() => void> {
  const previous = actorTails.get(actorKey) ?? Promise.resolve();
  let releaseGate!: () => void;
  const gate = new Promise<void>(resolve => { releaseGate = resolve; });
  const tail = previous.then(() => gate);
  actorTails.set(actorKey, tail);
  await previous;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    releaseGate();
    if (actorTails.get(actorKey) === tail) {
      void tail.finally(() => {
        if (actorTails.get(actorKey) === tail) actorTails.delete(actorKey);
      });
    }
  };
}