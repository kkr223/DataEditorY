type ScriptDocumentWriter = (tabId: string, content: string) => Promise<void>;

type ScriptDocumentSyncOptions = {
  delayMs: number;
  onError?: (error: unknown, tabId: string) => void;
};

export function createScriptDocumentSync(
  write: ScriptDocumentWriter,
  options: ScriptDocumentSyncOptions,
) {
  const pending = new Map<string, string>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const inflight = new Map<string, Promise<void>>();

  const clearTimer = (tabId: string) => {
    const timer = timers.get(tabId);
    if (!timer) return;
    clearTimeout(timer);
    timers.delete(tabId);
  };

  const flush = (tabId: string): Promise<void> => {
    clearTimer(tabId);

    const current = inflight.get(tabId);
    if (current) {
      return current.then(() => (pending.has(tabId) ? flush(tabId) : undefined));
    }
    if (!pending.has(tabId)) return Promise.resolve();

    let task: Promise<void>;
    task = (async () => {
      while (pending.has(tabId)) {
        clearTimer(tabId);
        const content = pending.get(tabId) as string;
        pending.delete(tabId);
        try {
          await write(tabId, content);
        } catch (error) {
          if (!pending.has(tabId)) pending.set(tabId, content);
          throw error;
        }
      }
    })().finally(() => {
      if (inflight.get(tabId) === task) inflight.delete(tabId);
    });

    inflight.set(tabId, task);
    return task;
  };

  const schedule = (tabId: string, content: string) => {
    pending.set(tabId, content);
    clearTimer(tabId);
    timers.set(tabId, setTimeout(() => {
      timers.delete(tabId);
      void flush(tabId).catch((error) => options.onError?.(error, tabId));
    }, options.delayMs));
  };

  const hasPending = () => pending.size > 0 || inflight.size > 0;

  return {
    flush,
    hasPending,
    schedule,
  };
}
