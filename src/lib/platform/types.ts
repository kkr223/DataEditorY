export type DocumentId = string;
export type DataTypeId = string;
export type ProviderId = string;
export type CodecId = string;
export type WorkbenchId = string;

export type DocumentSource = {
  uri: string;
  name: string;
  path?: string;
  mediaType?: string;
};

export type DocumentRef = {
  relation: string;
  typeId: DataTypeId;
  documentId?: DocumentId;
  sourceUri?: string;
  metadata?: Record<string, unknown>;
};

export type DocumentRecord = {
  id: DocumentId;
  typeId: DataTypeId;
  schemaVersion: number;
  title: string;
  source: DocumentSource | null;
  codecId: CodecId | null;
  providerId: ProviderId;
  savePolicy: 'manual' | 'automatic';
  dirty: boolean;
  revision: number;
  savedRevision: number;
  references: DocumentRef[];
  metadata: Record<string, unknown>;
};

export type CommandResult<T = unknown> = {
  changed: boolean;
  value?: T;
};

export type ProviderOpenRequest = {
  documentId: DocumentId;
  typeId: DataTypeId;
  source: DocumentSource | null;
  input?: unknown;
};

export type ProviderCreateRequest = {
  documentId: DocumentId;
  typeId: DataTypeId;
  initialData?: unknown;
};

export interface DataProvider {
  open(request: ProviderOpenRequest): Promise<Record<string, unknown> | void>;
  create?(request: ProviderCreateRequest): Promise<Record<string, unknown> | void>;
  query(documentId: DocumentId, query: unknown): Promise<unknown>;
  execute(documentId: DocumentId, command: unknown): Promise<CommandResult>;
  snapshot?(documentId: DocumentId): Promise<unknown>;
  undo?(documentId: DocumentId): Promise<CommandResult>;
  dispose(documentId: DocumentId): Promise<void>;
}

export type ProviderDescriptor = {
  id: ProviderId;
  typeIds: DataTypeId[];
  savePolicy?: 'manual' | 'automatic';
  create(): DataProvider;
};

export type DataTypeDefinition<T = unknown> = {
  typeId: DataTypeId;
  version: number;
  validate(value: unknown): T;
  migrate?(value: unknown, fromVersion: number): T;
};

export type OpenedDocument = {
  typeId: DataTypeId;
  schemaVersion: number;
  title: string;
  providerId: ProviderId;
  providerInput?: unknown;
  references?: DocumentRef[];
  metadata?: Record<string, unknown>;
};

export type DocumentAccess = {
  record: DocumentRecord;
  query<T = unknown>(query: unknown): Promise<T>;
  snapshot<T = unknown>(): Promise<T>;
};

export type CodecContext = {
  readText(path: string): Promise<string>;
  writeText(path: string, content: string): Promise<void>;
  readBinary(path: string): Promise<Uint8Array>;
  writeBinary(path: string, content: Uint8Array): Promise<void>;
};

export type CodecDescriptor = {
  id: CodecId;
  typeId: DataTypeId;
  filePatterns: string[];
  canCreate?: boolean;
  decode(source: DocumentSource, context: CodecContext): Promise<OpenedDocument>;
  encode(document: DocumentAccess, destination: DocumentSource, context: CodecContext): Promise<void>;
};

export type WorkbenchDescriptor = {
  id: WorkbenchId;
  acceptedTypeIds: DataTypeId[];
  component: () => Promise<unknown>;
};

export type PlatformCommandContext = {
  getDocument(id: DocumentId): DocumentRecord | null;
  query<T = unknown>(id: DocumentId, query: unknown): Promise<T>;
  execute<T = unknown>(id: DocumentId, command: unknown): Promise<CommandResult<T>>;
};

export type CommandDescriptor = {
  id: string;
  execute(context: PlatformCommandContext, input: unknown): Promise<unknown>;
};

export type SettingsSectionDescriptor = {
  id: string;
  order?: number;
  component: () => Promise<unknown>;
};

export type WorkbenchContributionDescriptor = {
  id: string;
  workbenchId: WorkbenchId;
  slot: string;
  order?: number;
  metadata?: Record<string, unknown>;
  component: () => Promise<unknown>;
};

export type GlobalToolDescriptor = {
  id: string;
  labelKey: string;
  order?: number;
  requiresActiveCdb?: boolean;
  component: () => Promise<unknown>;
};

export type TaskRunnerDescriptor = {
  kind: string;
  run(input: unknown, context?: { taskId: string }): Promise<unknown>;
  cancel?(taskId: string): boolean | Promise<boolean>;
};

export type ExtensionModule = {
  id: string;
  dependencies?: string[];
  dataTypes?: DataTypeDefinition[];
  providers?: ProviderDescriptor[];
  codecs?: CodecDescriptor[];
  workbenches?: WorkbenchDescriptor[];
  commands?: CommandDescriptor[];
  settingsSections?: SettingsSectionDescriptor[];
  workbenchContributions?: WorkbenchContributionDescriptor[];
  globalTools?: GlobalToolDescriptor[];
  taskRunners?: TaskRunnerDescriptor[];
};

export type DocumentRuntimeSnapshot = {
  documents: DocumentRecord[];
  activeDocumentId: DocumentId | null;
};
