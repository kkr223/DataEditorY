export type CapabilityId =
  | 'db-editor'
  | 'script-editor'
  | 'settings'
  | 'package'
  | 'merge'
  | 'card-image'
  | 'ai';

export interface CapabilityDescriptor {
  id: CapabilityId;
  enabled: boolean;
  dependencies: CapabilityId[];
  actions: string[];
  uiMounts: string[];
}
