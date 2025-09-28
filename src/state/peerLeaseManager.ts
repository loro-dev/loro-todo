import type { LoroDoc } from "loro-crdt";
import {
    attachPeerLeaseLifecycle,
    tryReuseLoroPeerId,
} from "@loro-dev/peer-lease";
import type { LoroPeerIdReleaseHandle } from "@loro-dev/peer-lease";

type DetachLifecycle = () => void;

export type PeerLeaseManager = {
    acquire: (workspaceId: string) => Promise<void>;
    release: () => void;
    destroy: () => void;
};

export function createPeerLeaseManager(doc: LoroDoc): PeerLeaseManager {
    let releaseHandle: LoroPeerIdReleaseHandle | null = null;
    let detachLifecycle: DetachLifecycle | null = null;
    let pendingAcquire: Promise<void> | null = null;
    let destroyed = false;

    const cleanupLifecycle = () => {
        if (detachLifecycle) {
            detachLifecycle();
            detachLifecycle = null;
        }
    };

    const release = () => {
        if (!releaseHandle) return;
        const handle = releaseHandle;
        releaseHandle = null;
        cleanupLifecycle();
        if (handle.isReleased()) {
            return;
        }
        try {
            const result = handle();
            if (
                result &&
                typeof (result as Promise<unknown>).then === "function"
            ) {
                void (result as Promise<unknown>);
            }
        } catch {
            releaseHandle = handle;
        }
    };

    const attachLifecycle = (workspaceId: string) => {
        if (typeof window === "undefined" || !releaseHandle) {
            return;
        }
        cleanupLifecycle();
        const handle = releaseHandle;
        detachLifecycle = attachPeerLeaseLifecycle({
            release: handle,
            doc,
            onResume: async () => {
                if (destroyed || !handle.isReleased()) {
                    return;
                }
                await acquire(workspaceId);
            },
        });
    };

    const acquire = async (workspaceId: string) => {
        if (!workspaceId || destroyed) return;
        if (pendingAcquire) {
            await pendingAcquire;
            return;
        }
        const job = (async () => {
            try {
                const handle = await tryReuseLoroPeerId(workspaceId, doc);
                release();
                if (destroyed) {
                    releaseHandle = handle;
                    release();
                    return;
                }
                releaseHandle = handle;
                attachLifecycle(workspaceId);
            } catch (error) {
                releaseHandle = null;
                cleanupLifecycle();
                // eslint-disable-next-line no-console
                console.warn("Failed to reuse peer id:", error);
            } finally {
                pendingAcquire = null;
            }
        })();
        pendingAcquire = job;
        await job;
    };

    const destroy = () => {
        destroyed = true;
        cleanupLifecycle();
        release();
    };

    return {
        acquire,
        release,
        destroy,
    };
}
