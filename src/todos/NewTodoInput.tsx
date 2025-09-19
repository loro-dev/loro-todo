import { useCallback, useEffect } from "react";
import type { RefObject } from "react";
import { useAppSelection } from "../selection";

type NewTodoInputProps = {
    inputRef: RefObject<HTMLInputElement>;
    value: string;
    detached: boolean;
    onChange: (value: string) => void;
    onSubmit: () => void;
};

export function NewTodoInput({
    inputRef,
    value,
    detached,
    onChange,
    onSubmit,
}: NewTodoInputProps) {
    const { state, actions, ref } = useAppSelection();

    const isSelected = state.type === "create";

    useEffect(() => {
        const input = inputRef.current;
        if (!input) return;
        if (detached) {
            if (typeof document !== "undefined" && document.activeElement === input) {
                input.blur();
            }
            return;
        }
        if (state.type === "create" && state.mode === "editing") {
            if (typeof document !== "undefined" && document.activeElement !== input) {
                input.focus();
                input.select();
            }
        } else if (
            typeof document !== "undefined" &&
            document.activeElement === input
        ) {
            input.blur();
        }
    }, [state, detached, inputRef]);

    const handleBlur = useCallback(() => {
        const current = ref.current;
        if (current.type === "create" && current.mode === "editing") {
            actions.exitEditing();
        }
    }, [actions, ref]);

    const className = `todo-input${isSelected ? " is-selected" : ""}`;

    return (
        <input
            className={className}
            ref={inputRef}
            style={{ fontSize: 15 }}
            placeholder="Add a todo..."
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onFocus={() => actions.focusCreateEditing()}
            onBlur={handleBlur}
            onKeyDown={(event) => {
                const nativeEvent = event.nativeEvent;
                const isComposing = nativeEvent.isComposing;
                const isIMEKeyCode =
                    (nativeEvent as unknown as { keyCode?: number })?.keyCode === 229;
                if (event.key === "Enter" && !isComposing && !isIMEKeyCode) {
                    event.preventDefault();
                    onSubmit();
                }
            }}
            disabled={detached}
        />
    );
}
