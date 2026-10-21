import { loadWorkspaceMetadata, saveWorkspaceMetadata, type WorkspaceMetadata } from '$lib/native/metadataApi';
import { getCdbPathIdentity } from '$lib/core/workspace/cdbPathIdentity';

const METADATA_SAVE_DELAY_MS = 700;

export const workspaceMetadataState = $state({
  cdbPath: '',
  metadata: null as WorkspaceMetadata | null,
  ready: false,
  error: null as string | null,
  saveErrors: {} as Record<string, { path: string; message: string }>,
});

export const isCurrentMetadataPath = (path: string) => (
  workspaceMetadataState.ready
  && getCdbPathIdentity(workspaceMetadataState.cdbPath) === getCdbPathIdentity(path)
);

let loadSequence = 0;
export function captureWorkspaceMetadataScope() {
  const sequence = loadSequence;
  const path = workspaceMetadataState.cdbPath;
  return () => sequence === loadSequence && isCurrentMetadataPath(path);
}
const pendingSaves = new Map<string, { timer: ReturnType<typeof setTimeout>; run: () => Promise<WorkspaceMetadata> }>();
const inflightSaves = new Map<string, Promise<WorkspaceMetadata>>();
type MetadataWrite = { path: string; metadata: WorkspaceMetadata; sourcePath?: string };
const unsavedWrites = new Map<string, MetadataWrite>();

function retainMetadataWrite(path: string, metadata: WorkspaceMetadata, sourcePath?: string): MetadataWrite {
  const write = { path, metadata, sourcePath };
  unsavedWrites.set(getCdbPathIdentity(path), write);
  return write;
}

async function persistMetadataWrite(write: MetadataWrite) {
  const key = getCdbPathIdentity(write.path);
  try {
    const saved = await saveWorkspaceMetadata(write.path, write.metadata, write.sourcePath);
    if (unsavedWrites.get(key) === write) {
      unsavedWrites.delete(key);
      delete workspaceMetadataState.saveErrors[key];
    }
    return saved;
  } catch (error) {
    if (unsavedWrites.get(key) === write) {
      workspaceMetadataState.saveErrors[key] = { path: write.path, message: String(error) };
    }
    throw error;
  }
}

function cancelScheduledMetadataSave(path: string) {
  const key = getCdbPathIdentity(path);
  const pending = pendingSaves.get(key);
  if (!pending) return;
  clearTimeout(pending.timer);
  pendingSaves.delete(key);
}

function queueMetadataOperation(path: string, operation: () => Promise<WorkspaceMetadata>) {
  const key = getCdbPathIdentity(path);
  const previous = inflightSaves.get(key);
  const saving = (previous ? previous.catch(() => undefined) : Promise.resolve())
    .then(operation);
  inflightSaves.set(key, saving);
  const cleanup = () => {
    if (inflightSaves.get(key) === saving) inflightSaves.delete(key);
  };
  void saving.then(cleanup, cleanup);
  return saving;
}

function saveMetadataInOrder(path: string, metadata: WorkspaceMetadata, sourcePath?: string) {
  const write = retainMetadataWrite(path, metadata, sourcePath);
  return queueMetadataOperation(path, () => persistMetadataWrite(write));
}

export async function updateWorkspaceMetadataForPath(
  path: string,
  mutate: (metadata: WorkspaceMetadata) => WorkspaceMetadata,
) {
  if (isCurrentMetadataPath(path)) {
    updateWorkspaceMetadata(mutate);
    return;
  }
  // Enqueue the entire transaction now, after any pending snapshot save.
  const flushed = flushMetadataSave(path);
  void flushed.catch(() => undefined);
  await queueMetadataOperation(path, async () => {
    await flushed;
    // A queued load may have activated this workspace before our turn.
    if (isCurrentMetadataPath(path)) {
      updateWorkspaceMetadata(mutate);
      return workspaceMetadataState.metadata!;
    }
    const metadata = await loadWorkspaceMetadata(path);
    return persistMetadataWrite(retainMetadataWrite(path, mutate(metadata)));
  });
}

async function flushMetadataSave(path: string) {
  const key = getCdbPathIdentity(path);
  const pending = pendingSaves.get(key);
  if (pending) {
    cancelScheduledMetadataSave(path);
    await pending.run();
  } else if (inflightSaves.has(key)) {
    await inflightSaves.get(key);
  } else {
    const write = unsavedWrites.get(key);
    if (write) await saveMetadataInOrder(write.path, write.metadata, write.sourcePath);
  }
}

export async function flushAllWorkspaceMetadataSaves() {
  while (pendingSaves.size || inflightSaves.size || unsavedWrites.size) {
    const paths = new Set([...pendingSaves.keys(), ...inflightSaves.keys(), ...unsavedWrites.keys()]);
    await Promise.all([...paths].map(flushMetadataSave));
  }
}

function scheduleMetadataSave() {
  const path = workspaceMetadataState.cdbPath;
  const metadata = workspaceMetadataState.metadata;
  if (!path || !metadata || !workspaceMetadataState.ready) return;

  cancelScheduledMetadataSave(path);
  const sequence = loadSequence;
  const run = () => saveMetadataInOrder(path, metadata)
    .then((saved) => {
      if (sequence === loadSequence && workspaceMetadataState.metadata === metadata) {
        workspaceMetadataState.metadata = saved;
      }
      return saved;
    });
  const timer = setTimeout(() => {
    pendingSaves.delete(getCdbPathIdentity(path));
    void run().catch((error) => console.error('Failed to save workspace metadata', error));
  }, METADATA_SAVE_DELAY_MS);
  pendingSaves.set(getCdbPathIdentity(path), { timer, run });
}

export function loadWorkspaceMetadataForPath(path: string) {
  const normalizedPath = path.trim();
  const sequence = ++loadSequence;
  workspaceMetadataState.cdbPath = normalizedPath;
  workspaceMetadataState.metadata = null;
  workspaceMetadataState.ready = false;
  workspaceMetadataState.error = null;

  if (!normalizedPath) return;

  const flushed = flushMetadataSave(normalizedPath);
  void flushed.catch(() => undefined);
  return queueMetadataOperation(normalizedPath, async () => {
    await flushed;
    const metadata = await loadWorkspaceMetadata(normalizedPath);
    // Publish inside the queue so the next mutation sees the active state.
    if (sequence === loadSequence) {
      workspaceMetadataState.metadata = metadata;
      workspaceMetadataState.ready = true;
    }
    return metadata;
  })
    .catch((error) => {
      if (sequence !== loadSequence) return;
      console.error('Failed to load workspace metadata', error);
      workspaceMetadataState.error = String(error);
    });
}

export async function copyWorkspaceMetadataForSaveAs(sourcePath: string, destinationPath: string) {
  const source = sourcePath.trim();
  const destination = destinationPath.trim();
  if (!source || !destination) return;

  const sourceIdentity = getCdbPathIdentity(source);
  const destinationIdentity = getCdbPathIdentity(destination);
  if (sourceIdentity === destinationIdentity) return;

  await flushMetadataSave(source);

  const currentIdentity = workspaceMetadataState.ready
    ? getCdbPathIdentity(workspaceMetadataState.cdbPath)
    : '';
  const hasLoadedSource = currentIdentity === sourceIdentity
    && workspaceMetadataState.metadata;
  const metadata = hasLoadedSource
    ? workspaceMetadataState.metadata as WorkspaceMetadata
    : await loadWorkspaceMetadata(source);

  if (hasLoadedSource) {
    cancelScheduledMetadataSave(source);
    const savedSource = await saveMetadataInOrder(source, metadata);
    if (currentIdentity === getCdbPathIdentity(workspaceMetadataState.cdbPath)
      && workspaceMetadataState.metadata === metadata) {
      workspaceMetadataState.metadata = savedSource;
    }
  }

  await flushMetadataSave(destination);
  await saveMetadataInOrder(destination, {
    ...metadata,
    cdbPath: destination,
  }, source);
}

export function updateWorkspaceMetadata(
  mutate: (metadata: WorkspaceMetadata) => WorkspaceMetadata,
) {
  const path = workspaceMetadataState.cdbPath;
  if (!path || !workspaceMetadataState.ready) return;

  const base = workspaceMetadataState.metadata ?? { version: 1, cdbPath: path };
  workspaceMetadataState.metadata = mutate(base);
  scheduleMetadataSave();
}
