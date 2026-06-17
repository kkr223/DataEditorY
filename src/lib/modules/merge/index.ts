import type { ExtensionModule } from '$lib/platform';
import {
  analyzeCdbMerge,
  collectMergeSourcesFromFolder,
  executeCdbMerge,
} from '$lib/infrastructure/tauri/commands';

export const MERGE_COLLECT_COMMAND_ID = 'merge.collect-sources';
export const MERGE_ANALYZE_COMMAND_ID = 'merge.analyze';
export const MERGE_EXECUTE_COMMAND_ID = 'merge.execute';

export const mergeModule: ExtensionModule = {
  id: 'merge',
  dependencies: ['card', 'cdb'],
  commands: [{
    id: MERGE_COLLECT_COMMAND_ID,
    async execute(_context, rawInput) {
      const input = rawInput as { directoryPath: string };
      return collectMergeSourcesFromFolder(input.directoryPath);
    },
  }, {
    id: MERGE_ANALYZE_COMMAND_ID,
    async execute(_context, rawInput) {
      const input = rawInput as {
        sourcePaths: string[];
        includeImages: boolean;
        includeScripts: boolean;
      };
      return analyzeCdbMerge(
        input.sourcePaths,
        input.includeImages,
        input.includeScripts,
      );
    },
  }, {
    id: MERGE_EXECUTE_COMMAND_ID,
    async execute(_context, rawInput) {
      return executeCdbMerge(rawInput as {
        sourcePaths: string[];
        outputDir: string;
        includeImages: boolean;
        includeScripts: boolean;
      });
    },
  }],
};
