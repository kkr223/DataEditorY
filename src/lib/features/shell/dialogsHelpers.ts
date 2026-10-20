import { getCdbPathIdentity } from '$lib/core/workspace/cdbPathIdentity';

export function buildMergeAnalysisKey(
  sourcePaths: string[],
  includeImages: boolean,
  includeScripts: boolean,
) {
  return JSON.stringify({
    sourcePaths,
    includeImages,
    includeScripts,
  });
}

export function isNewOutputPath(
  outputPath: string,
  occupiedPaths: string[],
) {
  const target = getCdbPathIdentity(outputPath);
  return !occupiedPaths.some((path) => getCdbPathIdentity(path) === target);
}
