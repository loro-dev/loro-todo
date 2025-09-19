import type { RefObject } from "react";
import { NewTodoInput } from "../todos/NewTodoInput";

type WorkspaceNewTodoProps = {
    value: string;
    detached: boolean;
    onChange: (value: string) => void;
    onSubmit: () => void;
    inputRef: RefObject<HTMLInputElement>;
};

export function WorkspaceNewTodo({
    value,
    detached,
    onChange,
    onSubmit,
    inputRef,
}: WorkspaceNewTodoProps) {
    return (
        <div className="new-todo">
            <NewTodoInput
                inputRef={inputRef}
                value={value}
                detached={detached}
                onChange={onChange}
                onSubmit={onSubmit}
            />
            <button
                className="btn btn-primary"
                onClick={onSubmit}
                disabled={detached}
            >
                Add
            </button>
        </div>
    );
}
