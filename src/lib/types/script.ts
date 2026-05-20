export type CardScriptInfo = {
  path: string;
  exists: boolean;
};

export type CardScriptDocument = CardScriptInfo & {
  content: string;
};
