import { MemoryDocumentProvider } from './memoryProvider';
import type {
  CommandResult,
  ProviderCreateRequest,
  ProviderOpenRequest,
} from './types';

type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export class PersistentMemoryProvider extends MemoryDocumentProvider {
  constructor(
    private readonly namespace: string,
    private readonly storage: KeyValueStorage,
  ) {
    super();
  }

  override async open(request: ProviderOpenRequest) {
    const persisted = this.storage.getItem(this.key(request.documentId));
    await super.open({
      ...request,
      input: persisted ? JSON.parse(persisted) : request.input,
    });
  }

  override async create(request: ProviderCreateRequest) {
    await super.create(request);
    await this.persist(request.documentId);
  }

  override async execute(documentId: string, command: unknown): Promise<CommandResult> {
    const result = await super.execute(documentId, command);
    if (result.changed) {
      await this.persist(documentId);
    }
    return result;
  }

  override async dispose(documentId: string) {
    await this.persist(documentId);
    await super.dispose(documentId);
  }

  private async persist(documentId: string) {
    const snapshot = await this.snapshot(documentId);
    this.storage.setItem(this.key(documentId), JSON.stringify(snapshot));
  }

  private key(documentId: string) {
    return `${this.namespace}:${documentId}`;
  }
}
