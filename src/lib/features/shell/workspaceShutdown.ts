import type { DocumentRuntime } from '$lib/platform/runtime';

export async function closeDocumentsForWindowExit(
  runtime: Pick<DocumentRuntime, 'snapshot' | 'close'>,
  flushMetadata: () => Promise<void>,
) {
  await flushMetadata();
  // Native provider.close rolls back unsaved asset renames before the process exits.
  for (const document of runtime.snapshot.documents) {
    await runtime.close(document.id, true);
  }
  await flushMetadata();
}
