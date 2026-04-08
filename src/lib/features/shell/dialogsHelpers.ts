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
  return !occupiedPaths.includes(outputPath);
}
