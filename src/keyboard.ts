import {
    type SelectionActions,
    type SelectionState,
} from "./selection";

export type KeyboardBindings = {
    getSelectionState: () => SelectionState;
    actions: SelectionActions;
    toggleItem: (cid: string) => void;
    undo: () => void;
    redo: () => void;
    isMacLike: boolean;
    moveItemUp: (cid: string) => void;
    moveItemDown: (cid: string) => void;
};

function getSelectedItemCid(state: SelectionState): string | null {
    if (state.type === "item") {
        return state.cid;
    }
    return null;
}

function shouldIgnoreForArrows(state: SelectionState): boolean {
    if (state.type === "item" && state.mode === "editing") return true;
    if (state.type === "create" && state.mode === "editing") return true;
    return false;
}

function scrollPreventDefault(event: KeyboardEvent): void {
    event.preventDefault();
}

export function registerKeyboardHandlers(bindings: KeyboardBindings): () => void {
    if (typeof window === "undefined") {
        return () => undefined;
    }

    const onKeyDown = (event: KeyboardEvent) => {
        if (event.defaultPrevented && !event.metaKey && !event.ctrlKey) return;
        if (event.isComposing) return;

        const key = event.key.toLowerCase();
        const {
            getSelectionState,
            actions,
            toggleItem,
            undo,
            redo,
            isMacLike,
            moveItemUp,
            moveItemDown,
        } = bindings;
        const state = getSelectionState();

        const isPrimaryModifier = isMacLike ? event.metaKey : event.ctrlKey;
        const isRedoShortcut =
            (isMacLike && event.metaKey && event.shiftKey && key === "z") ||
            (!isMacLike && event.ctrlKey && event.shiftKey && key === "z") ||
            (!isMacLike && event.ctrlKey && !event.shiftKey && key === "y");

        const isEditingSelection =
            (state.type === "item" && state.mode === "editing") ||
            (state.type === "create" && state.mode === "editing");

        if (isEditingSelection) {
            if (isPrimaryModifier && !event.shiftKey && !event.altKey && key === "z") {
                return;
            }
            if (isRedoShortcut) {
                return;
            }
        }

        if (isPrimaryModifier && !event.shiftKey && !event.altKey && key === "z") {
            scrollPreventDefault(event);
            undo();
            return;
        }

        if (isRedoShortcut) {
            scrollPreventDefault(event);
            redo();
            return;
        }

        if ((event.metaKey || event.ctrlKey) && event.shiftKey && !event.altKey) {
            if (key === "arrowup") {
                const selectedCid = getSelectedItemCid(state);
                if (selectedCid) {
                    scrollPreventDefault(event);
                    actions.requestReorderFollow("auto");
                    moveItemUp(selectedCid);
                }
                return;
            }
            if (key === "arrowdown") {
                const selectedCid = getSelectedItemCid(state);
                if (selectedCid) {
                    scrollPreventDefault(event);
                    actions.requestReorderFollow("auto");
                    moveItemDown(selectedCid);
                }
                return;
            }
        }

        if ((event.metaKey || event.ctrlKey) && key === "enter") {
            const selectedCid = getSelectedItemCid(state);
            if (selectedCid) {
                scrollPreventDefault(event);
                actions.requestReorderFollow();
                toggleItem(selectedCid);
                if (state.type === "item" && state.mode === "editing") {
                    actions.exitEditing();
                }
                if (state.type === "item" && state.mode === "preview") {
                    actions.focusItemPreview(selectedCid);
                }
            }
            return;
        }

        if (key === "escape" && !event.metaKey && !event.ctrlKey && !event.altKey) {
            if (state.type === "item" && state.mode === "editing") {
                scrollPreventDefault(event);
                actions.exitEditing();
                return;
            }
            if (state.type === "create" && state.mode === "editing") {
                scrollPreventDefault(event);
                actions.exitEditing();
                return;
            }
            if (state.type !== "none") {
                scrollPreventDefault(event);
                actions.clear();
                return;
            }
            return;
        }

        if (!event.metaKey && !event.ctrlKey && !event.altKey) {
            if (key === "enter") {
                if (state.type === "none") {
                    scrollPreventDefault(event);
                    actions.focusCreateEditing();
                    return;
                }
                if (state.type === "create" && state.mode === "preview") {
                    scrollPreventDefault(event);
                    actions.enterEditing();
                    return;
                }
                if (state.type === "item" && state.mode === "preview") {
                    scrollPreventDefault(event);
                    actions.enterEditing();
                    return;
                }
                return;
            }

            if (key === "arrowdown") {
                if (shouldIgnoreForArrows(state)) {
                    return;
                }
                scrollPreventDefault(event);
                actions.selectNext();
                return;
            }

            if (key === "arrowup") {
                if (shouldIgnoreForArrows(state)) {
                    return;
                }
                scrollPreventDefault(event);
                actions.selectPrev();
                return;
            }
        }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
        window.removeEventListener("keydown", onKeyDown);
    };
}
