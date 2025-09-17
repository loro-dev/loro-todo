import React from "react";

type SelectionRange = { start: number; end: number };

export type TodoTextInputChange = (next: string, shouldCommit: boolean) => void;

export type TodoTextInputProps = {
    value: string;
    detached: boolean;
    textSelected: boolean;
    sanitize: (input: string) => string;
    onChange: TodoTextInputChange;
    onSelect?: () => void;
    onDeselect?: () => void;
};

function mergeRefs<T>(
    ...refs: Array<React.RefCallback<T> | React.MutableRefObject<T | null> | null>
): (node: T | null) => void {
    return (node) => {
        for (const ref of refs) {
            if (!ref) continue;
            if (typeof ref === "function") {
                ref(node);
            } else {
                ref.current = node;
            }
        }
    };
}

export const TodoTextInput = React.forwardRef<HTMLDivElement, TodoTextInputProps>(
    function TodoTextInput(
        { value, detached, textSelected, sanitize, onChange, onSelect, onDeselect },
        forwardedRef,
    ) {
        const elementRef = React.useRef<HTMLDivElement | null>(null);
        const selectionRef = React.useRef<SelectionRange | null>(null);
        const isComposingRef = React.useRef(false);

        const getSelectionOffsets = React.useCallback((): SelectionRange | null => {
            const el = elementRef.current;
            if (!el || typeof window === "undefined" || typeof document === "undefined") {
                return null;
            }
            const sel = window.getSelection();
            if (!sel || sel.rangeCount === 0) return null;
            const range = sel.getRangeAt(0);
            if (!el.contains(range.startContainer) || !el.contains(range.endContainer)) {
                return null;
            }
            const preStart = range.cloneRange();
            preStart.selectNodeContents(el);
            preStart.setEnd(range.startContainer, range.startOffset);
            const start = preStart.toString().length;

            const preEnd = range.cloneRange();
            preEnd.selectNodeContents(el);
            preEnd.setEnd(range.endContainer, range.endOffset);
            const end = preEnd.toString().length;

            return { start, end };
        }, []);

        const applySelectionOffsets = React.useCallback(
            (start: number, end: number) => {
                const el = elementRef.current;
                if (!el || typeof window === "undefined" || typeof document === "undefined") {
                    return;
                }
                const sel = window.getSelection();
                if (!sel) return;
                const length = el.textContent?.length ?? 0;
                const boundedStart = Math.max(0, Math.min(start, length));
                const boundedEnd = Math.max(0, Math.min(end, length));
                const range = document.createRange();
                let textNode = el.firstChild;
                if (!textNode || textNode.nodeType !== Node.TEXT_NODE) {
                    el.textContent = el.textContent ?? "";
                    textNode = el.firstChild;
                }
                if (!textNode) return;
                range.setStart(textNode, boundedStart);
                range.setEnd(textNode, boundedEnd);
                sel.removeAllRanges();
                sel.addRange(range);
            },
            [],
        );

        const captureSelection = React.useCallback(() => {
            const offsets = getSelectionOffsets();
            if (offsets) selectionRef.current = offsets;
        }, [getSelectionOffsets]);

        const syncContentFromValue = React.useCallback(
            (nextValue: string) => {
                const el = elementRef.current;
                if (!el) return;
                const sanitized = sanitize(nextValue);
                if ((el.textContent ?? "") !== sanitized) {
                    el.textContent = sanitized;
                }
            },
            [sanitize],
        );

        React.useLayoutEffect(() => {
            syncContentFromValue(value);
            if (selectionRef.current) {
                const { start, end } = selectionRef.current;
                applySelectionOffsets(start, end);
                selectionRef.current = null;
            }
        }, [applySelectionOffsets, syncContentFromValue, value]);

        const handleSanitizedChange = React.useCallback(
            (rawNext: string, shouldCommit: boolean) => {
                const sanitized = sanitize(rawNext);
                onChange(sanitized, shouldCommit);
            },
            [onChange, sanitize],
        );

        const handleInput: React.FormEventHandler<HTMLDivElement> = React.useCallback(
            (event) => {
                if (detached) {
                    const el = event.currentTarget;
                    el.textContent = value;
                    return;
                }
                const before = getSelectionOffsets();
                const raw = event.currentTarget.textContent ?? "";
                const sanitized = sanitize(raw);
                if (sanitized !== raw) {
                    event.currentTarget.textContent = sanitized;
                    const caret = before ? Math.min(before.start, sanitized.length) : sanitized.length;
                    selectionRef.current = { start: caret, end: caret };
                    applySelectionOffsets(caret, caret);
                } else if (before) {
                    selectionRef.current = before;
                }
                handleSanitizedChange(sanitized, !isComposingRef.current);
            },
            [applySelectionOffsets, detached, getSelectionOffsets, handleSanitizedChange, sanitize, value],
        );

        const handlePaste: React.ClipboardEventHandler<HTMLDivElement> = React.useCallback(
            (event) => {
                if (detached) return;
                event.preventDefault();
                const el = elementRef.current;
                if (!el) return;
                const existing = el.textContent ?? value;
                const offsets =
                    getSelectionOffsets() ?? { start: existing.length, end: existing.length };
                const pasteText = sanitize(event.clipboardData.getData("text/plain"));
                const next = `${existing.slice(0, offsets.start)}${pasteText}${existing.slice(offsets.end)}`;
                const singleLine = sanitize(next);
                const caret = offsets.start + pasteText.length;
                selectionRef.current = { start: caret, end: caret };
                el.textContent = singleLine;
                applySelectionOffsets(caret, caret);
                handleSanitizedChange(singleLine, true);
            },
            [applySelectionOffsets, detached, getSelectionOffsets, handleSanitizedChange, sanitize, value],
        );

        const handleCompositionEnd: React.CompositionEventHandler<HTMLDivElement> = React.useCallback(
            (event) => {
                isComposingRef.current = false;
                const sanitized = sanitize(event.currentTarget.textContent ?? "");
                if ((event.currentTarget.textContent ?? "") !== sanitized) {
                    event.currentTarget.textContent = sanitized;
                }
                const offsets =
                    getSelectionOffsets() ?? { start: sanitized.length, end: sanitized.length };
                selectionRef.current = offsets;
                applySelectionOffsets(offsets.start, offsets.end);
                handleSanitizedChange(sanitized, true);
            },
            [applySelectionOffsets, getSelectionOffsets, handleSanitizedChange, sanitize],
        );

        return (
            <div
                ref={mergeRefs(elementRef, forwardedRef)}
                className="todo-text"
                contentEditable={!detached}
                suppressContentEditableWarning
                role="textbox"
                aria-multiline="false"
                aria-readonly={detached}
                spellCheck={false}
                onPointerDown={(event) => {
                    if (textSelected || detached) return;
                    if (event.pointerType === "touch" || event.pointerType === "pen") {
                        if (event.cancelable) event.preventDefault();
                        elementRef.current?.blur();
                    }
                }}
                onFocus={() => {
                    onSelect?.();
                    captureSelection();
                }}
                onInput={handleInput}
                onBlur={() => {
                    selectionRef.current = null;
                    onDeselect?.();
                }}
                onKeyDown={(event) => {
                    if (!isComposingRef.current && event.key === "Enter") {
                        event.preventDefault();
                    }
                }}
                onCompositionStart={() => {
                    isComposingRef.current = true;
                }}
                onCompositionEnd={handleCompositionEnd}
                onPaste={handlePaste}
                onBeforeInput={(event) => {
                    const inputType = (event.nativeEvent as InputEvent | undefined)?.inputType;
                    if (inputType === "insertParagraph" || inputType === "insertLineBreak") {
                        event.preventDefault();
                    }
                }}
                onKeyUp={captureSelection}
                onMouseUp={captureSelection}
                onTouchEnd={captureSelection}
                onDrop={(event) => {
                    event.preventDefault();
                }}
            >
                {value}
            </div>
        );
    },
);

TodoTextInput.displayName = "TodoTextInput";
