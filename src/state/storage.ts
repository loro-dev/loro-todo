import type { LoroDoc } from "loro-crdt";
import type { IdleWindow } from "./presence";

const DOC_DB_NAME = "loro-example-docs";
const DOC_DB_VERSION = 2;
const DOC_STORE = "docs";
const KEY_STORE = "keys";
const CRITICAL_BUCKET_NAME = "critical";

type StorageBucketDurability = "relaxed" | "strict";

type StorageBucket = {
    indexedDB: IDBFactory;
};

type StorageBucketsNavigator = Navigator & {
    storageBuckets?: {
        open: (
            name: string,
            options?: {
                durability?: StorageBucketDurability;
                persisted?: boolean;
            },
        ) => Promise<StorageBucket>;
    };
};

let persistentStorageGranted: boolean | undefined;
let persistentStorageSupported: boolean | undefined;
let persistentStorageRequest: Promise<boolean> | null = null;

let criticalBucketFactoryPromise: Promise<IDBFactory | null> | null = null;
let bucketFallbackLogged = false;

export type PersistentStorageResult = {
    granted: boolean;
    supported: boolean;
};

export type DocRecord = { id: string; snapshot: ArrayBuffer };
export type WorkspaceRecord = {
    id: string;
    privateHex: string;
    createdAt: number;
    lastUsedAt: number;
    name?: string;
    label?: string;
};

export function snapshotToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    const { buffer, byteOffset, byteLength } = bytes;
    if (buffer instanceof ArrayBuffer) {
        return buffer.slice(byteOffset, byteOffset + byteLength);
    }
    const copy = new Uint8Array(byteLength);
    copy.set(bytes);
    return copy.buffer;
}

export async function ensurePersistentStorage(): Promise<PersistentStorageResult> {
    if (persistentStorageGranted) {
        return {
            granted: true,
            supported: persistentStorageSupported !== false,
        };
    }
    if (persistentStorageSupported === false) {
        return { granted: false, supported: false };
    }
    if (typeof window !== "undefined" && !window.isSecureContext) {
        persistentStorageSupported = false;
        return { granted: false, supported: false };
    }
    if (typeof navigator === "undefined") {
        return { granted: false, supported: false };
    }
    const storageManager = navigator.storage;
    if (!storageManager) {
        persistentStorageSupported = false;
        persistentStorageGranted = false;
        return { granted: false, supported: false };
    }

    const supportsPersisted = typeof storageManager.persisted === "function";
    const supportsPersist = typeof storageManager.persist === "function";

    if (!supportsPersist && !supportsPersisted) {
        persistentStorageSupported = false;
        persistentStorageGranted = false;
        return { granted: false, supported: false };
    }

    try {
        if (supportsPersisted) {
            const persisted = await storageManager.persisted();
            if (persisted) {
                persistentStorageGranted = true;
                persistentStorageSupported = true;
                return { granted: true, supported: true };
            }
        }
    } catch {
        // ignore persisted() failures and fall through to persist()
    }

    if (!supportsPersist) {
        persistentStorageSupported = false;
        persistentStorageGranted = false;
        return { granted: false, supported: false };
    }

    persistentStorageSupported = true;

    if (!persistentStorageRequest) {
        persistentStorageRequest = (async () => {
            try {
                const granted = await storageManager.persist();
                if (granted) {
                    persistentStorageGranted = true;
                    return true;
                }
                if (supportsPersisted) {
                    const persistedAfter = await storageManager.persisted();
                    if (persistedAfter) {
                        persistentStorageGranted = true;
                        return true;
                    }
                }
            } catch {
                // fall through to mark as not granted
            }
            persistentStorageGranted = false;
            return false;
        })().finally(() => {
            persistentStorageRequest = null;
        });
    }

    const granted = await persistentStorageRequest;
    return { granted, supported: true };
}

async function getCriticalBucketFactory(): Promise<IDBFactory | null> {
    if (criticalBucketFactoryPromise) return criticalBucketFactoryPromise;
    if (typeof window !== "undefined" && !window.isSecureContext) {
        if (!bucketFallbackLogged) {
            // eslint-disable-next-line no-console
            console.info(
                "Storage Buckets require a secure context; falling back to default IndexedDB.",
            );
            bucketFallbackLogged = true;
        }
        return null;
    }
    if (typeof navigator === "undefined") return null;
    const nav = navigator as StorageBucketsNavigator;
    const manager = nav.storageBuckets;
    if (!manager?.open) {
        if (!bucketFallbackLogged) {
            // eslint-disable-next-line no-console
            console.info(
                "Storage Buckets API unavailable; using default IndexedDB.",
            );
            bucketFallbackLogged = true;
        }
        return null;
    }
    criticalBucketFactoryPromise = (async () => {
        try {
            const bucket = await manager.open(CRITICAL_BUCKET_NAME, {
                durability: "strict",
                persisted: true,
            });
            return bucket.indexedDB;
        } catch (error) {
            if (!bucketFallbackLogged) {
                // eslint-disable-next-line no-console
                console.warn(
                    "Storage Buckets open failed; falling back to default IndexedDB.",
                    error,
                );
                bucketFallbackLogged = true;
            }
            return null;
        }
    })();
    const factory = await criticalBucketFactoryPromise;
    if (!factory) {
        // Allow retrial later if the first attempt failed (e.g., unsupported)
        criticalBucketFactoryPromise = null;
    }
    return factory;
}

function getGlobalIndexedDbFactory(): IDBFactory {
    if (typeof indexedDB === "undefined") {
        throw new Error("IndexedDB is not available in this environment");
    }
    return indexedDB;
}

function openWithFactory(factory: IDBFactory): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = factory.open(DOC_DB_NAME, DOC_DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(DOC_STORE)) {
                db.createObjectStore(DOC_STORE, { keyPath: "id" });
            }
            if (!db.objectStoreNames.contains(KEY_STORE)) {
                db.createObjectStore(KEY_STORE, { keyPath: "id" });
            }
        };
        request.addEventListener("success", () => resolve(request.result));
        request.addEventListener("error", () =>
            reject(request.error ?? new Error("IDB open error")),
        );
    });
}

export async function openDocDb(): Promise<IDBDatabase> {
    const globalFactory = getGlobalIndexedDbFactory();
    const bucketFactory = await getCriticalBucketFactory();
    const factory = bucketFactory ?? globalFactory;
    try {
        return await openWithFactory(factory);
    } catch (error) {
        if (factory !== globalFactory) {
            if (!bucketFallbackLogged) {
                // eslint-disable-next-line no-console
                console.warn(
                    "Storage Bucket IndexedDB open failed; retrying with default factory.",
                    error,
                );
                bucketFallbackLogged = true;
            }
            return openWithFactory(globalFactory);
        }
        throw error;
    }
}

export function putDocSnapshot(
    db: IDBDatabase,
    id: string,
    snapshot: ArrayBuffer,
): Promise<void> {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(DOC_STORE, "readwrite");
        const store = tx.objectStore(DOC_STORE);
        const request = store.put({ id, snapshot } satisfies DocRecord);
        request.addEventListener("success", () => resolve());
        request.addEventListener("error", () =>
            reject(request.error ?? new Error("IDB put error")),
        );
    });
}

export function getDocSnapshot(
    db: IDBDatabase,
    id: string,
): Promise<ArrayBuffer | undefined> {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(DOC_STORE, "readonly");
        const store = tx.objectStore(DOC_STORE);
        const request: IDBRequest<DocRecord | undefined> = store.get(id);
        request.addEventListener("success", () => {
            const record = request.result;
            resolve(record?.snapshot);
        });
        request.addEventListener("error", () =>
            reject(request.error ?? new Error("IDB get error")),
        );
    });
}

export function upsertWorkspace(
    db: IDBDatabase,
    record: WorkspaceRecord,
): Promise<void> {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(KEY_STORE, "readwrite");
        const store = tx.objectStore(KEY_STORE);
        const request = store.put(record);
        request.addEventListener("success", () => resolve());
        request.addEventListener("error", () =>
            reject(request.error ?? new Error("IDB put error")),
        );
    });
}

export function getWorkspace(
    db: IDBDatabase,
    id: string,
): Promise<WorkspaceRecord | undefined> {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(KEY_STORE, "readonly");
        const store = tx.objectStore(KEY_STORE);
        const request: IDBRequest<WorkspaceRecord | undefined> = store.get(id);
        request.addEventListener("success", () => {
            resolve(request.result ?? undefined);
        });
        request.addEventListener("error", () =>
            reject(request.error ?? new Error("IDB get error")),
        );
    });
}

export function listWorkspaces(db: IDBDatabase): Promise<WorkspaceRecord[]> {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(KEY_STORE, "readonly");
        const store = tx.objectStore(KEY_STORE);
        const request: IDBRequest<WorkspaceRecord[]> = store.getAll();
        request.addEventListener("success", () => {
            const records = request.result ?? [];
            records.sort((a, b) => b.lastUsedAt - a.lastUsedAt);
            resolve(records);
        });
        request.addEventListener("error", () =>
            reject(request.error ?? new Error("IDB getAll error")),
        );
    });
}

export function deleteWorkspace(db: IDBDatabase, id: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(KEY_STORE, "readwrite");
        const store = tx.objectStore(KEY_STORE);
        const request = store.delete(id);
        request.addEventListener("success", () => resolve());
        request.addEventListener("error", () =>
            reject(request.error ?? new Error("IDB delete error")),
        );
    });
}

export async function withDocDb<T>(fn: (db: IDBDatabase) => Promise<T>): Promise<T> {
    const db = await openDocDb();
    try {
        return await fn(db);
    } finally {
        db.close();
    }
}

export function fetchWorkspaceById(id: string): Promise<WorkspaceRecord | undefined> {
    return withDocDb((db) => getWorkspace(db, id));
}

export function listAllWorkspaces(): Promise<WorkspaceRecord[]> {
    return withDocDb((db) => listWorkspaces(db));
}

export async function deleteWorkspaceAndList(id: string): Promise<WorkspaceRecord[]> {
    return withDocDb(async (db) => {
        await deleteWorkspace(db, id);
        return listWorkspaces(db);
    });
}

export async function updateWorkspaceName(
    id: string,
    name: string,
): Promise<WorkspaceRecord[] | undefined> {
    return withDocDb(async (db) => {
        const existing = await getWorkspace(db, id);
        if (!existing) return undefined;
        const record: WorkspaceRecord = {
            ...existing,
            name,
        };
        await upsertWorkspace(db, record);
        return listWorkspaces(db);
    });
}

export async function saveWorkspaceSnapshot(
    doc: LoroDoc,
    workspaceId: string,
): Promise<void> {
    const snapshot = doc.export({ mode: "snapshot" });
    const buffer = snapshotToArrayBuffer(snapshot);
    await withDocDb((db) => putDocSnapshot(db, workspaceId, buffer));
}

const DEFAULT_PERSIST_DEBOUNCE_MS = 400;

export type WorkspacePersistenceOptions = {
    doc: LoroDoc;
    workspaceId: string;
    idleWindow: IdleWindow;
    debounceMs?: number;
    onError?: (error: unknown) => void;
};

export function setupWorkspacePersistence({
    doc,
    workspaceId,
    idleWindow,
    debounceMs = DEFAULT_PERSIST_DEBOUNCE_MS,
    onError,
}: WorkspacePersistenceOptions): () => void {
    let disposed = false;
    let dbRef: IDBDatabase | null = null;
    let saveTimer: number | undefined;
    let ensureDbPromise: Promise<void> | null = null;
    let ensureScheduled = false;
    let idleHandle: number | undefined;
    let ensureTimeout: number | undefined;
    let pendingSave = false;

    const reportError = (error: unknown) => {
        if (onError) {
            onError(error);
        } else {
            // eslint-disable-next-line no-console
            console.warn("IndexedDB persistence error:", error);
        }
    };

    const scheduleSave = () => {
        if (!dbRef) return;
        if (saveTimer) window.clearTimeout(saveTimer);
        saveTimer = window.setTimeout(async () => {
            if (disposed || !dbRef) return;
            try {
                const snapshot = doc.export({ mode: "snapshot" });
                await putDocSnapshot(
                    dbRef,
                    workspaceId,
                    snapshotToArrayBuffer(snapshot),
                );
                pendingSave = false;
            } catch (error) {
                reportError(error);
            }
        }, debounceMs);
    };

    const ensureDb = async () => {
        if (dbRef) return;
        try {
            dbRef = await openDocDb();
        } catch (error) {
            reportError(error);
        } finally {
            ensureScheduled = false;
            ensureDbPromise = null;
            if (!disposed && pendingSave && dbRef) {
                scheduleSave();
            }
        }
    };

    const scheduleEnsureDb = () => {
        if (dbRef || ensureDbPromise || ensureScheduled) return;
        ensureScheduled = true;
        const run = () => {
            idleHandle = undefined;
            ensureDbPromise = ensureDb();
        };
        if (typeof idleWindow.requestIdleCallback === "function") {
            idleHandle = idleWindow.requestIdleCallback(run);
        } else {
            ensureTimeout = window.setTimeout(() => {
                ensureTimeout = undefined;
                ensureDbPromise = ensureDb();
            }, 350);
        }
    };

    const markSaveNeeded = () => {
        pendingSave = true;
        if (dbRef) {
            scheduleSave();
        } else {
            scheduleEnsureDb();
        }
    };

    scheduleEnsureDb();

    const unsubscribe = doc.subscribe(() => {
        if (disposed) return;
        markSaveNeeded();
    });

    return () => {
        disposed = true;
        unsubscribe();
        if (saveTimer) window.clearTimeout(saveTimer);
        if (dbRef) dbRef.close();
        if (
            idleHandle !== undefined &&
            typeof idleWindow.cancelIdleCallback === "function"
        ) {
            idleWindow.cancelIdleCallback(idleHandle);
        }
        if (ensureTimeout !== undefined) window.clearTimeout(ensureTimeout);
    };
}
