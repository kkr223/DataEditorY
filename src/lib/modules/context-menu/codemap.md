# src/lib/modules/context-menu/

Declares the shared context-menu feature in the base module composition (also inherited by extra). Depends on `card`, `cdb`, and `lua`. The shell hosts the popup and selected-card dialogs; existing workbenches provide their contextual actions. Implementation: `features/context-menu/`, `features/script-editor/tabMenu.ts`, and `features/script-editor/contextMenu.ts`.
