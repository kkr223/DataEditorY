type Translate = (key: string, options?: Record<string, unknown>) => string;

export type ScriptGenerationStage =
  | 'collecting_references'
  | 'requesting_model'
  | 'running_tools'
  | 'finalizing_response';

export function getScriptGenerationStageLabel(
  t: Translate,
  stage: ScriptGenerationStage | '',
) {
  switch (stage) {
    case 'collecting_references':
      return t('editor.script_stage_collecting_references');
    case 'requesting_model':
      return t('editor.script_stage_requesting_model');
    case 'running_tools':
      return t('editor.script_stage_running_tools');
    case 'finalizing_response':
      return t('editor.script_stage_finalizing_response');
    default:
      return t('editor.script_generating');
  }
}
