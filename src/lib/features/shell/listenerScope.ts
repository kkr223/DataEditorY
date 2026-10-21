export function createListenerScope() {
  let disposed = false;
  const unlisteners = new Set<() => void>();
  return {
    get disposed() { return disposed; },
    add(registration: Promise<() => void>) {
      void registration.then(unlisten => {
        if (disposed) unlisten();
        else unlisteners.add(unlisten);
      }).catch(error => console.error('Failed to register shell listener', error));
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const unlisten of unlisteners) {
        try { unlisten(); }
        catch (error) { console.error('Failed to remove shell listener', error); }
      }
      unlisteners.clear();
    },
  };
}
