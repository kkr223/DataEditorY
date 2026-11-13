import type { WebFilePersistence } from './webFilePersistence.ts';

/** Browser file bytes and persistent identities shared by imports and downloads. */
export class WebFileStore {
  private readonly files = new Map<string, Uint8Array>();
  private readonly workspaceIds = new Map<string, string>();

  constructor(
    private readonly storage: () => Pick<Storage, 'getItem' | 'setItem'>,
    private readonly persistence?: WebFilePersistence,
  ) {}

  private async fingerprint(path: string, bytes: Uint8Array) {
    const name = path.split(/[\\/]/).at(-1) ?? '';
    const digest = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>);
    const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${encodeURIComponent(name)}.${hash}`;
  }

  async import(file: File) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const fingerprint = await this.fingerprint(file.name, bytes);
    const path = `vfs://imports/${fingerprint}/${file.name}`;
    await this.persistence?.write(path, bytes);
    this.files.set(path, bytes);
    return path;
  }

  private async find(path: string) {
    const bytes = this.files.get(path) ?? await this.persistence?.read(path);
    if (bytes) this.files.set(path, bytes);
    return bytes;
  }

  async read(path: string) {
    const bytes = await this.find(path);
    if (!bytes) throw new Error(`File is not available: ${path}`);
    return bytes;
  }

  async workspaceId(path: string): Promise<string> {
    const cached = this.workspaceIds.get(path);
    if (cached) return cached;
    const fingerprint = await this.fingerprint(path, await this.read(path));
    const id = this.storage().getItem(`dataeditory.web.file.${fingerprint}`) ?? fingerprint;
    this.workspaceIds.set(path, id);
    return id;
  }

  async write(path: string, bytes: Uint8Array) {
    const fingerprint = await this.fingerprint(path, bytes);
    const id = await this.exists(path)
      ? await this.workspaceId(path)
      : this.storage().getItem(`dataeditory.web.file.${fingerprint}`) ?? fingerprint;
    // Retain identity across edits so reimporting a downloaded revision restores its workspace.
    await this.persistence?.write(path, bytes);
    this.storage().setItem(`dataeditory.web.file.${fingerprint}`, id);
    this.workspaceIds.set(path, id);
    this.files.set(path, bytes);
  }

  async exists(path: string) {
    return (await this.find(path)) !== undefined;
  }

  list(path: string) {
    return [...this.files.keys()].filter((key) => key.startsWith(path));
  }
}
