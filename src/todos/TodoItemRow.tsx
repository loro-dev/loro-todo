import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import type {
    CSSProperties,
    PointerEvent as ReactPointerEvent,
} from "react";
import { useAppSelection } from "../selection";
import { TodoTextInput } from "../TodoTextInput";
import { StreamlinePlumpRecycleBin2Remix } from "../icons";
import { getCollaboratorColorForId } from "../collaboratorColors";
import type { Todo } from "./types";

type PointerHandler = (
    cid: string,
    event: ReactPointerEvent<HTMLLIElement>,
) => void;

type TodoItemRowProps = {
    todo: Todo;
    onTextChange: (cid: string, value: string) => void;
    onDoneChange: (cid: string, done: boolean) => void;
    onDelete: (cid: string) => void;
    dragging: boolean;
    onManualPointerDown?: PointerHandler;
    onManualPointerMove?: PointerHandler;
    onManualPointerUp?: PointerHandler;
    onManualPointerCancel?: PointerHandler;
    detached: boolean;
    onHeightChange?: (cid: string, height: number) => void;
    onRowRefChange?: (cid: string, element: HTMLLIElement | null) => void;
    style?: CSSProperties;
};

export function TodoItemRow({
    todo,
    onTextChange,
    onDoneChange,
    onDelete,
    dragging,
    onManualPointerDown,
    onManualPointerMove,
    onManualPointerUp,
    onManualPointerCancel,
    detached,
    onHeightChange,
    onRowRefChange,
    style,
}: TodoItemRowProps) {
    const inputRef = useRef<HTMLDivElement | null>(null);
    const rowRef = useRef<HTMLLIElement | null>(null);
    const touchSkipChangeRef = useRef<boolean>(false);
    const [localText, setLocalText] = useState<string>(todo.text);
    const sanitizeSingleLine = useCallback((value: string): string => {
        return value.replace(/\r/g, "").replace(/\n/g, " ");
    }, []);

    const {
        state: selectionState,
        actions: selectionActions,
        remotePeers,
        remotePeerColors,
    } = useAppSelection();
    const isSelected =
        selectionState.type === "item" && selectionState.cid === todo.$cid;
    const isEditing = isSelected && selectionState.mode === "editing";

    const remoteSelectors = useMemo(
        () =>
            Object.entries(remotePeers).filter(([, selection]) => {
                return selection.cid === todo.$cid;
            }),
        [remotePeers, todo.$cid],
    );

    const remoteSelectorDots = useMemo(
        () =>
            remoteSelectors.map(([peerId]) => {
                const color =
                    remotePeerColors[peerId] ?? getCollaboratorColorForId(peerId);
                return (
                    <span
                        key={peerId}
                        className="todo-collab-dot"
                        style={{ backgroundColor: color }}
                    />
                );
            }),
        [remoteSelectors, remotePeerColors],
    );

    const handleEditorChange = useCallback(
        (next: string, shouldCommit: boolean) => {
            const sanitized = sanitizeSingleLine(next);
            setLocalText(sanitized);
            if (shouldCommit) {
                onTextChange(todo.$cid, sanitized);
            }
        },
        [onTextChange, sanitizeSingleLine, todo.$cid],
    );

    useEffect(() => {
        const element = inputRef.current;
        const isFocused =
            typeof document !== "undefined" && element
                ? document.activeElement === element
                : false;
        if (!isFocused) {
            setLocalText(sanitizeSingleLine(todo.text));
        }
    }, [sanitizeSingleLine, todo.text]);

    const isDone = todo.status === "done";

    useLayoutEffect(() => {
        const element = rowRef.current;
        if (!element || !onHeightChange) return;
        const report = () => onHeightChange(todo.$cid, element.offsetHeight);
        report();
        let ro: ResizeObserver | null = null;
        if (typeof ResizeObserver !== "undefined") {
            ro = new ResizeObserver(() => report());
            ro.observe(element);
        }
        return () => {
            if (ro) ro.disconnect();
        };
    }, [onHeightChange, todo.$cid, localText, isDone]);

    useEffect(() => {
        onRowRefChange?.(todo.$cid, rowRef.current);
        return () => onRowRefChange?.(todo.$cid, null);
    }, [onRowRefChange, todo.$cid]);

    const focusItemPreview = useCallback(() => {
        selectionActions.focusItemPreview(todo.$cid);
    }, [selectionActions, todo.$cid]);

    const focusItemEditing = useCallback(() => {
        selectionActions.focusItemEditing(todo.$cid);
        const element = inputRef.current;
        if (element && typeof document !== "undefined") {
            window.requestAnimationFrame(() => {
                const text = element.textContent ?? "";
                const length = text.length;
                const selection = window.getSelection();
                if (!selection) return;
                const range = document.createRange();
                if (element.firstChild) {
                    const childLength = element.firstChild.textContent?.length ?? 0;
                    const offset = Math.min(length, childLength);
                    range.setStart(element.firstChild, offset);
                    range.setEnd(element.firstChild, offset);
                } else {
                    range.setStart(element, 0);
                    range.setEnd(element, 0);
                }
                selection.removeAllRanges();
                selection.addRange(range);
            });
        }
    }, [selectionActions, todo.$cid]);

    const className = `todo-item card${isDone ? " done" : ""}${
        dragging ? " dragging" : ""
    }${isSelected ? " selected" : ""}${isEditing ? " editing" : ""}`;

    return (
        <li
            className={className}
            ref={rowRef}
            data-cid={todo.$cid}
            style={style}
            onPointerDown={(event) => {
                const target = event.target as HTMLElement | null;
                if (target?.closest(".todo-checkbox")) {
                    return;
                }
                if (!detached && !target?.closest(".todo-text")) {
                    focusItemPreview();
                }
                onManualPointerDown?.(todo.$cid, event);
            }}
            onPointerMove={(event) => {
                if ((event.target as HTMLElement | null)?.closest(".todo-checkbox")) {
                    return;
                }
                onManualPointerMove?.(todo.$cid, event);
            }}
            onPointerUp={(event) => {
                if ((event.target as HTMLElement | null)?.closest(".todo-checkbox")) {
                    return;
                }
                onManualPointerUp?.(todo.$cid, event);
            }}
            onPointerCancel={(event) => {
                if ((event.target as HTMLElement | null)?.closest(".todo-checkbox")) {
                    return;
                }
                onManualPointerCancel?.(todo.$cid, event);
            }}
        >
            <button
                className="drag-handle"
                draggable={false}
                aria-label="Drag to reorder"
                title="Drag to reorder"
            >
                ☰
            </button>
            {remoteSelectorDots.length > 0 && (
                <span className="todo-collab-dots" aria-hidden>
                    {remoteSelectorDots}
                </span>
            )}
            <div
                aria-checked={isDone}
                aria-label={isDone ? "Mark as todo" : "Mark as done"}
                tabIndex={detached ? -1 : 0}
                className={`todo-checkbox${isDone ? " checked" : ""}${
                    detached ? " disabled" : ""
                }`}
                onPointerUp={(event) => {
                    if (detached) return;
                    if (event.pointerType === "touch") {
                        touchSkipChangeRef.current = true;
                        onDoneChange(todo.$cid, !isDone);
                        event.preventDefault();
                        event.stopPropagation();
                    }
                }}
                onPointerCancel={(event) => {
                    if (event.pointerType === "touch") {
                        touchSkipChangeRef.current = false;
                    }
                }}
                onClick={() => {
                    if (detached) return;
                    if (touchSkipChangeRef.current) {
                        touchSkipChangeRef.current = false;
                        return;
                    }
                    onDoneChange(todo.$cid, !isDone);
                }}
            />
            <TodoTextInput
                ref={inputRef}
                value={localText}
                detached={detached}
                selectionActive={isSelected}
                selectionEditing={isEditing}
                sanitize={sanitizeSingleLine}
                onChange={handleEditorChange}
                onRequestEditing={focusItemEditing}
                onRequestPreview={focusItemPreview}
            />
            <button
                className="delete-btn"
                onClick={() => onDelete(todo.$cid)}
                aria-label="Delete todo"
                title="Delete"
                disabled={detached}
            >
                <StreamlinePlumpRecycleBin2Remix />
            </button>
        </li>
    );
}
