import type { EphemeralStore, Value } from "loro-crdt";
import type { LoroWebsocketClient } from "loro-websocket";

type DisposeListener = () => void | Promise<void>;

type SharedEphemeralEntry = {
    value?: SharedEphemeralStore;
    waiters: ((value: SharedEphemeralStore | null) => void)[];
};

const registry = new WeakMap<LoroWebsocketClient, SharedEphemeralEntry>();

export type SharedEphemeralStore = {
    store: EphemeralStore<Record<string, Value>>;
    addDisposeListener(listener: DisposeListener): () => void;
};

export function publishSharedEphemeralStore(
    client: LoroWebsocketClient,
    value: SharedEphemeralStore,
): void {
    let entry = registry.get(client);
    if (!entry) {
        entry = { waiters: [] };
        registry.set(client, entry);
    }
    entry.value = value;
    if (entry.waiters.length > 0) {
        const waiters = entry.waiters.slice();
        entry.waiters.length = 0;
        for (const resolve of waiters) {
            resolve(value);
        }
    }
}

export function clearSharedEphemeralStore(client: LoroWebsocketClient): void {
    const entry = registry.get(client);
    if (!entry) {
        return;
    }
    entry.value = undefined;
    if (entry.waiters.length > 0) {
        const waiters = entry.waiters.slice();
        entry.waiters.length = 0;
        for (const resolve of waiters) {
            resolve(null);
        }
    }
}

export function waitForSharedEphemeralStore(
    client: LoroWebsocketClient,
): Promise<SharedEphemeralStore | null> {
    const entry = registry.get(client);
    if (entry?.value) {
        return Promise.resolve(entry.value);
    }
    return new Promise((resolve) => {
        let current = registry.get(client);
        if (!current) {
            current = { waiters: [] };
            registry.set(client, current);
        }
        current.waiters.push(resolve);
    });
}
