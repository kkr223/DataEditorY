export type {
  AppSettingsPayload,
  CardScriptDocument,
  CardScriptInfo,
  SaveAppSettingsRequest,
  TaskProgressPayload,
  ZipPackageInfo,
} from './generated/app';

export type BackgroundTaskProgressEvent =
  import('./generated/app').TaskProgressPayload & {
    task: 'package' | 'merge';
  };
