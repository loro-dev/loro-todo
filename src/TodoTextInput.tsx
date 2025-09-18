import React from "react";

type SelectionRange = { start: number; end: number };

export type TodoTextInputChange = (next: string, shouldCommit: boolean) => void;

export type TodoTextInputProps = {
    value: string;
    detached: boolean;
    selectionActive: boolean;
    selectionEditing: boolean;
    sanitize: (input: string) => string;
    onChange: TodoTextInputChange;
    onRequestEditing: () => void;
    onRequestPreview: () => void;
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
        {
            value,
            detached,
            selectionActive,
            selectionEditing,
            sanitize,
            onChange,
            onRequestEditing,
            onRequestPreview,
        },
        forwardedRef,
    ) {
        const elementRef = React.useRef<HTMLDivElement | null>(null);
        const selectionRef = React.useRef<SelectionRange | null>(null);
        // During IME composition we avoid mutating content/selection so the browser can manage the in-flight text.
        const isComposingRef = React.useRef(false);
        const [isCoarsePointer, setIsCoarsePointer] = React.useState<boolean>(() => {
            if (typeof window === "undefined") return false;
            if (window.matchMedia) {
                try {
                    return window.matchMedia("(pointer: coarse)").matches;
                } catch {}
            }
            return navigator.maxTouchPoints > 0;
        });

        React.useEffect(() => {
            if (typeof window === "undefined" || !window.matchMedia) return;
            let subscribed = true;
            const mq = window.matchMedia("(pointer: coarse)");
            const handler = (event: MediaQueryListEvent) => {
                if (!subscribed) return;
                setIsCoarsePointer(event.matches);
            };
            if (typeof mq.addEventListener === "function") {
                mq.addEventListener("change", handler);
                return () => {
                    subscribed = false;
                    mq.removeEventListener("change", handler);
                };
            }
            if (typeof mq.addListener === "function") {
                mq.addListener(handler);
                return () => {
                    subscribed = false;
                    mq.removeListener(handler);
                };
            }
        }, []);

        const allowEditing = React.useMemo(() => {
            if (detached) return false;
            return selectionEditing;
        }, [detached, selectionEditing]);

        const lastPointerTypeRef = React.useRef<string | null>(null);

        const pendingSelectionRef = React.useRef<number | null>(null);

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
            // TODO: REVIEW [skips selection capture while IME composition is active]
            if (isComposingRef.current) return;
            const offsets = getSelectionOffsets();
            if (offsets) selectionRef.current = offsets;
        }, [getSelectionOffsets]);

        const syncContentFromValue = React.useCallback(
            (nextValue: string) => {
                if (isComposingRef.current) return;
                const el = elementRef.current;
                if (!el) return;
                const sanitized = sanitize(nextValue);
                if ((el.textContent ?? "") !== sanitized) {
                    el.textContent = sanitized;
                }
            },
            [sanitize],
        );

        // The browser dispatches an `input` right after `compositionend`; skip it because we already commit there.
        const skipNextInputRef = React.useRef(false);

        const handleCompositionStart = React.useCallback(() => {
            isComposingRef.current = true;
        }, []);

        React.useLayoutEffect(() => {
            syncContentFromValue(value);
            if (!isComposingRef.current && selectionRef.current) {
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
                if (!allowEditing) {
                    const el = event.currentTarget;
                    el.textContent = value;
                    return;
                }
                if (skipNextInputRef.current) {
                    skipNextInputRef.current = false;
                    return;
                }
                if (isComposingRef.current) {
                    // IME will supply the finalized text via `compositionend`; avoid interfering mid-stream.
                    return;
                }
                // With the IME idle, sanitize and commit immediate edits while preserving the caret.
                const raw = event.currentTarget.textContent ?? "";
                const sanitized = sanitize(raw);
                const before = getSelectionOffsets();
                if (sanitized !== raw) {
                    event.currentTarget.textContent = sanitized;
                    const caret = before ? Math.min(before.start, sanitized.length) : sanitized.length;
                    selectionRef.current = { start: caret, end: caret };
                    applySelectionOffsets(caret, caret);
                } else if (before) {
                    selectionRef.current = before;
                }
                handleSanitizedChange(sanitized, true);
            },
            [
                allowEditing,
                applySelectionOffsets,
                getSelectionOffsets,
                handleSanitizedChange,
                sanitize,
                value,
            ],
        );

        const handlePaste: React.ClipboardEventHandler<HTMLDivElement> = React.useCallback(
            (event) => {
                if (!allowEditing) return;
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
            [
                allowEditing,
                applySelectionOffsets,
                getSelectionOffsets,
                handleSanitizedChange,
                sanitize,
                value,
            ],
        );

        const handleCompositionEnd: React.CompositionEventHandler<HTMLDivElement> = React.useCallback(
            (event) => {
                if (!allowEditing) return;
                isComposingRef.current = false;
                skipNextInputRef.current = true;
                // Commit the IME result exactly once: sanitize, restore selection, and propagate upstream.
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
            [allowEditing, applySelectionOffsets, getSelectionOffsets, handleSanitizedChange, sanitize],
        );

        React.useEffect(() => {
            const el = elementRef.current;
            if (!el) return;
            if (!allowEditing) {
                if (
                    typeof document !== "undefined" &&
                    document.activeElement === el
                ) {
                    el.blur();
                }
                return;
            }
            if (typeof document !== "undefined" && document.activeElement !== el) {
                el.focus();
                captureSelection();
            }
        }, [allowEditing, captureSelection]);

        React.useEffect(() => {
            if (!selectionEditing) return;
            if (typeof document === "undefined") return;
            const el = elementRef.current;
            if (!el) return;
            const length = el.textContent?.length ?? 0;
            const range = document.createRange();
            const selection = window.getSelection();
            if (!selection) return;
            if (el.firstChild && el.firstChild.nodeType === Node.TEXT_NODE) {
                const textNode = el.firstChild as Text;
                const caret = Math.min(length, (textNode.textContent ?? "").length);
                range.setStart(textNode, caret);
                range.setEnd(textNode, caret);
            } else {
                range.selectNodeContents(el);
                range.collapse(false);
            }
            selection.removeAllRanges();
            selection.addRange(range);
            selectionRef.current = { start: length, end: length };
        }, [selectionEditing]);

        const className = React.useMemo(() => {
            let base = "todo-text";
            if (!isCoarsePointer) base += " todo-text--fine";
            if (selectionEditing) base += " todo-text--editing";
            else if (selectionActive) base += " todo-text--preview";
            return base;
        }, [isCoarsePointer, selectionActive, selectionEditing]);

        return (
            <div
                ref={mergeRefs(elementRef, forwardedRef)}
                className={className}
                contentEditable={allowEditing}
                suppressContentEditableWarning
                role="textbox"
                aria-multiline="false"
                aria-readonly={!allowEditing}
                spellCheck={false}
                onPointerDown={(event) => {
                    lastPointerTypeRef.current = event.pointerType || null;
                    if (allowEditing) return;
                    if (event.pointerType === "mouse") {
                        onRequestEditing();
                        pendingSelectionRef.current = null;
                        return;
                    }
                    if (event.pointerType === "touch" || event.pointerType === "pen") {
                        if (event.cancelable) event.preventDefault();
                        elementRef.current?.blur();
                        pendingSelectionRef.current = event.pointerId;
                        return;
                    }
                    pendingSelectionRef.current = null;
                }}
                onPointerUp={(event) => {
                    if (!allowEditing) {
                        if (pendingSelectionRef.current === event.pointerId) {
                            pendingSelectionRef.current = null;
                            const pointerType = event.pointerType || lastPointerTypeRef.current;
                            if ((pointerType === "touch" || pointerType === "pen") && event.cancelable) {
                                event.preventDefault();
                            }
                            if (pointerType === "touch" || pointerType === "pen") {
                                if (!selectionActive) {
                                    onRequestPreview();
                                } else {
                                    onRequestEditing();
                                }
                            } else {
                                onRequestEditing();
                            }
                        }
                        return;
                    }
                    captureSelection();
                }}
                onPointerCancel={(event) => {
                    if (pendingSelectionRef.current === event.pointerId) {
                        pendingSelectionRef.current = null;
                    }
                }}
                onFocus={() => {
                    if (!allowEditing) {
                        onRequestEditing();
                        elementRef.current?.blur();
                        return;
                    }
                    captureSelection();
                }}
                onInput={handleInput}
                onBlur={() => {
                    selectionRef.current = null;
                    onRequestPreview();
                }}
                onKeyDown={(event) => {
                    if (!isComposingRef.current && event.key === "Enter") {
                        event.preventDefault();
                    }
                }}
                onCompositionStart={handleCompositionStart}
                onCompositionEnd={handleCompositionEnd}
                onPaste={handlePaste}
                onBeforeInput={(event) => {
                    if (!allowEditing) {
                        event.preventDefault();
                        return;
                    }
                    const inputType = (event.nativeEvent as InputEvent | undefined)?.inputType;
                    if (inputType === "insertParagraph" || inputType === "insertLineBreak") {
                        event.preventDefault();
                    }
                }}
                onKeyUp={captureSelection}
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
