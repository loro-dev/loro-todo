import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
  type PointerEvent as ReactPointerEvent,
} from "react";

type AutoScrollDirection = -1 | 1;

type AutoScrollState = {
  container: Element | Window;
  direction: AutoScrollDirection;
  velocity: number;
  frame: number | null;
  pointerId: number;
  lastClientY: number;
};

const EDGE_SCROLL_THRESHOLD_RATIO = 0.2;
const EDGE_SCROLL_THRESHOLD_MIN = 40;
const EDGE_SCROLL_THRESHOLD_MAX = 120;
const EDGE_SCROLL_BASE_SPEED = 8;
const EDGE_SCROLL_EXTRA_SPEED = 20;

const blockTouchMove = (event: TouchEvent): void => {
  if (!event.cancelable) return;
  event.preventDefault();
};

function isWindowTarget(target: Element | Window): target is Window {
  return typeof window !== "undefined" && target === window;
}

function getScrollPosition(target: Element | Window): number {
  if (typeof window === "undefined") return 0;
  if (isWindowTarget(target)) {
    return (
      window.scrollY ||
      window.pageYOffset ||
      document.documentElement.scrollTop ||
      document.body.scrollTop ||
      0
    );
  }
  return target.scrollTop;
}

function getMaxScroll(target: Element | Window): number {
  if (typeof window === "undefined") return 0;
  if (isWindowTarget(target)) {
    const doc = document.documentElement;
    return Math.max(0, doc.scrollHeight - window.innerHeight);
  }
  const el = target;
  return Math.max(0, el.scrollHeight - el.clientHeight);
}

function scrollByAmount(target: Element | Window, delta: number): void {
  if (typeof window === "undefined" || delta === 0) return;
  if (isWindowTarget(target)) {
    window.scrollBy({ top: delta, left: 0, behavior: "auto" });
    return;
  }
  const el = target;
  el.scrollTop += delta;
}

type PendingLongPress = {
  pointerId: number;
  pointerType: string;
  cid: string;
  timer: number | null;
  startX: number;
  startY: number;
  lastClientY: number;
  target: HTMLElement | null;
};

export type ManualDragState = {
  cid: string;
  pointerId: number;
  pointerType: string;
  offsetY: number;
  clientY: number;
  listTop: number;
  height: number;
};

type UseLongPressDragOptions = {
  listRef: RefObject<HTMLUListElement | null>;
  positions: { pos: Record<string, number>; height: number };
  itemHeights: Record<string, number>;
  defaultHeight: number;
  detached: boolean;
  onDragStart: (cid: string) => void;
  onDragEnd: () => void;
  onUpdateInsertIndex: (clientY: number) => void;
  onCommitDrop: () => void;
  shouldHandlePointerDown?: (
    cid: string,
    e: ReactPointerEvent<HTMLLIElement>,
  ) => boolean;
};

type UseLongPressDragResult = {
  manualDrag: ManualDragState | null;
  handlePointerDown: (cid: string, e: ReactPointerEvent<HTMLLIElement>) => void;
  handlePointerMove: (cid: string, e: ReactPointerEvent<HTMLLIElement>) => void;
  handlePointerUp: (cid: string, e: ReactPointerEvent<HTMLLIElement>) => void;
  handlePointerCancel: (
    cid: string,
    e: ReactPointerEvent<HTMLLIElement>,
  ) => void;
};

const LONG_PRESS_MS = 280;
const LONG_PRESS_MOVE_THRESHOLD = 6;

export function useLongPressDrag({
  listRef,
  positions,
  itemHeights,
  defaultHeight,
  detached,
  onDragStart,
  onDragEnd,
  onUpdateInsertIndex,
  onCommitDrop,
  shouldHandlePointerDown,
}: UseLongPressDragOptions): UseLongPressDragResult {
  const [manualDrag, setManualDrag] = useState<ManualDragState | null>(null);
  const pendingRef = useRef<PendingLongPress | null>(null);
  const autoScrollRef = useRef<AutoScrollState | null>(null);
  const onUpdateInsertIndexRef = useRef(onUpdateInsertIndex);

  useEffect(() => {
    onUpdateInsertIndexRef.current = onUpdateInsertIndex;
  }, [onUpdateInsertIndex]);

  const stopAutoScroll = useCallback(() => {
    const state = autoScrollRef.current;
    if (!state) return;
    if (typeof window !== "undefined" && state.frame != null) {
      window.cancelAnimationFrame(state.frame);
    }
    autoScrollRef.current = null;
  }, []);

  const runAutoScroll = useCallback(() => {
    const state = autoScrollRef.current;
    if (!state) {
      return;
    }
    if (typeof window === "undefined") {
      stopAutoScroll();
      return;
    }
    const container = state.container;
    const current = getScrollPosition(container);
    const max = getMaxScroll(container);
    if (
      (state.direction < 0 && current <= 0) ||
      (state.direction > 0 && current >= max)
    ) {
      stopAutoScroll();
      return;
    }
    const delta = state.direction * state.velocity;
    const before = current;
    scrollByAmount(container, delta);
    const after = getScrollPosition(container);
    if (after === before) {
      stopAutoScroll();
      return;
    }
    const list = listRef.current;
    if (list) {
      const nextTop = list.getBoundingClientRect().top;
      setManualDrag((prev) => {
        if (!prev || prev.pointerId !== state.pointerId) return prev;
        if (prev.listTop === nextTop) return prev;
        return { ...prev, listTop: nextTop };
      });
    }
    const updateInsertIndex = onUpdateInsertIndexRef.current;
    updateInsertIndex(state.lastClientY);
    if (autoScrollRef.current !== state) {
      return;
    }
    state.frame = window.requestAnimationFrame(runAutoScroll);
  }, [listRef, setManualDrag, stopAutoScroll]);

  const startAutoScroll = useCallback(
    (params: {
      container: Element | Window;
      direction: AutoScrollDirection;
      velocity: number;
      pointerId: number;
      clientY: number;
    }) => {
      if (typeof window === "undefined") return;
      const { container, direction, velocity, pointerId, clientY } = params;
      const existing = autoScrollRef.current;
      if (
        existing &&
        existing.container === container &&
        existing.pointerId === pointerId &&
        existing.direction === direction
      ) {
        existing.velocity = velocity;
        existing.lastClientY = clientY;
        if (existing.frame == null) {
          existing.frame = window.requestAnimationFrame(runAutoScroll);
        }
        return;
      }
      stopAutoScroll();
      const nextState: AutoScrollState = {
        container,
        direction,
        velocity,
        frame: null,
        pointerId,
        lastClientY: clientY,
      };
      autoScrollRef.current = nextState;
      nextState.frame = window.requestAnimationFrame(runAutoScroll);
    },
    [runAutoScroll, stopAutoScroll],
  );

  const updateManualDragFromPointer = useCallback(
    (pointerId: number, clientY: number) => {
      setManualDrag((prev) => {
        if (!prev || prev.pointerId !== pointerId) return prev;
        const listTop =
          listRef.current?.getBoundingClientRect().top ?? prev.listTop;
        if (prev.clientY === clientY && prev.listTop === listTop) return prev;
        return { ...prev, clientY, listTop };
      });
    },
    [listRef, setManualDrag],
  );

  // TODO: REVIEW [auto-scroll threshold tuning]
  const evaluateAutoScroll = useCallback(
    (clientY: number, pointerId: number) => {
      const active = manualDrag;
      if (!active || active.pointerId !== pointerId) {
        stopAutoScroll();
        return;
      }
      if (typeof window === "undefined") {
        stopAutoScroll();
        return;
      }
      const viewportHeight = window.innerHeight;
      if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) {
        stopAutoScroll();
        return;
      }
      const thresholdDynamic = viewportHeight * EDGE_SCROLL_THRESHOLD_RATIO;
      const threshold = Math.min(
        EDGE_SCROLL_THRESHOLD_MAX,
        Math.max(EDGE_SCROLL_THRESHOLD_MIN, thresholdDynamic),
      );
      const topBoundary = threshold;
      const bottomBoundary = viewportHeight - threshold;
      const container: Element | Window = window;
      if (clientY < topBoundary) {
        const distance = topBoundary - clientY;
        const intensity = Math.min(1, distance / threshold);
        const velocity =
          EDGE_SCROLL_BASE_SPEED + intensity * EDGE_SCROLL_EXTRA_SPEED;
        startAutoScroll({
          container,
          direction: -1,
          velocity,
          pointerId,
          clientY,
        });
        return;
      }
      if (clientY > bottomBoundary) {
        const distance = clientY - bottomBoundary;
        const intensity = Math.min(1, distance / threshold);
        const velocity =
          EDGE_SCROLL_BASE_SPEED + intensity * EDGE_SCROLL_EXTRA_SPEED;
        startAutoScroll({
          container,
          direction: 1,
          velocity,
          pointerId,
          clientY,
        });
        return;
      }
      stopAutoScroll();
    },
    [manualDrag, startAutoScroll, stopAutoScroll],
  );

  const clearPending = useCallback(() => {
    const pending = pendingRef.current;
    if (pending?.timer != null) {
      window.clearTimeout(pending.timer);
    }
    pendingRef.current = null;
  }, []);

  const beginManualDrag = useCallback(
    (pending: PendingLongPress) => {
      pendingRef.current = null;
      if (pending.timer != null) {
        window.clearTimeout(pending.timer);
      }
      const ul = listRef.current;
      if (!ul) return;
      stopAutoScroll();
      const rect = ul.getBoundingClientRect();
      const cid = pending.cid;
      const pointerId = pending.pointerId;
      const pointerType = pending.pointerType;
      const baseY = positions.pos[cid] ?? 0;
      const clientY = pending.lastClientY;
      const offsetY = clientY - (rect.top + baseY);
      const height = itemHeights[cid] ?? defaultHeight;
      const active = document.activeElement;
      if (active && active instanceof HTMLElement) {
        active.blur();
      }
      try {
        pending.target?.setPointerCapture(pointerId);
      } catch {}
      onDragStart(cid);
      onUpdateInsertIndex(clientY);
      setManualDrag({
        cid,
        pointerId,
        pointerType,
        offsetY,
        clientY,
        listTop: rect.top,
        height,
      });
    },
    [
      listRef,
      positions,
      itemHeights,
      defaultHeight,
      onDragStart,
      onUpdateInsertIndex,
      stopAutoScroll,
    ],
  );

  useEffect(() => {
    return () => {
      clearPending();
    };
  }, [clearPending]);

  const dragActive = manualDrag != null;
  const touchDragActive = manualDrag?.pointerType === "touch";

  useEffect(() => {
    if (!dragActive) return;
    if (typeof document === "undefined") return;
    const body = document.body;
    body.classList.add("is-dragging");
    return () => {
      body.classList.remove("is-dragging");
    };
  }, [dragActive]);

  const handlePointerDown = useCallback(
    (cid: string, e: React.PointerEvent<HTMLLIElement>) => {
      if (detached) return;
      if (manualDrag) return;
      const allow = shouldHandlePointerDown
        ? shouldHandlePointerDown(cid, e)
        : true;
      if (!allow) {
        clearPending();
        return;
      }

      clearPending();
      const pointerId = e.pointerId;
      if (e.pointerType !== "touch") {
        if (e.cancelable) e.preventDefault();
        beginManualDrag({
          pointerId,
          pointerType: e.pointerType,
          cid,
          timer: null,
          startX: e.clientX,
          startY: e.clientY,
          lastClientY: e.clientY,
          target: e.currentTarget,
        });
        return;
      }

      const timer = window.setTimeout(() => {
        const pending = pendingRef.current;
        if (!pending) return;
        if (pending.pointerId !== pointerId || pending.cid !== cid) return;
        beginManualDrag(pending);
      }, LONG_PRESS_MS);
      pendingRef.current = {
        pointerId,
        pointerType: e.pointerType,
        cid,
        timer,
        startX: e.clientX,
        startY: e.clientY,
        lastClientY: e.clientY,
        target: e.currentTarget,
      };
    },
    [
      detached,
      manualDrag,
      clearPending,
      beginManualDrag,
      shouldHandlePointerDown,
    ],
  );

  const handlePointerMove = useCallback(
    (cid: string, e: React.PointerEvent<HTMLLIElement>) => {
      const pointerId = e.pointerId;
      if (
        manualDrag &&
        manualDrag.pointerId === pointerId &&
        manualDrag.cid === cid
      ) {
        if (e.cancelable) e.preventDefault();
        const clientY = e.clientY;
        updateManualDragFromPointer(pointerId, clientY);
        onUpdateInsertIndex(clientY);
        evaluateAutoScroll(clientY, pointerId);
        return;
      }
      const pending = pendingRef.current;
      if (pending && pending.pointerId === pointerId && pending.cid === cid) {
        pending.lastClientY = e.clientY;
        const dx = e.clientX - pending.startX;
        const dy = e.clientY - pending.startY;
        if (Math.hypot(dx, dy) > LONG_PRESS_MOVE_THRESHOLD) {
          if (pending.timer != null) window.clearTimeout(pending.timer);
          try {
            pending.target?.releasePointerCapture(pointerId);
          } catch {}
          pendingRef.current = null;
        }
      }
    },
    [
      manualDrag,
      onUpdateInsertIndex,
      updateManualDragFromPointer,
      evaluateAutoScroll,
    ],
  );

  const finalizeManualDrag = useCallback(
    (pointerId: number, cid: string | null, cancel: boolean) => {
      if (manualDrag && manualDrag.pointerId === pointerId) {
        stopAutoScroll();
        setManualDrag(null);
        if (cancel) {
          onDragEnd();
        } else {
          onCommitDrop();
        }
        return true;
      }
      const pending = pendingRef.current;
      if (
        pending &&
        pending.pointerId === pointerId &&
        (!cid || pending.cid === cid)
      ) {
        if (pending.timer != null) window.clearTimeout(pending.timer);
        pendingRef.current = null;
        return true;
      }
      return false;
    },
    [manualDrag, onCommitDrop, onDragEnd, stopAutoScroll],
  );

  const handlePointerUp = useCallback(
    (cid: string, e: React.PointerEvent<HTMLLIElement>) => {
      const pointerId = e.pointerId;
      const handled = finalizeManualDrag(pointerId, cid, false);
      if (handled && e.cancelable) e.preventDefault();
      try {
        if (e.currentTarget.hasPointerCapture?.(pointerId)) {
          e.currentTarget.releasePointerCapture(pointerId);
        }
      } catch {}
    },
    [finalizeManualDrag],
  );

  const handlePointerCancel = useCallback(
    (cid: string, e: React.PointerEvent<HTMLLIElement>) => {
      const pointerId = e.pointerId;
      const handled = finalizeManualDrag(pointerId, cid, true);
      if (handled && e.cancelable) e.preventDefault();
      try {
        if (e.currentTarget.hasPointerCapture?.(pointerId)) {
          e.currentTarget.releasePointerCapture(pointerId);
        }
      } catch {}
    },
    [finalizeManualDrag],
  );

  useEffect(() => {
    if (!manualDrag) {
      stopAutoScroll();
    }
  }, [manualDrag, stopAutoScroll]);

  useEffect(() => {
    if (!touchDragActive) return;
    const listenerOptions: AddEventListenerOptions = { passive: false };
    window.addEventListener("touchmove", blockTouchMove, listenerOptions);
    return () => {
      window.removeEventListener("touchmove", blockTouchMove, listenerOptions);
    };
  }, [touchDragActive]);

  useEffect(() => {
    if (!manualDrag) return;
    const pointerId = manualDrag.pointerId;
    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      if (manualDrag.cid) {
        const clientY = e.clientY;
        updateManualDragFromPointer(pointerId, clientY);
        onUpdateInsertIndex(clientY);
        evaluateAutoScroll(clientY, pointerId);
        if (e.cancelable) e.preventDefault();
      }
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      finalizeManualDrag(pointerId, manualDrag.cid, false);
    };
    const onCancel = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      finalizeManualDrag(pointerId, manualDrag.cid, true);
    };
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };
  }, [
    manualDrag,
    finalizeManualDrag,
    onUpdateInsertIndex,
    updateManualDragFromPointer,
    evaluateAutoScroll,
  ]);

  return {
    manualDrag,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
  };
}
