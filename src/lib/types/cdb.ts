export type {
  AnalyzeCdbMergeRequest,
  AnalyzeCdbMergeResponse,
  CardDataEntry,
  CollectMergeSourcesFromFolderRequest,
  CopyCardAssetsRequest,
  CreateCdbFromCardsRequest,
  DeleteCardsRequest,
  ExecuteCdbMergeRequest,
  ExecuteCdbMergeResponse,
  GetCardsByIdsRequest,
  MergeSourceItemDto,
  MergeSourcePlanDto,
  ModifyCardsRequest,
  OpenCdbTabResponse,
  QueryCardsRequest,
  SearchCardsPageRequest,
  SearchCardsPageResponse,
  UndoModifyOperationRequest,
} from './generated/cdb';

type GeneratedMergeSourceItem = import('./generated/cdb').MergeSourceItemDto;

export type MergeSourceItem = Omit<GeneratedMergeSourceItem, 'cardTotal'> & {
  cardTotal?: GeneratedMergeSourceItem['cardTotal'];
};
export type MergeSourcePlanItem = import('./generated/cdb').MergeSourcePlanDto;
