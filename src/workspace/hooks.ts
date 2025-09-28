import { useEffect, useState } from "react";
import type { MutableRefObject } from "react";
import type { LoroDoc } from "loro-crdt";
import type { ClientStatusValue, LoroWebsocketClient } from "loro-websocket";
import {
    createPresenceScheduler,
    type IdleWindow,
} from "../state/presence";
import {
    loadPublicSyncModule,
    setupWorkspacePersistence,
    listAllWorkspaces,
    type WorkspaceRecord,
    type WorkspaceKeys,
} from "../workspace";

export function usePreventViewportScaling(): void {
    useEffect(() => {
        if (typeof document === "undefined") return;
        const selector = 'meta[name="viewport"]';
        let meta = document.querySelector<HTMLMetaElement>(selector);
        const previous = meta?.getAttribute("content") ?? null;
        const content =
            "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover";
        if (!meta) {
            meta = document.createElement("meta");
            meta.setAttribute("name", "viewport");
            document.head.appendChild(meta);
        }
        meta.setAttribute("content", content);
        return () => {
            if (!meta) return;
            if (previous !== null) {
                meta.setAttribute("content", previous);
            }
        };
    }, []);
}

export function useHelpDialogFocus(
    showHelp: boolean,
    dialogRef: MutableRefObject<HTMLDivElement | null>,
    triggerRef: MutableRefObject<HTMLButtonElement | null>,
    onRequestClose: () => void,
): void {
    useEffect(() => {
        if (showHelp) {
            const node = dialogRef.current;
            node?.focus();
            const handleKeyDown = (event: KeyboardEvent) => {
                if (event.key === "Escape") {
                    onRequestClose();
                }
            };
            document.addEventListener("keydown", handleKeyDown);
            return () => {
                document.removeEventListener("keydown", handleKeyDown);
            };
        }
        const trigger = triggerRef.current;
        if (trigger) {
            trigger.focus();
        }
        return undefined;
    }, [onRequestClose, showHelp, dialogRef, triggerRef]);
}

export function useDeleteDialogFocus(
    showDeleteDialog: boolean,
    dialogRef: MutableRefObject<HTMLDivElement | null>,
    onCancel: () => void,
): void {
    useEffect(() => {
        if (!showDeleteDialog) return;
        const node = dialogRef.current;
        node?.focus();
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.preventDefault();
                onCancel();
            }
        };
        document.addEventListener("keydown", handleKeyDown);
        return () => {
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [dialogRef, onCancel, showDeleteDialog]);
}

export function useWorkspaceTitleAutosize(
    displayedTitle: string,
    inputRef: MutableRefObject<HTMLInputElement | null>,
    measureRef: MutableRefObject<HTMLSpanElement | null>,
): void {
    useEffect(() => {
        const input = inputRef.current;
        const measure = measureRef.current;
        if (!input || !measure) return;
        input.style.width = measure.offsetWidth + 12 + "px";
    }, [displayedTitle, inputRef, measureRef]);
}

export function useWorkspaceMenuDismiss(
    showMenu: boolean,
    containerRef: MutableRefObject<HTMLDivElement | null>,
    setShowMenu: (visible: boolean) => void,
): void {
    useEffect(() => {
        if (!showMenu) return;
        const onDown = (event: MouseEvent) => {
            if (!containerRef.current) return;
            if (!containerRef.current.contains(event.target as Node)) {
                setShowMenu(false);
            }
        };
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") setShowMenu(false);
        };
        document.addEventListener("mousedown", onDown);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onDown);
            document.removeEventListener("keydown", onKey);
        };
    }, [containerRef, setShowMenu, showMenu]);
}

export function useWorkspaceMenuPlacement(
    showMenu: boolean,
    menuRef: MutableRefObject<HTMLDivElement | null>,
): void {
    useEffect(() => {
        if (!showMenu) return;
        const menu = menuRef.current;
        if (!menu) return;
        const margin = 12;
        const adjust = () => {
            const rect = menu.getBoundingClientRect();
            let dx = 0;
            if (rect.right > window.innerWidth - margin) {
                dx = window.innerWidth - margin - rect.right;
            }
            if (rect.left + dx < margin) {
                dx = margin - rect.left;
            }
            menu.style.transform = `translateX(${dx}px)`;
            const available = Math.max(120, window.innerHeight - margin - rect.top);
            menu.style.maxHeight = available + "px";
            menu.style.overflowY = "auto";
        };
        const raf = requestAnimationFrame(adjust);
        const onResize = () => adjust();
        window.addEventListener("resize", onResize);
        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener("resize", onResize);
        };
    }, [menuRef, showMenu]);
}

export function useWorkspacePersistence(
    doc: LoroDoc,
    workspaceHex: string,
): void {
    useEffect(() => {
        if (!workspaceHex) return;
        const idleWindow = window as IdleWindow;
        const cleanup = setupWorkspacePersistence({
            doc,
            workspaceId: workspaceHex,
            idleWindow,
        });
        return () => {
            cleanup();
        };
    }, [doc, workspaceHex]);
}

export function useWorkspaceListLoader(
    setWorkspaces: (records: WorkspaceRecord[]) => void,
): void {
    useEffect(() => {
        let alive = true;
        const idleWindow = window as IdleWindow;
        let idleHandle: number | undefined;
        let startTimeout: number | undefined;

        const run = async () => {
            try {
                const all = await listAllWorkspaces();
                if (alive) setWorkspaces(all);
            } catch (error) {
                // eslint-disable-next-line no-console
                console.warn("IndexedDB list workspaces failed:", error);
            }
        };

        if (typeof idleWindow.requestIdleCallback === "function") {
            idleHandle = idleWindow.requestIdleCallback(() => {
                idleHandle = undefined;
                void run();
            });
        } else {
            startTimeout = window.setTimeout(() => {
                startTimeout = undefined;
                void run();
            }, 320);
        }

        return () => {
            alive = false;
            if (
                idleHandle !== undefined &&
                typeof idleWindow.cancelIdleCallback === "function"
            ) {
                idleWindow.cancelIdleCallback(idleHandle);
            }
            if (startTimeout !== undefined) window.clearTimeout(startTimeout);
        };
    }, [setWorkspaces]);
}

export function useSnapshotOnUnload(
    persistSnapshotNow: () => Promise<void>,
    skipSnapshotOnUnloadRef: MutableRefObject<boolean>,
): void {
    useEffect(() => {
        const onLeave = () => {
            if (skipSnapshotOnUnloadRef.current) return;
            void persistSnapshotNow();
        };
        window.addEventListener("pagehide", onLeave);
        window.addEventListener("beforeunload", onLeave);
        return () => {
            window.removeEventListener("pagehide", onLeave);
            window.removeEventListener("beforeunload", onLeave);
        };
    }, [persistSnapshotNow, skipSnapshotOnUnloadRef]);
}

export function useGlobalDragDropHandlers(
    activeDragCid: string | null,
    updateInsertIndexFromPointer: (clientY: number) => void,
    commitDrop: () => void,
): void {
    useEffect(() => {
        if (!activeDragCid) return;
        const onDragOver = (event: DragEvent) => {
            event.preventDefault();
            updateInsertIndexFromPointer(event.clientY);
        };
        const onDrop = (event: DragEvent) => {
            event.preventDefault();
            updateInsertIndexFromPointer(event.clientY);
            requestAnimationFrame(() => commitDrop());
        };
        window.addEventListener("dragover", onDragOver);
        window.addEventListener("drop", onDrop);
        return () => {
            window.removeEventListener("dragover", onDragOver);
            window.removeEventListener("drop", onDrop);
        };
    }, [activeDragCid, commitDrop, updateInsertIndexFromPointer]);
}

type PublicSyncParams = {
    doc: LoroDoc;
    workspace: WorkspaceKeys;
    bootstrapWelcomeDoc: boolean;
    setDetached: (value: boolean) => void;
    setWorkspaceHex: (hex: string) => void;
    setShareUrl: (url: string) => void;
    setWorkspaces: (records: WorkspaceRecord[]) => void;
    setConnectionStatus: (status: ClientStatusValue) => void;
    setLatencyMs: (latency: number | null) => void;
    setJoiningWorkspace: (joining: boolean) => void;
    setPresencePeers: (peers: string[]) => void;
    setPresenceCount: (count: number) => void;
};

export function usePublicSyncSession({
    doc,
    workspace,
    bootstrapWelcomeDoc,
    setDetached,
    setWorkspaceHex,
    setShareUrl,
    setWorkspaces,
    setConnectionStatus,
    setLatencyMs,
    setJoiningWorkspace,
    setPresencePeers,
    setPresenceCount,
}: PublicSyncParams): LoroWebsocketClient | null {
    const [syncClient, setSyncClient] = useState<LoroWebsocketClient | null>(null);

    useEffect(() => {
        setConnectionStatus("connecting");
        setLatencyMs(null);
        setSyncClient(null);
        const idleWindow = window as IdleWindow;
        let mounted = true;
        let sessionCleanup: void | (() => void | Promise<void>);
        let idleHandle: number | undefined;
        let startTimeout: number | undefined;
        let presenceScheduler: ReturnType<typeof createPresenceScheduler> | null =
            null;
        setJoiningWorkspace(false);

        const start = async () => {
            try {
                const { setupPublicSync } = await loadPublicSyncModule();
                if (!mounted) return;
                const session = await setupPublicSync(
                    doc,
                    workspace,
                    {
                        setDetached,
                        setOnline: () => {
                            /* deprecated local state */
                        },
                        setWorkspaceHex,
                        setShareUrl,
                        setWorkspaces,
                        setConnectionStatus,
                        setLatency: setLatencyMs,
                        setJoiningState: setJoiningWorkspace,
                    },
                    {
                        bootstrapWelcomeDoc,
                    },
                );
                if (!mounted) {
                    if (session?.cleanup) void session.cleanup();
                    setSyncClient(null);
                    return;
                }
                sessionCleanup = session.cleanup;
                const client = session.client;
                setSyncClient(client ?? null);
                if (client) {
                    presenceScheduler?.dispose();
                    presenceScheduler = createPresenceScheduler({
                        idleWindow,
                        docPeerId: doc.peerIdStr,
                        setPresencePeers,
                        setPresenceCount,
                        isActive: () => mounted,
                    });
                    presenceScheduler.schedule(client);
                } else {
                    presenceScheduler?.dispose();
                    presenceScheduler = null;
                }
            } catch (error) {
                // eslint-disable-next-line no-console
                console.error("Failed to start public sync:", error);
                if (mounted) {
                    setSyncClient(null);
                }
            }
        };

        if (typeof idleWindow.requestIdleCallback === "function") {
            idleHandle = idleWindow.requestIdleCallback(() => {
                idleHandle = undefined;
                void start();
            });
        } else {
            startTimeout = window.setTimeout(() => {
                startTimeout = undefined;
                void start();
            }, 200);
        }

        return () => {
            mounted = false;
            presenceScheduler?.dispose();
            presenceScheduler = null;
            if (
                idleHandle !== undefined &&
                typeof idleWindow.cancelIdleCallback === "function"
            ) {
                idleWindow.cancelIdleCallback(idleHandle);
            }
            if (startTimeout !== undefined) window.clearTimeout(startTimeout);
            if (sessionCleanup) void sessionCleanup();
            setSyncClient(null);
        };
    }, [
        bootstrapWelcomeDoc,
        doc,
        setConnectionStatus,
        setDetached,
        setLatencyMs,
        setPresenceCount,
        setPresencePeers,
        setShareUrl,
        setWorkspaceHex,
        setWorkspaces,
        setJoiningWorkspace,
        workspace,
    ]);

    return syncClient;
}
