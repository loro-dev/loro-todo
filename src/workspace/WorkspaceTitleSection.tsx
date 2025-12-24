import { useMemo } from "react";
import type { ChangeEvent, RefObject } from "react";
import {
  MaterialSymbolsKeyboardArrowDown,
  MdiTrayArrowUp,
  MdiHelpCircleOutline,
  MdiTrayArrowDown,
  MdiLinkVariant,
  StreamlinePlumpRecycleBin2Remix,
} from "../icons";
import type { WorkspaceRecord } from "../workspace";

type WorkspaceTitleSectionProps = {
  displayedWorkspaceTitle: string;
  disabled: boolean;
  onTitleChange: (value: string) => void;
  titleContainerRef: RefObject<HTMLDivElement>;
  titleInputRef: RefObject<HTMLInputElement>;
  titleMeasureRef: RefObject<HTMLSpanElement>;
  dropdownButtonRef: RefObject<HTMLButtonElement>;
  showMenu: boolean;
  onToggleMenu: () => void;
  menuRef: RefObject<HTMLDivElement>;
  workspaceHex: string | null;
  workspaces: WorkspaceRecord[];
  onChooseWorkspace: (id: string) => void | Promise<void>;
  onCreateWorkspace: () => void | Promise<void>;
  onDeleteWorkspace: () => void;
  onJoinWorkspace: () => void | Promise<void>;
  onExportWorkspace: () => void;
  onRequestImport: () => void;
  importInputRef: RefObject<HTMLInputElement>;
  onImportFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
};

export function WorkspaceTitleSection({
  displayedWorkspaceTitle,
  disabled,
  onTitleChange,
  titleContainerRef,
  titleInputRef,
  titleMeasureRef,
  dropdownButtonRef,
  showMenu,
  onToggleMenu,
  menuRef,
  workspaceHex,
  workspaces,
  onChooseWorkspace,
  onCreateWorkspace,
  onDeleteWorkspace,
  onJoinWorkspace,
  onExportWorkspace,
  onRequestImport,
  importInputRef,
  onImportFileChange,
}: WorkspaceTitleSectionProps) {
  const workspaceOptions = useMemo(() => {
    const options: { id: string; name: string; isCurrent: boolean }[] = [];
    if (workspaceHex) {
      options.push({
        id: workspaceHex,
        name: displayedWorkspaceTitle || workspaceHex.slice(0, 16),
        isCurrent: true,
      });
    }
    for (const workspaceInfo of workspaces) {
      if (workspaceInfo.id === workspaceHex) continue;
      options.push({
        id: workspaceInfo.id,
        name:
          workspaceInfo.name ||
          workspaceInfo.label ||
          workspaceInfo.id.slice(0, 16),
        isCurrent: false,
      });
    }
    return options;
  }, [displayedWorkspaceTitle, workspaces, workspaceHex]);

  return (
    <div className="workspace-title" ref={titleContainerRef}>
      <input
        className="workspace-title-input"
        ref={titleInputRef}
        value={displayedWorkspaceTitle}
        onChange={(event) => {
          onTitleChange(event.currentTarget.value);
        }}
        placeholder="List name"
        disabled={disabled}
        aria-label="List name"
      />
      <span
        className="workspace-title-measure"
        ref={titleMeasureRef}
        aria-hidden
      >
        {displayedWorkspaceTitle || "Untitled List"}
      </span>
      <button
        className="title-dropdown btn-text"
        type="button"
        ref={dropdownButtonRef}
        onClick={onToggleMenu}
        aria-label="Switch list"
        title="Switch list"
        disabled={false}
      >
        <MaterialSymbolsKeyboardArrowDown />
      </button>
      {showMenu && (
        <div className="workspace-selector-pop" ref={menuRef} role="menu">
          <div className="ws-menu">
            {workspaceOptions.length === 0 && (
              <div className="ws-empty">No lists</div>
            )}
            {workspaceOptions.map(({ id, name, isCurrent }) => (
              <button
                key={id}
                className={`ws-item${isCurrent ? " current" : ""}`}
                onClick={() => {
                  void onChooseWorkspace(id);
                }}
                role="menuitem"
              >
                {name}
              </button>
            ))}
            <div className="ws-sep" />
            <button
              className="ws-action"
              onClick={() => {
                onExportWorkspace();
              }}
              role="menuitem"
              type="button"
            >
              <MdiTrayArrowUp className="ws-icon" aria-hidden />
              <span>Export list</span>
              <span
                className="ws-help-icon"
                title="Exports a .loro CRDT snapshot (loro.dev format)"
              >
                <MdiHelpCircleOutline aria-hidden />
              </span>
            </button>
            <button
              className="ws-action"
              onClick={() => {
                onRequestImport();
              }}
              role="menuitem"
              type="button"
            >
              <MdiTrayArrowDown className="ws-icon" aria-hidden />
              <span>Import list</span>
              <span
                className="ws-help-icon"
                title="Imports a .loro CRDT snapshot (loro.dev format) into this list"
              >
                <MdiHelpCircleOutline aria-hidden />
              </span>
            </button>
            <button
              className="ws-action"
              onClick={() => {
                void onJoinWorkspace();
              }}
              role="menuitem"
              type="button"
            >
              <MdiLinkVariant className="ws-icon" aria-hidden />
              Join by URL…
            </button>
            <button
              className="ws-action"
              onClick={() => {
                void onCreateWorkspace();
              }}
              role="menuitem"
            >
              ＋ New list…
            </button>
            {workspaceHex && (
              <button
                className="ws-action danger"
                onClick={() => {
                  onDeleteWorkspace();
                }}
                role="menuitem"
              >
                <StreamlinePlumpRecycleBin2Remix /> Delete current…
              </button>
            )}
          </div>
        </div>
      )}
      <input
        ref={importInputRef}
        type="file"
        accept=".loro,application/octet-stream"
        style={{ display: "none" }}
        onChange={(event) => {
          onImportFileChange(event);
        }}
      />
    </div>
  );
}
