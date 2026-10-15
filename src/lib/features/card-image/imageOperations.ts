export function createCardImageOperations(getContext: () => string) {
  let generation = 0;
  let disposed = false;
  const requests = new Map<string, number>();
  return {
    begin(kind: string) {
      const context = getContext();
      const owner = generation;
      const request = (requests.get(kind) ?? 0) + 1;
      requests.set(kind, request);
      return () => !disposed && generation === owner && context === getContext() && requests.get(kind) === request;
    },
    reset() { generation++; requests.clear(); },
    dispose() { disposed = true; generation++; requests.clear(); },
  };
}
