import { LoroDoc } from "loro-crdt";
import { LoroAdaptor } from "loro-adaptors/loro";
import { createPeerLeaseManager } from "./peerLeaseManager";
import { ClientStatus, LoroWebsocketClient } from "loro-websocket";
import type { ClientStatusValue } from "loro-websocket";
import {
  base64UrlToBytes,
  buildAuthUrl,
  bytesToHex,
  exportRawPublicKeyHex,
  getFallbackWorkspaceKeys,
  importKeyPairFromHex,
  hasSubtleCrypto,
  signSaltTokenHex,
} from "./crypto";
import {
  getDocSnapshot,
  getWorkspace,
  listWorkspaces,
  openDocDb,
  saveWorkspaceSnapshot,
  type WorkspaceRecord,
  upsertWorkspace,
} from "./storage";
import { ROOM_ID, SYNC_BASE } from "./constants";

export { SYNC_BASE, ROOM_ID } from "./constants";

let welcomeSnapshotPromise: Promise<Uint8Array> | null = null;

async function fetchWelcomeSnapshot(): Promise<Uint8Array | null> {
  if (typeof fetch !== "function") {
    return null;
  }
  if (!welcomeSnapshotPromise) {
    welcomeSnapshotPromise = (async () => {
      const response = await fetch("/Welcome_Todos.loro");
      if (!response.ok) {
        throw new Error(
          `Failed to fetch onboarding snapshot: ${response.status} ${response.statusText}`,
        );
      }
      const buffer = await response.arrayBuffer();
      return new Uint8Array(buffer);
    })();
    welcomeSnapshotPromise = welcomeSnapshotPromise.catch((error) => {
      welcomeSnapshotPromise = null;
      throw error;
    });
  }
  try {
    return await welcomeSnapshotPromise;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn("Load welcome snapshot failed:", error);
    return null;
  }
}

export type PublicSyncHandlers = {
  setDetached: (detached: boolean) => void;
  setOnline: (online: boolean) => void;
  setWorkspaceHex: (hex: string) => void;
  setShareUrl: (url: string) => void;
  setWorkspaces?: (list: WorkspaceRecord[]) => void;
  getWorkspaceTitle?: () => string;
  setConnectionStatus?: (status: ClientStatusValue) => void;
  setLatency?: (latency: number | null) => void;
  setJoiningState?: (joining: boolean) => void;
};

export type PublicSyncSession = {
  client: LoroWebsocketClient | null;
  cleanup: () => Promise<void> | void;
};

export type WorkspaceConnectionKeys = {
  publicHex: string;
  privateHex: string;
};

export type PublicSyncOptions = {
  bootstrapWelcomeDoc?: boolean;
};

export async function setupPublicSync(
  doc: LoroDoc,
  keys: WorkspaceConnectionKeys,
  handlers: PublicSyncHandlers,
  options: PublicSyncOptions = {},
): Promise<PublicSyncSession> {
  let adaptor: LoroAdaptor | null = null;
  let roomCleanup: (() => Promise<void> | void) | null = null;
  let offStatus: (() => void) | null = null;
  let offLatency: (() => void) | null = null;
  let client: LoroWebsocketClient | null = null;
  let joinStateSignaled = false;
  const signalJoiningState = (joining: boolean) => {
    if (joinStateSignaled === joining) return;
    joinStateSignaled = joining;
    handlers.setJoiningState?.(joining);
  };
  const peerLease = createPeerLeaseManager(doc);

  const subtleAvailable = hasSubtleCrypto();
  const fallbackKeys = getFallbackWorkspaceKeys();
  let currentPublicHex = (
    subtleAvailable ? keys.publicHex : fallbackKeys.publicHex
  )
    .trim()
    .toLowerCase();
  let currentPrivateHex = (
    subtleAvailable ? keys.privateHex : fallbackKeys.privateHex
  )
    .trim()
    .toLowerCase();
  let shareUrl = subtleAvailable
    ? `${window.location.origin}/${currentPublicHex}#${currentPrivateHex}`
    : fallbackKeys.share;
  let shouldBootstrapWelcomeDoc = options.bootstrapWelcomeDoc === true;
  let hasLocalSnapshot = false;
  let workspaceKnown = false;

  handlers.setWorkspaceHex(currentPublicHex);
  handlers.setShareUrl(shareUrl);

  try {
    try {
      const db = await openDocDb();
      const existing = await getWorkspace(db, currentPublicHex);
      workspaceKnown = Boolean(existing);
      const now = Date.now();
      const record: WorkspaceRecord = {
        id: currentPublicHex,
        privateHex: currentPrivateHex,
        createdAt: existing?.createdAt ?? now,
        lastUsedAt: now,
        name:
          handlers.getWorkspaceTitle?.() || existing?.name || existing?.label,
      };
      await upsertWorkspace(db, record);
      if (handlers.setWorkspaces) {
        const all = await listWorkspaces(db);
        handlers.setWorkspaces(all);
      }
      db.close();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn("IndexedDB workspace save/list failed:", error);
    }

    try {
      const db = await openDocDb();
      const snapshot = await getDocSnapshot(db, currentPublicHex);
      if (snapshot) {
        doc.import(new Uint8Array(snapshot));
        hasLocalSnapshot = true;
      }
      db.close();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn("IndexedDB load failed:", error);
    }

    if (shouldBootstrapWelcomeDoc && !hasLocalSnapshot) {
      const welcomeBytes = await fetchWelcomeSnapshot();
      if (welcomeBytes) {
        try {
          doc.import(welcomeBytes);
          await saveWorkspaceSnapshot(doc, currentPublicHex);
          hasLocalSnapshot = true;
        } catch (error) {
          // eslint-disable-next-line no-console
          console.warn("Apply welcome snapshot failed:", error);
        }
      }
      shouldBootstrapWelcomeDoc = false;
    }

    if (!subtleAvailable) {
      await peerLease.acquire(currentPublicHex);
      console.warn(
        "Web Crypto Subtle API unavailable; skipping websocket sync and keeping workspace offline.",
      );
      handlers.setDetached(doc.isDetached());
      handlers.setConnectionStatus?.(ClientStatus.Disconnected);
      handlers.setLatency?.(null);
      handlers.setOnline(false);
      signalJoiningState(false);
    } else {
      const imported = await importKeyPairFromHex(
        currentPublicHex,
        currentPrivateHex,
      );
      if (!imported) {
        throw new Error("Invalid workspace keys");
      }
      const privateKey = imported.privateKey;
      const publicKey = imported.publicKey;
      currentPublicHex = (await exportRawPublicKeyHex(publicKey))
        .trim()
        .toLowerCase();
      const jwkPriv = await crypto.subtle.exportKey("jwk", privateKey);
      const dBytes = base64UrlToBytes(jwkPriv.d ?? "");
      currentPrivateHex = bytesToHex(dBytes);
      shareUrl = `${window.location.origin}/${currentPublicHex}#${currentPrivateHex}`;

      handlers.setWorkspaceHex(currentPublicHex);
      handlers.setShareUrl(shareUrl);

      try {
        const db = await openDocDb();
        const existing = await getWorkspace(db, currentPublicHex);
        const now = Date.now();
        const record: WorkspaceRecord = {
          id: currentPublicHex,
          privateHex: currentPrivateHex,
          createdAt: existing?.createdAt ?? now,
          lastUsedAt: now,
          name:
            handlers.getWorkspaceTitle?.() || existing?.name || existing?.label,
        };
        await upsertWorkspace(db, record);
        if (handlers.setWorkspaces) {
          const all = await listWorkspaces(db);
          handlers.setWorkspaces(all);
        }
        db.close();
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn("IndexedDB workspace save/list failed:", error);
      }

      await peerLease.acquire(currentPublicHex);
      adaptor = new LoroAdaptor(doc);
      const activeAdaptor = adaptor;
      const token = await signSaltTokenHex(privateKey);
      const url = buildAuthUrl(SYNC_BASE, currentPublicHex, token);
      const activeClient = new LoroWebsocketClient({ url });
      client = activeClient;
      const shouldSignalJoining =
        !workspaceKnown && !hasLocalSnapshot && !shouldBootstrapWelcomeDoc;
      if (shouldSignalJoining) {
        signalJoiningState(true);
      } else {
        signalJoiningState(false);
      }

      const applyStatus = (status: ClientStatusValue) => {
        handlers.setConnectionStatus?.(status);
        handlers.setOnline(status === ClientStatus.Connected);
        if (status === ClientStatus.Connected) {
          const currentLatency = activeClient.getLatency();
          if (currentLatency !== undefined) {
            handlers.setLatency?.(currentLatency);
          }
        } else {
          handlers.setLatency?.(null);
        }
      };

      applyStatus(activeClient.getStatus());
      offStatus = activeClient.onStatusChange((status) => applyStatus(status));
      if (handlers.setLatency) {
        offLatency = activeClient.onLatency((ms) => {
          handlers.setLatency?.(ms);
        });
      }

      await activeClient.waitConnected();
      const room = await activeClient.join({
        roomId: ROOM_ID,
        crdtAdaptor: activeAdaptor,
      });
      await room.waitForReachingServerVersion();
      signalJoiningState(false);
      handlers.setDetached(doc.isDetached());
      handlers.setOnline(true);
      try {
        void activeClient.ping().catch(() => undefined);
      } catch {
        /* noop */
      }

      roomCleanup = async () => {
        try {
          await room.destroy();
        } catch {
          /* noop */
        }
      };
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("Failed to connect to Loro public sync:", error);
    offStatus?.();
    offLatency?.();
    handlers.setConnectionStatus?.(ClientStatus.Disconnected);
    handlers.setLatency?.(null);
    handlers.setOnline(false);
    signalJoiningState(false);
    peerLease.destroy();
  }

  const cleanup = () => {
    peerLease.destroy();
    void roomCleanup?.();
    offStatus?.();
    offLatency?.();
    adaptor?.destroy();
    adaptor = null;
    handlers.setConnectionStatus?.(ClientStatus.Disconnected);
    handlers.setLatency?.(null);
    handlers.setOnline(false);
    signalJoiningState(false);
    if (client) {
      try {
        client.destroy();
      } catch {
        /* noop */
      }
      client = null;
    }
  };

  return { client, cleanup };
}
