import {
    fetchWorkspaceById,
    ensurePersistentStorage,
    deleteWorkspaceAndList,
    listAllWorkspaces,
    saveWorkspaceSnapshot,
    snapshotToArrayBuffer,
    setupWorkspacePersistence,
    updateWorkspaceName,
    type WorkspaceRecord,
} from "./state/storage";
import type { WorkspaceConnectionKeys } from "./state/publicSync";

type PublicSyncModule = typeof import("./state/publicSync");
type CryptoModule = typeof import("./state/crypto");

let bootstrapNextWorkspace = false;
let publicSyncModulePromise: Promise<PublicSyncModule> | null = null;
let cryptoModulePromise: Promise<CryptoModule> | null = null;

export type WorkspaceKeys = WorkspaceConnectionKeys;
export type {
    WorkspaceRecord,
};

export function normalizeHex(value: string): string {
    return value.trim().toLowerCase();
}

export function getWorkspaceRouteKey(): string {
    if (typeof window === "undefined") return "ssr";
    const pathParts = window.location.pathname.split("/").filter(Boolean);
    const maybePub =
        pathParts.length > 0 ? normalizeHex(pathParts[pathParts.length - 1]) : "";
    const rawHash = window.location.hash.startsWith("#")
        ? window.location.hash.slice(1)
        : "";
    const maybePriv = rawHash ? normalizeHex(rawHash) : "";
    return `${maybePub}#${maybePriv}`;
}

export function navigateToWorkspaceRoute(
    publicHex: string,
    privateHex: string,
    options: { replace?: boolean } = {},
): void {
    const normalizedPublic = normalizeHex(publicHex);
    const normalizedPrivate = normalizeHex(privateHex);
    const target = `/${normalizedPublic}#${normalizedPrivate}`;
    const method = options.replace ? "replaceState" : "pushState";
    window.history[method](null, "", target);
    const evt =
        typeof PopStateEvent === "function"
            ? new PopStateEvent("popstate")
            : new Event("popstate");
    window.dispatchEvent(evt);
}

export async function switchToWorkspace(id: string): Promise<void> {
    const record = await fetchWorkspaceById(id);
    if (!record) return;
    navigateToWorkspaceRoute(record.id, record.privateHex);
}

export async function createNewWorkspace(): Promise<void> {
    const { generatePairAndUrl } = await loadCryptoModule();
    const generated = await generatePairAndUrl();
    navigateToWorkspaceRoute(generated.publicHex, generated.privateHex);
}

export function markBootstrapNextWorkspace(): void {
    bootstrapNextWorkspace = true;
}

export function consumeBootstrapNextWorkspace(): boolean {
    const flag = bootstrapNextWorkspace;
    bootstrapNextWorkspace = false;
    return flag;
}

export function setBootstrapNextWorkspace(value: boolean): void {
    bootstrapNextWorkspace = value;
}

export function getBootstrapNextWorkspace(): boolean {
    return bootstrapNextWorkspace;
}

export function loadPublicSyncModule(): Promise<PublicSyncModule> {
    if (!publicSyncModulePromise) {
        publicSyncModulePromise = import("./state/publicSync");
    }
    return publicSyncModulePromise;
}

export function loadCryptoModule(): Promise<CryptoModule> {
    if (!cryptoModulePromise) {
        cryptoModulePromise = import("./state/crypto");
    }
    return cryptoModulePromise;
}

export {
    deleteWorkspaceAndList,
    ensurePersistentStorage,
    listAllWorkspaces,
    saveWorkspaceSnapshot,
    setupWorkspacePersistence,
    snapshotToArrayBuffer,
    updateWorkspaceName,
};
