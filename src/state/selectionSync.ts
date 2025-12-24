import type { Value } from "loro-crdt";
import type { LoroWebsocketClient } from "loro-websocket";
import type {
  RemotePeerSelection,
  RemoteSelectionMap,
  SelectionMode,
} from "../selection";
import { waitForSharedEphemeralStore } from "./sharedEphemeral";

const noop = (): void => {};

export type SelectionSyncHandlers = {
  onRemoteSelections: (peers: RemoteSelectionMap) => void;
};

export type SelectionSyncSession = {
  updateLocalSelection: (
    selection: { cid: string; mode: SelectionMode } | null,
  ) => void;
  cleanup: () => Promise<void> | void;
};

type StoreValue = RemotePeerSelection;

const KEY_PREFIX = "sel:";

export async function createSelectionSyncSession(options: {
  client: LoroWebsocketClient;
  docPeerId: string;
  handlers: SelectionSyncHandlers;
}): Promise<SelectionSyncSession | null> {
  try {
    const shared = await waitForSharedEphemeralStore(options.client);
    if (!shared) {
      options.handlers.onRemoteSelections({});
      return null;
    }

    const { store, addDisposeListener } = shared;
    let disposed = false;

    const computeRemoteSelections = () => {
      if (disposed) {
        return;
      }
      const all = store.getAllStates() as Record<string, Value>;
      const result: RemoteSelectionMap = {};
      for (const [key, value] of Object.entries(all)) {
        if (!key.startsWith(KEY_PREFIX)) continue;
        const peerId = key.slice(KEY_PREFIX.length);
        if (!peerId || peerId === options.docPeerId) continue;
        if (!value || typeof value !== "object") continue;
        const payload = value as Partial<StoreValue>;
        if (typeof payload.cid !== "string") continue;
        const mode: SelectionMode =
          payload.mode === "editing" ? "editing" : "preview";
        const updatedAt =
          typeof payload.updatedAt === "number" &&
          Number.isFinite(payload.updatedAt)
            ? payload.updatedAt
            : Date.now();
        result[peerId] = { cid: payload.cid, mode, updatedAt };
      }
      options.handlers.onRemoteSelections(result);
    };

    const unsubscribe = store.subscribe(() => {
      computeRemoteSelections();
    });
    computeRemoteSelections();

    const myKey = `${KEY_PREFIX}${options.docPeerId}`;

    const updateLocalSelection = (
      selection: { cid: string; mode: SelectionMode } | null,
    ) => {
      if (disposed) {
        return;
      }
      if (!selection) {
        try {
          store.delete(myKey);
        } catch {
          /* noop */
        }
        return;
      }
      const payload: StoreValue = {
        cid: selection.cid,
        mode: selection.mode,
        updatedAt: Date.now(),
      };
      try {
        store.set(myKey, payload as unknown as Value);
      } catch {
        /* noop */
      }
    };

    const cleanup = async () => {
      if (disposed) {
        return;
      }
      disposed = true;
      try {
        unsubscribe();
      } catch {
        /* noop */
      }
      try {
        store.delete(myKey);
      } catch {
        /* noop */
      }
      options.handlers.onRemoteSelections({});
    };

    let removeDisposeListener: () => void = noop;
    const disposeListener = () => {
      removeDisposeListener();
      return cleanup();
    };
    removeDisposeListener = addDisposeListener(disposeListener);

    const wrappedCleanup = async () => {
      removeDisposeListener();
      await cleanup();
    };

    return {
      updateLocalSelection,
      cleanup: wrappedCleanup,
    };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn("Selection sync setup failed:", error);
    options.handlers.onRemoteSelections({});
    return null;
  }
}
