import type { DocumentRuntimeSnapshot } from './types';
import { documentRuntime } from './appRuntime';

const initial = documentRuntime.snapshot;

export const documentState = $state<DocumentRuntimeSnapshot>({
  documents: initial.documents,
  activeDocumentId: initial.activeDocumentId,
});

export const startDocumentStateSync = () => documentRuntime.subscribe((snapshot) => {
  documentState.documents = snapshot.documents;
  documentState.activeDocumentId = snapshot.activeDocumentId;
});

export const getActiveDataDocument = () => (
  documentState.documents.find((document) => document.id === documentState.activeDocumentId) ?? null
);
