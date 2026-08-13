export async function refreshAfterMutation(
  refreshActive: (() => Promise<boolean>) | null,
  refreshCached: () => Promise<boolean>,
): Promise<boolean> {
  try {
    if (refreshActive) {
      await refreshActive();
      return true;
    }
    return await refreshCached();
  } catch (err) {
    console.error('Failed to refresh search results after mutation:', err);
    return false;
  }
}
