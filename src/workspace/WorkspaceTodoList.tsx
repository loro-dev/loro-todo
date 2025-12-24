import type {
  DragEvent as ReactDragEvent,
  PointerEvent as ReactPointerEvent,
  RefObject,
} from "react";
import { useMemo } from "react";
import type { ManualDragState } from "../useLongPressDrag";
import { TodoItemRow } from "../todos/TodoItemRow";
import type { Todo } from "../todos/types";

type WorkspaceTodoListProps = {
  todos: Todo[];
  listRef: RefObject<HTMLUListElement | null>;
  positions: { pos: Record<string, number>; height: number };
  transformTransitionsReady: boolean;
  dragCid: string | null;
  insertIndex: number | null;
  itemHeights: Record<string, number>;
  itemGap: number;
  defaultHeight: number;
  manualDrag: ManualDragState | null;
  onListDragOver: (event: ReactDragEvent<HTMLUListElement>) => void;
  onListDrop: (event?: ReactDragEvent<HTMLUListElement>) => void;
  onTextChange: (cid: string, value: string) => void;
  onDoneChange: (cid: string, done: boolean) => void;
  onDelete: (cid: string) => void;
  onHeightChange: (cid: string, height: number) => void;
  onRowRefChange: (cid: string, element: HTMLLIElement | null) => void;
  onManualPointerDown: (
    cid: string,
    event: ReactPointerEvent<HTMLLIElement>,
  ) => void;
  onManualPointerMove: (
    cid: string,
    event: ReactPointerEvent<HTMLLIElement>,
  ) => void;
  onManualPointerUp: (
    cid: string,
    event: ReactPointerEvent<HTMLLIElement>,
  ) => void;
  onManualPointerCancel: (
    cid: string,
    event: ReactPointerEvent<HTMLLIElement>,
  ) => void;
  detached: boolean;
};

export function WorkspaceTodoList({
  todos,
  listRef,
  positions,
  transformTransitionsReady,
  dragCid,
  insertIndex,
  itemHeights,
  itemGap,
  defaultHeight,
  manualDrag,
  onListDragOver,
  onListDrop,
  onTextChange,
  onDoneChange,
  onDelete,
  onHeightChange,
  onRowRefChange,
  onManualPointerDown,
  onManualPointerMove,
  onManualPointerUp,
  onManualPointerCancel,
  detached,
}: WorkspaceTodoListProps) {
  const { stableTodos, indexByCid } = useMemo(() => {
    const validTodos = todos.filter(
      (todo) => typeof todo.$cid === "string" && todo.$cid.length > 0,
    );
    const indexed: Record<string, number> = {};
    for (let i = 0; i < validTodos.length; i++) {
      indexed[validTodos[i].$cid] = i;
    }
    const sorted = [...validTodos].sort((a, b) => a.$cid.localeCompare(b.$cid));
    return { stableTodos: sorted, indexByCid: indexed };
  }, [todos]);

  return (
    <ul
      className="todo-list"
      ref={listRef as RefObject<HTMLUListElement>}
      onDragOver={onListDragOver}
      onDrop={onListDrop}
      style={{
        height: positions.height,
        touchAction: manualDrag ? "none" : undefined,
      }}
    >
      {stableTodos.map((todo) => {
        const realIndex = indexByCid[todo.$cid] ?? 0;
        const baseY = positions.pos[todo.$cid] ?? 0;
        let translateY = baseY;
        let transition = transformTransitionsReady
          ? "transform 240ms ease"
          : "transform 0ms linear";
        let zIndex = 1;
        const activeDragCid = manualDrag?.cid ?? dragCid;
        const isManualActive = manualDrag?.cid === todo.$cid;
        const activeDragIndex =
          activeDragCid != null ? (indexByCid[activeDragCid] ?? -1) : -1;
        const activeDragHeight =
          activeDragCid != null
            ? (manualDrag?.height ??
              itemHeights[activeDragCid] ??
              defaultHeight)
            : defaultHeight;
        if (isManualActive && manualDrag) {
          const rawY =
            manualDrag.clientY - manualDrag.listTop - manualDrag.offsetY;
          const minY = -manualDrag.height * 0.6;
          const maxY = Math.max(
            positions.height - manualDrag.height * 0.4,
            minY,
          );
          const clampedY = Math.min(Math.max(rawY, minY), maxY);
          translateY = clampedY;
          transition = "transform 0ms linear";
          zIndex = 5;
        } else if (activeDragCid === todo.$cid && dragCid === todo.$cid) {
          transition = "transform 0ms linear";
          zIndex = 5;
        }
        if (
          activeDragCid &&
          activeDragIndex !== -1 &&
          insertIndex != null &&
          todo.$cid !== activeDragCid
        ) {
          if (insertIndex > activeDragIndex) {
            if (realIndex > activeDragIndex && realIndex <= insertIndex - 1) {
              translateY -= activeDragHeight + itemGap;
            }
          } else if (insertIndex <= activeDragIndex) {
            if (realIndex >= insertIndex && realIndex < activeDragIndex) {
              translateY += activeDragHeight + itemGap;
            }
          }
        }
        return (
          <TodoItemRow
            key={todo.$cid}
            todo={todo}
            onTextChange={onTextChange}
            onDoneChange={onDoneChange}
            onDelete={onDelete}
            dragging={dragCid === todo.$cid}
            onManualPointerDown={onManualPointerDown}
            onManualPointerMove={onManualPointerMove}
            onManualPointerUp={onManualPointerUp}
            onManualPointerCancel={onManualPointerCancel}
            detached={detached}
            onHeightChange={onHeightChange}
            onRowRefChange={onRowRefChange}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              transform: `translateY(${translateY}px)`,
              transition,
              willChange: "transform",
              zIndex,
              touchAction: manualDrag?.cid === todo.$cid ? "none" : undefined,
            }}
          />
        );
      })}
    </ul>
  );
}
