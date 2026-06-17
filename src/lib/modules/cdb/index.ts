import type { CodecDescriptor, ExtensionModule } from '$lib/platform';
import { TauriDocumentProvider, saveProviderDocument } from '$lib/infrastructure/tauri/documentHost';
import { CARD_COLLECTION_TYPE } from '$lib/modules/card';

export const CDB_PROVIDER_ID = 'cdb.provider';
export const CDB_CODEC_ID = 'cdb.codec';

const cdbCodec: CodecDescriptor = {
  id: CDB_CODEC_ID,
  typeId: CARD_COLLECTION_TYPE,
  filePatterns: ['.cdb'],
  canCreate: true,
  async decode(source) {
    return {
      typeId: CARD_COLLECTION_TYPE,
      schemaVersion: 1,
      title: source.name,
      providerId: CDB_PROVIDER_ID,
    };
  },
  async encode(document, destination) {
    await saveProviderDocument(CDB_PROVIDER_ID, document.record.id, destination);
  },
};

export const cdbModule: ExtensionModule = {
  id: 'cdb',
  dependencies: ['card'],
  providers: [{
    id: CDB_PROVIDER_ID,
    typeIds: [CARD_COLLECTION_TYPE],
    create: () => new TauriDocumentProvider(CDB_PROVIDER_ID),
  }],
  codecs: [cdbCodec],
};
