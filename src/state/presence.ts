import { LoroEphemeralAdaptor } from "loro-adaptors/loro";
import type { Value } from "loro-crdt";
import type { LoroWebsocketClient } from "loro-websocket";
import { ROOM_ID } from "./constants";
import {
  clearSharedEphemeralStore,
  publishSharedEphemeralStore,
  type SharedEphemeralStore,
} from "./sharedEphemeral";

const PRESENCE_TTL_MS = 45000; // expire stale peers after 45s
const HEARTBEAT_MS = 15000; // heartbeat every 15s to reduce chatter
const FRESH_WINDOW_MS = 35000; // show as online if beat < 35s ago

export type IdleWindow = Window & {
  requestIdleCallback?: (cb: IdleRequestCallback) => number;
  cancelIdleCallback?: (handle: number) => void;
};

export type PresenceCleanup = () => Promise<void> | void;

export type PresenceSessionOptions = {
  client: LoroWebsocketClient;
  docPeerId: string;
  setPresencePeers: (peers: string[]) => void;
  setPresenceCount: (count: number) => void;
};

export type PresenceSchedulerOptions = {
  idleWindow: IdleWindow;
  docPeerId: string;
  setPresencePeers: (peers: string[]) => void;
  setPresenceCount: (count: number) => void;
  isActive: () => boolean;
};

export type PresenceScheduler = {
  schedule: (client: LoroWebsocketClient) => void;
  dispose: () => void;
};

export async function createPresenceSession(
  options: PresenceSessionOptions,
): Promise<PresenceCleanup | null> {
  try {
    const crdtModule = await import("loro-crdt");
    const { EphemeralStore } = crdtModule;
    const store = new EphemeralStore<Record<string, Value>>(PRESENCE_TTL_MS);
    const adaptor = new LoroEphemeralAdaptor(store);

    const dependentCleanupListeners = new Set<() => void | Promise<void>>();

    const shared: SharedEphemeralStore = {
      store,
      addDisposeListener: (listener) => {
        dependentCleanupListeners.add(listener);
        return () => {
          dependentCleanupListeners.delete(listener);
        };
      },
    };

    publishSharedEphemeralStore(options.client, shared);

    const runDependentCleanup = async () => {
      if (dependentCleanupListeners.size === 0) {
        return;
      }
      const tasks: Promise<unknown>[] = [];
      for (const listener of dependentCleanupListeners) {
        try {
          const result = listener();
          if (
            result &&
            typeof (result as Promise<unknown>).then === "function"
          ) {
            tasks.push(result as Promise<unknown>);
          }
        } catch {
          /* noop */
        }
      }
      dependentCleanupListeners.clear();
      if (tasks.length > 0) {
        await Promise.allSettled(tasks);
      }
    };

    const computePeers = () => {
      const entries = store.getAllStates() as Record<string, Value>;
      const now = Date.now();
      const peers = Object.entries(entries)
        .filter(
          ([key, value]) =>
            key.startsWith("p:") &&
            typeof value === "number" &&
            now - value < FRESH_WINDOW_MS,
        )
        .map(([key]) => key.slice(2))
        .sort();
      const collaborators = peers.filter((peer) => peer !== options.docPeerId);
      const hasSelf = peers.length !== collaborators.length;
      const totalParticipants = collaborators.length + (hasSelf ? 1 : 0);
      options.setPresencePeers(collaborators);
      options.setPresenceCount(totalParticipants > 0 ? totalParticipants : 1);
    };
    const unsubscribe = store.subscribe(() => computePeers());
    computePeers();

    const myKey = `p:${options.docPeerId}`;
    const sendBeat = () => store.set(myKey, Date.now());
    sendBeat();
    const heartbeat = window.setInterval(sendBeat, HEARTBEAT_MS);

    const localCleanup = async () => {
      try {
        unsubscribe();
      } catch {}
      await runDependentCleanup();
      try {
        store.delete(myKey);
      } catch {}
      try {
        store.destroy();
      } catch {}
      try {
        adaptor.destroy();
      } catch {}
      clearSharedEphemeralStore(options.client);
      options.setPresenceCount(0);
    };

    try {
      await options.client.waitConnected();
    } catch {
      window.clearInterval(heartbeat);
      await localCleanup();
      options.setPresencePeers([]);
      options.setPresenceCount(0);
      return null;
    }

    let room: Awaited<ReturnType<LoroWebsocketClient["join"]>> | null = null;
    try {
      room = await options.client.join({
        roomId: ROOM_ID,
        crdtAdaptor: adaptor,
      });
    } catch (error) {
      window.clearInterval(heartbeat);
      await localCleanup();
      throw error;
    }

    const onVis = () => sendBeat();
    document.addEventListener("visibilitychange", onVis);

    return async () => {
      document.removeEventListener("visibilitychange", onVis);
      window.clearInterval(heartbeat);
      try {
        await room?.destroy();
      } catch {
        /* noop */
      }
      await localCleanup();
      options.setPresencePeers([]);
      options.setPresenceCount(0);
    };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn("Presence setup failed:", error);
    clearSharedEphemeralStore(options.client);
    options.setPresencePeers([]);
    options.setPresenceCount(0);
    return null;
  }
}

export function createPresenceScheduler(
  options: PresenceSchedulerOptions,
): PresenceScheduler {
  let cleanupRef: PresenceCleanup | null = null;
  let presenceIdleHandle: number | undefined;
  let presenceStartTimeout: number | undefined;

  const resetState = () => {
    options.setPresencePeers([]);
    options.setPresenceCount(0);
  };

  const cancelSchedule = () => {
    if (
      presenceIdleHandle !== undefined &&
      typeof options.idleWindow.cancelIdleCallback === "function"
    ) {
      options.idleWindow.cancelIdleCallback(presenceIdleHandle);
    }
    if (presenceStartTimeout !== undefined) {
      window.clearTimeout(presenceStartTimeout);
    }
    presenceIdleHandle = undefined;
    presenceStartTimeout = undefined;
  };

  const disposeCurrent = () => {
    cancelSchedule();
    const existing = cleanupRef;
    cleanupRef = null;
    if (existing) {
      void existing();
    }
    resetState();
  };

  const schedule = (client: LoroWebsocketClient) => {
    disposeCurrent();
    const run = async () => {
      const cleanup = await createPresenceSession({
        client,
        docPeerId: options.docPeerId,
        setPresencePeers: options.setPresencePeers,
        setPresenceCount: options.setPresenceCount,
      });
      if (!options.isActive()) {
        if (cleanup) void cleanup();
        return;
      }
      cleanupRef = cleanup;
    };

    if (typeof options.idleWindow.requestIdleCallback === "function") {
      presenceIdleHandle = options.idleWindow.requestIdleCallback(() => {
        presenceIdleHandle = undefined;
        void run();
      });
    } else {
      presenceStartTimeout = window.setTimeout(() => {
        presenceStartTimeout = undefined;
        void run();
      }, 400);
    }
  };

  const dispose = () => {
    disposeCurrent();
  };

  return { schedule, dispose };
}
