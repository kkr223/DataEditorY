import type { CodecDescriptor, DocumentSource, ExtensionModule } from '#lib/platform/index.ts';
import { DocumentHostProvider } from '#lib/platform/transport/provider.ts';
import type { DocumentHostTransport } from '#lib/platform/transport/types.ts';
import { CARD_COLLECTION_TYPE } from '#lib/modules/card/index.ts';

export const CDB_PROVIDER_ID = 'cdb.provider';
export const CDB_CODEC_ID = 'cdb.codec';

export const createCdbModule = (transport: DocumentHostTransport): ExtensionModule => {
  const cdbCodec: CodecDescriptor = {
    id: CDB_CODEC_ID,
    typeId: CARD_COLLECTION_TYPE,
    filePatterns: ['.cdb'],
    canCreate: true,
    async decode(source: DocumentSource) {
      return {
        typeId: CARD_COLLECTION_TYPE,
        schemaVersion: 1,
        title: source.name,
        providerId: CDB_PROVIDER_ID,
      };
    },
    async encode() {
      // The document host provider owns CDB bytes; runtime prefers provider.save.
      throw new Error('CDB documents are saved through the document host provider');
    },
  };

  return {
    id: 'cdb',
    dependencies: ['card'],
    providers: [{
      id: CDB_PROVIDER_ID,
      typeIds: [CARD_COLLECTION_TYPE],
      create: () => new DocumentHostProvider(CDB_PROVIDER_ID, transport),
    }],
    codecs: [cdbCodec],
  };
};
