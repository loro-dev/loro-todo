import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkspaceKeys } from "./workspace";
import {
    getBootstrapNextWorkspace,
    getWorkspaceRouteKey,
    listAllWorkspaces,
    loadCryptoModule,
    setBootstrapNextWorkspace,
} from "./workspace";
import { WorkspaceSession } from "./WorkspaceSession";

export function App() {
    const [workspace, setWorkspace] = useState<WorkspaceKeys | null>(null);
    const [fallbackActive, setFallbackActive] = useState<boolean>(false);
    const [bootstrapWelcomeDoc, setBootstrapWelcomeDoc] =
        useState<boolean>(false);
    const ensureCounterRef = useRef(0);
    const workspaceRef = useRef<WorkspaceKeys | null>(null);
    const currentKeyRef = useRef<string | null>(null);

    useEffect(() => {
        workspaceRef.current = workspace;
        currentKeyRef.current = workspace
            ? `${workspace.publicHex}#${workspace.privateHex}`
            : null;
    }, [workspace]);

    const ensureWorkspace = useCallback(async () => {
        if (typeof window === "undefined") return;
        const routeKey = getWorkspaceRouteKey();
        const current = currentKeyRef.current;
        const activeWorkspace = workspaceRef.current;
        if (current === routeKey && activeWorkspace) {
            const canonicalPath = `/${activeWorkspace.publicHex}`;
            const canonicalHash = `#${activeWorkspace.privateHex}`;
            if (
                window.location.pathname !== canonicalPath ||
                window.location.hash !== canonicalHash
            ) {
                history.replaceState(null, "", `${canonicalPath}${canonicalHash}`);
            }
            setBootstrapWelcomeDoc(false);
            setWorkspace(activeWorkspace);
            return;
        }

        ensureCounterRef.current += 1;
        const ensureId = ensureCounterRef.current;
        const bootstrapFlag = getBootstrapNextWorkspace();
        const applyFallbackFlag = (value: boolean) => {
            if (ensureCounterRef.current !== ensureId) return;
            setFallbackActive(value);
        };
        setWorkspace(null);
        setBootstrapWelcomeDoc(false);

        let shouldBootstrapWelcome = bootstrapFlag;

        const commit = (value: WorkspaceKeys | null, bootstrap = false) => {
            if (ensureCounterRef.current !== ensureId) return;
            currentKeyRef.current = value
                ? `${value.publicHex}#${value.privateHex}`
                : null;
            workspaceRef.current = value;
            setWorkspace(value);
            setBootstrapWelcomeDoc(Boolean(value) && bootstrap);
            if (getBootstrapNextWorkspace()) {
                setBootstrapNextWorkspace(false);
            }
        };

        const [rawPub, rawPriv = ""] = routeKey.split("#");
        const candidatePub = rawPub?.trim().toLowerCase() ?? "";
        const candidatePriv = rawPriv.trim().toLowerCase();
        const hexPattern = /^[0-9a-f]+$/i;
        const useResolvedWorkspace = (
            value: WorkspaceKeys | null,
            options?: { bootstrapWelcome?: boolean },
        ) => {
            if (!value) {
                commit(null);
                return;
            }
            const canonicalPath = `/${value.publicHex}`;
            const canonicalHash = `#${value.privateHex}`;
            if (
                window.location.pathname !== canonicalPath ||
                window.location.hash !== canonicalHash
            ) {
                history.replaceState(null, "", `${canonicalPath}${canonicalHash}`);
            }
            const shouldBootstrap = options?.bootstrapWelcome ?? false;
            commit(value, shouldBootstrap);
        };

        const cryptoModule = await loadCryptoModule();
        if (!cryptoModule.hasSubtleCrypto()) {
            // TODO: REVIEW [Fallback to static workspace keys when WebCrypto is unavailable]
            // eslint-disable-next-line no-console
            console.warn(
                "Web Crypto Subtle API unavailable; using fallback workspace keys. Public sync stays offline until served over HTTPS or localhost.",
            );
            const fallback = cryptoModule.getFallbackWorkspaceKeys();
            applyFallbackFlag(true);
            useResolvedWorkspace({
                publicHex: fallback.publicHex,
                privateHex: fallback.privateHex,
            });
            return;
        }

        try {
            if (
                candidatePub &&
                candidatePriv &&
                hexPattern.test(candidatePub) &&
                hexPattern.test(candidatePriv)
            ) {
                const imported = await cryptoModule.importKeyPairFromHex(
                    candidatePub,
                    candidatePriv,
                );
                if (imported) {
                    const publicHex = await cryptoModule.exportRawPublicKeyHex(
                        imported.publicKey,
                    );
                    const jwk = await crypto.subtle.exportKey("jwk", imported.privateKey);
                    const privateHex = cryptoModule.bytesToHex(
                        cryptoModule.base64UrlToBytes(jwk.d ?? ""),
                    );
                    applyFallbackFlag(false);
                    useResolvedWorkspace(
                        { publicHex, privateHex },
                        { bootstrapWelcome: shouldBootstrapWelcome },
                    );
                    return;
                }
            }
        } catch (error) {
            // eslint-disable-next-line no-console
            console.warn("Workspace key validation failed:", error);
        }

        try {
            const all = await listAllWorkspaces();
            if (all.length > 0) {
                const latest = all[0];
                applyFallbackFlag(false);
                useResolvedWorkspace({
                    publicHex: latest.id.toLowerCase(),
                    privateHex: latest.privateHex.toLowerCase(),
                });
                return;
            }
            if (!candidatePub && !candidatePriv) {
                shouldBootstrapWelcome = true;
            }
            if (bootstrapFlag) {
                shouldBootstrapWelcome = true;
            }
        } catch (error) {
            // eslint-disable-next-line no-console
            console.warn("Load last workspace failed:", error);
        }

        try {
            const generated = await cryptoModule.generatePairAndUrl();
            applyFallbackFlag(false);
            useResolvedWorkspace(
                {
                    publicHex: generated.publicHex,
                    privateHex: generated.privateHex,
                },
                { bootstrapWelcome: shouldBootstrapWelcome },
            );
        } catch (error) {
            // eslint-disable-next-line no-console
            console.error("Failed to create workspace:", error);
            commit(null);
        }
    }, []);

    useEffect(() => {
        if (typeof window === "undefined") return undefined;
        const handleRouteChange = () => {
            void ensureWorkspace();
        };
        window.addEventListener("hashchange", handleRouteChange);
        window.addEventListener("popstate", handleRouteChange);
        void ensureWorkspace();
        return () => {
            window.removeEventListener("hashchange", handleRouteChange);
            window.removeEventListener("popstate", handleRouteChange);
        };
    }, [ensureWorkspace]);

    if (!workspace) return null;

    const key = `${workspace.publicHex}#${workspace.privateHex}`;
    return (
        <WorkspaceSession
            key={key}
            workspace={workspace}
            fallbackActive={fallbackActive}
            bootstrapWelcomeDoc={bootstrapWelcomeDoc}
        />
    );
}
