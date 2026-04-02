export function buildMergeAnalysisKey(aPath: string, bPath: string) {
  return `${aPath}::${bPath}`;
}

export function isNewOutputPath(
  outputPath: string,
  occupiedPaths: string[],
) {
  return !occupiedPaths.includes(outputPath);
}
