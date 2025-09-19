import type { RefObject } from "react";
import { LucideUndo2, MdiBroom, IcSharpHistory, LucideInfo } from "../icons";

type WorkspaceToolbarProps = {
    onUndo: () => void;
    onRedo: () => void;
    disableUndo: boolean;
    disableRedo: boolean;
    onClearCompleted: () => void;
    clearCompletedDisabled: boolean;
    onShare: () => void;
    onToggleHistory: () => void;
    showHistory: boolean;
    onToggleHelp: () => void;
    showHelp: boolean;
    helpButtonRef: RefObject<HTMLButtonElement>;
};

export function WorkspaceToolbar({
    onUndo,
    onRedo,
    disableUndo,
    disableRedo,
    onClearCompleted,
    clearCompletedDisabled,
    onShare,
    onToggleHistory,
    showHistory,
    onToggleHelp,
    showHelp,
    helpButtonRef,
}: WorkspaceToolbarProps) {
    return (
        <div className="toolbar">
            <button
                className="btn btn-secondary btn-icon-only"
                onClick={onUndo}
                disabled={disableUndo}
                aria-label="Undo"
                title="Undo"
            >
                <LucideUndo2 className="btn-icon" aria-hidden />
            </button>
            <button
                className="btn btn-secondary btn-icon-only"
                onClick={onRedo}
                disabled={disableRedo}
                aria-label="Redo"
                title="Redo"
            >
                <LucideUndo2
                    className="btn-icon"
                    style={{ transform: "scaleX(-1)" }}
                    aria-hidden
                />
            </button>
            <button
                className="btn btn-secondary btn-icon-only"
                onClick={onClearCompleted}
                disabled={clearCompletedDisabled}
                aria-label="Clear completed"
                title="Clear completed"
            >
                <MdiBroom className="btn-icon" aria-hidden />
            </button>
            <button
                className="btn btn-secondary push-right"
                onClick={onShare}
                title="Copy invite URL"
            >
                Share
            </button>
            <button
                className={"btn btn-secondary " + (showHistory ? "" : "btn-icon-only")}
                onClick={onToggleHistory}
                aria-expanded={showHistory}
                aria-controls="workspace-history"
            >
                {showHistory ? "Hide History" : <IcSharpHistory className="btn-icon" />}
            </button>
            <button
                className={"btn btn-secondary " + (showHelp ? "" : "btn-icon-only")}
                ref={helpButtonRef}
                type="button"
                onClick={onToggleHelp}
                aria-label="About Loro"
                aria-expanded={showHelp}
                aria-controls="loro-help-panel"
                aria-haspopup="dialog"
                title={showHelp ? "Hide help" : "About Loro"}
            >
                {showHelp ? "Hide Help" : <LucideInfo className="btn-icon" aria-hidden />}
            </button>
        </div>
    );
}
