import { useCallback, useEffect } from "react";
import { useAppSelection } from "./selection";
import { registerKeyboardHandlers } from "./keyboard";

type KeyboardShortcutsBridgeProps = {
    toggleItem: (cid: string) => void;
    undo: () => void;
    redo: () => void;
    isMacLike: boolean;
    moveItemUp: (cid: string) => void;
    moveItemDown: (cid: string) => void;
};

export function KeyboardShortcutsBridge({
    toggleItem,
    undo,
    redo,
    isMacLike,
    moveItemUp,
    moveItemDown,
}: KeyboardShortcutsBridgeProps): null {
    const selection = useAppSelection();
    const { actions, ref } = selection;
    const getSelectionState = useCallback(() => ref.current, [ref]);

    useEffect(() => {
        const cleanup = registerKeyboardHandlers({
            getSelectionState,
            actions,
            toggleItem,
            undo,
            redo,
            isMacLike,
            moveItemUp,
            moveItemDown,
        });
        return () => cleanup();
    }, [
        getSelectionState,
        actions,
        toggleItem,
        undo,
        redo,
        isMacLike,
        moveItemUp,
        moveItemDown,
    ]);

    return null;
}
