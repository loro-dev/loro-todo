import type { LoroDoc } from "loro-crdt";
import type { IdleWindow } from "./presence";

const DOC_DB_NAME = "loro-example-docs";
const DOC_DB_VERSION = 2;
const DOC_STORE = "docs";
const KEY_STORE = "keys";

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

export function openDocDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request: IDBOpenDBRequest = indexedDB.open(
            DOC_DB_NAME,
            DOC_DB_VERSION,
        );
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
