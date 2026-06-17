export const WORKBENCH_ACTION_EVENT = 'dataeditory:workbench-action';

export type WorkbenchActionEvent = {
  id: string;
};

export const dispatchWorkbenchAction = (id: string) => {
  window.dispatchEvent(new CustomEvent<WorkbenchActionEvent>(
    WORKBENCH_ACTION_EVENT,
    { detail: { id } },
  ));
};

export const listenWorkbenchAction = (
  id: string,
  handler: () => void | Promise<void>,
) => {
  const listener = (event: Event) => {
    const action = event as CustomEvent<WorkbenchActionEvent>;
    if (action.detail?.id === id) {
      void handler();
    }
  };
  window.addEventListener(WORKBENCH_ACTION_EVENT, listener);
  return () => window.removeEventListener(WORKBENCH_ACTION_EVENT, listener);
};
