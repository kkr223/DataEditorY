import { normalizeFilePattern, matchesFilePattern } from './filePatterns';
import type {
  CodecDescriptor,
  DataTypeDefinition,
  ExtensionModule,
  GlobalToolDescriptor,
  ProviderDescriptor,
  SettingsSectionDescriptor,
  WorkbenchDescriptor,
  WorkbenchContributionDescriptor,
  TaskRunnerDescriptor,
} from './types';

const addUnique = <T>(
  target: Map<string, T>,
  id: string,
  value: T,
  kind: string,
) => {
  if (target.has(id)) {
    throw new Error(`Duplicate ${kind} id: ${id}`);
  }
  target.set(id, value);
};

export class ExtensionRegistry {
  readonly modules = new Map<string, ExtensionModule>();
  readonly dataTypes = new Map<string, DataTypeDefinition>();
  readonly providers = new Map<string, ProviderDescriptor>();
  readonly codecs = new Map<string, CodecDescriptor>();
  readonly workbenches = new Map<string, WorkbenchDescriptor>();
  readonly settingsSections = new Map<string, SettingsSectionDescriptor>();
  readonly workbenchContributions = new Map<string, WorkbenchContributionDescriptor>();
  readonly globalTools = new Map<string, GlobalToolDescriptor>();
  readonly taskRunners = new Map<string, TaskRunnerDescriptor>();

  private readonly codecsByPattern = new Map<string, CodecDescriptor>();

  constructor(modules: ExtensionModule[]) {
    for (const module of modules) {
      addUnique(this.modules, module.id, module, 'module');
    }
    this.validateModuleDependencies();
    for (const module of modules) {
      this.registerModule(module);
    }
    this.validateReferences();
  }

  findCodecForSource(source: string) {
    const matches = [...this.codecsByPattern.entries()]
      .filter(([pattern]) => matchesFilePattern(source, pattern))
      .sort(([left], [right]) => right.length - left.length);
    return matches[0]?.[1] ?? null;
  }

  findWorkbench(typeId: string) {
    return [...this.workbenches.values()]
      .find((workbench) => workbench.acceptedTypeIds.includes(typeId)) ?? null;
  }

  findWorkbenchContributions(workbenchId: string, slot: string) {
    return [...this.workbenchContributions.values()]
      .filter((contribution) => (
        contribution.workbenchId === workbenchId
        && contribution.slot === slot
      ))
      .sort((left, right) => (left.order ?? 0) - (right.order ?? 0));
  }

  findSettingsSections() {
    return [...this.settingsSections.values()]
      .sort((left, right) => (left.order ?? 0) - (right.order ?? 0));
  }

  findGlobalTools() {
    return [...this.globalTools.values()]
      .sort((left, right) => (left.order ?? 0) - (right.order ?? 0));
  }

  private validateModuleDependencies() {
    for (const module of this.modules.values()) {
      for (const dependency of module.dependencies ?? []) {
        if (!this.modules.has(dependency)) {
          throw new Error(`Module ${module.id} requires missing module ${dependency}`);
        }
      }
    }
  }

  private registerModule(module: ExtensionModule) {
    for (const dataType of module.dataTypes ?? []) {
      addUnique(this.dataTypes, dataType.typeId, dataType, 'data type');
    }
    for (const provider of module.providers ?? []) {
      addUnique(this.providers, provider.id, provider, 'provider');
    }
    for (const codec of module.codecs ?? []) {
      addUnique(this.codecs, codec.id, codec, 'codec');
      for (const rawPattern of codec.filePatterns) {
        const pattern = normalizeFilePattern(rawPattern);
        const existing = this.codecsByPattern.get(pattern);
        if (existing) {
          throw new Error(`Codec pattern ${pattern} is registered by ${existing.id} and ${codec.id}`);
        }
        this.codecsByPattern.set(pattern, codec);
      }
    }
    for (const workbench of module.workbenches ?? []) {
      addUnique(this.workbenches, workbench.id, workbench, 'workbench');
    }
    for (const section of module.settingsSections ?? []) {
      addUnique(this.settingsSections, section.id, section, 'settings section');
    }
    for (const contribution of module.workbenchContributions ?? []) {
      addUnique(
        this.workbenchContributions,
        contribution.id,
        contribution,
        'workbench contribution',
      );
    }
    for (const tool of module.globalTools ?? []) {
      addUnique(this.globalTools, tool.id, tool, 'global tool');
    }
    for (const runner of module.taskRunners ?? []) {
      addUnique(this.taskRunners, runner.kind, runner, 'task runner');
    }
  }

  private validateReferences() {
    for (const provider of this.providers.values()) {
      for (const typeId of provider.typeIds) {
        if (!this.dataTypes.has(typeId)) {
          throw new Error(`Provider ${provider.id} references unknown data type ${typeId}`);
        }
      }
    }
    for (const codec of this.codecs.values()) {
      if (!this.dataTypes.has(codec.typeId)) {
        throw new Error(`Codec ${codec.id} references unknown data type ${codec.typeId}`);
      }
    }
    for (const workbench of this.workbenches.values()) {
      for (const typeId of workbench.acceptedTypeIds) {
        if (!this.dataTypes.has(typeId)) {
          throw new Error(`Workbench ${workbench.id} references unknown data type ${typeId}`);
        }
      }
    }
    for (const contribution of this.workbenchContributions.values()) {
      if (!this.workbenches.has(contribution.workbenchId)) {
        throw new Error(
          `Workbench contribution ${contribution.id} references unknown workbench ${contribution.workbenchId}`,
        );
      }
    }
  }
}
