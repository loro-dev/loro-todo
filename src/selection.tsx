import React from "react";

export type SelectionMode = "preview" | "editing";

type SelectionStateNone = { type: "none" };
type SelectionStateCreate = { type: "create"; mode: SelectionMode };
type SelectionStateItem = {
  type: "item";
  mode: SelectionMode;
  cid: string;
};

export type SelectionState =
  | SelectionStateNone
  | SelectionStateCreate
  | SelectionStateItem;

export type RemotePeerSelection = {
  cid: string;
  mode: SelectionMode;
  updatedAt: number;
};

export type RemoteSelectionMap = Record<string, RemotePeerSelection>;

const EMPTY_REMOTE_COLORS: Record<string, string> = Object.freeze({}) as Record<
  string,
  string
>;

type SelectionAction =
  | { type: "clear" }
  | { type: "focus-create"; mode: SelectionMode }
  | {
      type: "focus-item";
      mode: SelectionMode;
      cid: string;
      order: readonly string[];
    }
  | { type: "enter-editing" }
  | { type: "exit-editing" }
  | { type: "select-next"; order: readonly string[] }
  | { type: "select-prev"; order: readonly string[] }
  | { type: "item-removed"; cid: string; order: readonly string[] }
  | { type: "ensure-valid"; order: readonly string[] };

const INITIAL_STATE: SelectionState = { type: "none" };

function selectionReducer(
  state: SelectionState,
  action: SelectionAction,
): SelectionState {
  switch (action.type) {
    case "clear": {
      return INITIAL_STATE;
    }
    case "focus-create": {
      return { type: "create", mode: action.mode };
    }
    case "focus-item": {
      if (!action.order.includes(action.cid)) {
        return state;
      }
      return { type: "item", mode: action.mode, cid: action.cid };
    }
    case "enter-editing": {
      if (state.type === "create" && state.mode === "preview") {
        return { type: "create", mode: "editing" };
      }
      if (state.type === "item" && state.mode === "preview") {
        return { type: "item", mode: "editing", cid: state.cid };
      }
      return state;
    }
    case "exit-editing": {
      if (state.type === "create" && state.mode === "editing") {
        return { type: "create", mode: "preview" };
      }
      if (state.type === "item" && state.mode === "editing") {
        return { type: "item", mode: "preview", cid: state.cid };
      }
      return state;
    }
    case "select-next": {
      if (action.order.length === 0) {
        return state.type === "create" ? state : INITIAL_STATE;
      }
      if (state.type === "none") {
        return { type: "item", mode: "preview", cid: action.order[0] };
      }
      if (state.type === "create") {
        return { type: "item", mode: "preview", cid: action.order[0] };
      }
      if (state.type === "item") {
        const index = action.order.indexOf(state.cid);
        if (index === -1) {
          return state;
        }
        if (index + 1 >= action.order.length) {
          return state;
        }
        return { type: "item", mode: "preview", cid: action.order[index + 1] };
      }
      return state;
    }
    case "select-prev": {
      if (action.order.length === 0) {
        if (state.type === "create") {
          return INITIAL_STATE;
        }
        return state;
      }
      if (state.type === "none") {
        return state;
      }
      if (state.type === "create") {
        return INITIAL_STATE;
      }
      if (state.type === "item") {
        const index = action.order.indexOf(state.cid);
        if (index === -1) {
          return state;
        }
        if (index === 0) {
          return { type: "create", mode: "preview" };
        }
        return { type: "item", mode: "preview", cid: action.order[index - 1] };
      }
      return state;
    }
    case "item-removed": {
      if (state.type !== "item" || state.cid !== action.cid) {
        return selectionReducer(state, {
          type: "ensure-valid",
          order: action.order,
        });
      }
      if (action.order.length === 0) {
        return { type: "create", mode: "preview" };
      }
      const fallbackCid = action.order[0];
      return { type: "item", mode: "preview", cid: fallbackCid };
    }
    case "ensure-valid": {
      if (state.type !== "item") {
        return state;
      }
      if (action.order.includes(state.cid)) {
        return state;
      }
      if (action.order.length === 0) {
        return { type: "create", mode: "preview" };
      }
      return { type: "item", mode: "preview", cid: action.order[0] };
    }
    default: {
      return state;
    }
  }
}

const SCROLL_MARGIN = 96;

function scrollToWithMargin(
  targetTop: number,
  behavior: ScrollBehavior = "auto",
): void {
  if (typeof window === "undefined") return;
  const maxScroll = Math.max(
    0,
    (document.documentElement?.scrollHeight ?? 0) - window.innerHeight,
  );
  const clamped = Math.max(0, Math.min(targetTop, maxScroll));
  window.scrollTo({ top: clamped, behavior });
}

function scrollIntoViewWithMargin(
  element: HTMLElement | null,
  preferBottomPadding: boolean,
  behavior: ScrollBehavior = "auto",
): void {
  if (!element || typeof window === "undefined") return;
  const rect = element.getBoundingClientRect();
  const viewTop = window.scrollY;
  const viewBottom = viewTop + window.innerHeight;
  const desiredTop = viewTop + SCROLL_MARGIN;
  const desiredBottom = viewBottom - SCROLL_MARGIN;

  let elementTop = rect.top + window.scrollY;
  let elementBottom = rect.bottom + window.scrollY;

  const translateY = getTranslateY(element);
  if (translateY != null) {
    const offsetParent = element.offsetParent as HTMLElement | null;
    if (offsetParent) {
      const parentRect = offsetParent.getBoundingClientRect();
      const parentTop = parentRect.top + window.scrollY;
      elementTop = parentTop + element.offsetTop + translateY;
    } else {
      elementTop = viewTop + translateY;
    }
    elementBottom = elementTop + element.offsetHeight;
  }

  let targetTop: number | null = null;

  if (elementTop < desiredTop) {
    targetTop = elementTop - SCROLL_MARGIN;
  } else if (elementBottom > desiredBottom) {
    targetTop = elementBottom + SCROLL_MARGIN - window.innerHeight;
  }

  if (preferBottomPadding) {
    const maxScroll = Math.max(
      0,
      (document.documentElement?.scrollHeight ?? 0) - window.innerHeight,
    );
    targetTop = maxScroll;
  }

  if (targetTop != null) {
    scrollToWithMargin(targetTop, behavior);
  }
}

function getTranslateY(element: HTMLElement): number | null {
  const inline = element.style.transform;
  const computed =
    inline && inline !== "none"
      ? inline
      : window.getComputedStyle(element).transform;
  if (!computed || computed === "none") return null;

  const translateMatch = /translateY\((-?\d+(?:\.\d+)?)px\)/.exec(computed);
  if (translateMatch) {
    return Number.parseFloat(translateMatch[1]);
  }

  // matrix(a, b, c, d, tx, ty)
  if (computed.startsWith("matrix")) {
    const parts = computed
      .slice(computed.indexOf("(") + 1, computed.indexOf(")"))
      .split(",")
      .map((p) => Number.parseFloat(p.trim()));
    if (parts.length === 6 && Number.isFinite(parts[5])) {
      return parts[5];
    }
    if (parts.length === 16 && Number.isFinite(parts[13])) {
      return parts[13];
    }
  }

  return null;
}

export type SelectionContextValue = {
  state: SelectionState;
  ref: React.MutableRefObject<SelectionState>;
  actions: SelectionActions;
  remotePeers: RemoteSelectionMap;
  remotePeerColors: Record<string, string>;
  setRemotePeers: (this: void, next: RemoteSelectionMap) => void;
};

export type SelectionActions = {
  clear(): void;
  focusCreatePreview(): void;
  focusCreateEditing(): void;
  focusItemPreview(cid: string): void;
  focusItemEditing(cid: string): void;
  enterEditing(): void;
  exitEditing(): void;
  selectNext(): void;
  selectPrev(): void;
  handleItemRemoved(cid: string): void;
  requestReorderFollow(behavior?: ScrollBehavior): void;
};

type SelectionProviderProps = {
  itemOrder: readonly string[];
  resolveItemElement?: (cid: string) => HTMLElement | null;
  resolveCreateInput?: () => HTMLElement | null;
  remotePeerColors?: Record<string, string>;
  children: React.ReactNode;
};

const SelectionContext = React.createContext<SelectionContextValue | undefined>(
  undefined,
);

export function SelectionProvider({
  itemOrder,
  resolveItemElement,
  resolveCreateInput,
  remotePeerColors,
  children,
}: SelectionProviderProps): React.ReactElement {
  const [state, dispatch] = React.useReducer(selectionReducer, INITIAL_STATE);
  const stateRef = React.useRef<SelectionState>(state);
  stateRef.current = state;

  const [remotePeers, setRemotePeers] = React.useState<RemoteSelectionMap>({});
  const setRemotePeersStable = React.useCallback((next: RemoteSelectionMap) => {
    setRemotePeers(next);
  }, []);
  const remotePeerColorsValue = remotePeerColors ?? EMPTY_REMOTE_COLORS;

  const itemOrderRef = React.useRef<readonly string[]>(itemOrder);
  const resolveItemElementRef = React.useRef(resolveItemElement);
  const resolveCreateInputRef = React.useRef(resolveCreateInput);
  const followReorderRef = React.useRef(false);
  const followReorderBehaviorRef = React.useRef<ScrollBehavior>("smooth");

  React.useEffect(() => {
    itemOrderRef.current = itemOrder;
    dispatch({ type: "ensure-valid", order: itemOrder });
  }, [itemOrder]);

  React.useEffect(() => {
    resolveItemElementRef.current = resolveItemElement;
  }, [resolveItemElement]);

  React.useEffect(() => {
    resolveCreateInputRef.current = resolveCreateInput;
  }, [resolveCreateInput]);

  const actions = React.useMemo<SelectionActions>(
    () => ({
      clear: () => dispatch({ type: "clear" }),
      focusCreatePreview: () =>
        dispatch({ type: "focus-create", mode: "preview" }),
      focusCreateEditing: () =>
        dispatch({ type: "focus-create", mode: "editing" }),
      focusItemPreview: (cid: string) =>
        dispatch({
          type: "focus-item",
          mode: "preview",
          cid,
          order: itemOrderRef.current,
        }),
      focusItemEditing: (cid: string) =>
        dispatch({
          type: "focus-item",
          mode: "editing",
          cid,
          order: itemOrderRef.current,
        }),
      enterEditing: () => dispatch({ type: "enter-editing" }),
      exitEditing: () => dispatch({ type: "exit-editing" }),
      selectNext: () =>
        dispatch({ type: "select-next", order: itemOrderRef.current }),
      selectPrev: () =>
        dispatch({ type: "select-prev", order: itemOrderRef.current }),
      handleItemRemoved: (cid: string) =>
        dispatch({ type: "item-removed", cid, order: itemOrderRef.current }),
      requestReorderFollow: (behavior: ScrollBehavior = "smooth") => {
        followReorderRef.current = true;
        followReorderBehaviorRef.current = behavior;
      },
    }),
    [dispatch],
  );

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    if (state.type === "create") {
      window.scrollTo({ top: 0, behavior: "auto" });
      const resolver = resolveCreateInputRef.current;
      const element = resolver ? resolver() : null;
      if (element) {
        scrollIntoViewWithMargin(element, false, "auto");
      }
      return;
    }

    if (state.type === "item") {
      const resolver = resolveItemElementRef.current;
      const element = resolver ? resolver(state.cid) : null;
      const order = itemOrderRef.current;
      const lastCid = order.length > 0 ? order[order.length - 1] : null;
      const preferBottom = lastCid != null && lastCid === state.cid;
      scrollIntoViewWithMargin(element, preferBottom, "auto");
    }
  }, [state]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const current = stateRef.current;
    if (current.type !== "item") return;
    if (!followReorderRef.current) return;
    followReorderRef.current = false;
    const resolver = resolveItemElementRef.current;
    const element = resolver ? resolver(current.cid) : null;
    const order = itemOrderRef.current;
    const lastCid = order.length > 0 ? order[order.length - 1] : null;
    const preferBottom = lastCid != null && lastCid === current.cid;
    const behavior = followReorderBehaviorRef.current ?? "smooth";
    scrollIntoViewWithMargin(element, preferBottom, behavior);
    followReorderBehaviorRef.current = "smooth";
  }, [itemOrder]);

  const value = React.useMemo<SelectionContextValue>(
    () => ({
      state,
      ref: stateRef,
      actions,
      remotePeers,
      remotePeerColors: remotePeerColorsValue,
      setRemotePeers: setRemotePeersStable,
    }),
    [state, actions, remotePeers, remotePeerColorsValue, setRemotePeersStable],
  );

  return (
    <SelectionContext.Provider value={value}>
      {children}
    </SelectionContext.Provider>
  );
}

export function useAppSelection(): SelectionContextValue {
  const ctx = React.useContext(SelectionContext);
  if (!ctx) {
    throw new Error("useAppSelection must be used within a SelectionProvider");
  }
  return ctx;
}
