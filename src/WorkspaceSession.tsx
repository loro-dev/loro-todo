import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import type {
    ChangeEvent,
    DragEvent as ReactDragEvent,
    PointerEvent as ReactPointerEvent,
} from "react";
import type { ClientStatusValue, LoroWebsocketClient } from "loro-websocket";
import { useLoroStore } from "loro-mirror-react";
import {
    createConfiguredDoc,
    createUndoManager,
    initialTodoState,
    todoSchema,
} from "./state/doc";
import { createStore } from "loro-mirror";
import { useLongPressDrag } from "./useLongPressDrag";
import { NetworkStatusIndicator } from "./NetworkStatusIndicator";
import { createPresenceScheduler, type IdleWindow } from "./state/presence";
import {
    SelectionProvider,
    useAppSelection,
    type RemoteSelectionMap,
} from "./selection";
import HistoryView from "./HistoryView";
import {
    KeyboardShortcutsBridge,
} from "./KeyboardShortcutsBridge";
import { SelectionSyncBridge } from "./SelectionSyncBridge";
import {
    MaterialSymbolsKeyboardArrowDown,
    MdiTrayArrowUp,
    MdiHelpCircleOutline,
    MdiTrayArrowDown,
    MdiLinkVariant,
    StreamlinePlumpRecycleBin2Remix,
    MdiBroom,
    LucideUndo2,
    IcSharpHistory,
    LucideInfo,
    LucideUsers,
    LucideWifiOff,
    LucideCode2,
    LucideGithub,
} from "./icons";
import { NewTodoInput } from "./todos/NewTodoInput";
import { TodoItemRow } from "./todos/TodoItemRow";
import type { Todo } from "./todos/types";
import { getCollaboratorColorForId } from "./collaboratorColors";
import {
    loadPublicSyncModule,
    deleteWorkspaceAndList,
    ensurePersistentStorage,
    listAllWorkspaces,
    navigateToWorkspaceRoute,
    saveWorkspaceSnapshot,
    setupWorkspacePersistence,
    snapshotToArrayBuffer,
    switchToWorkspace,
    updateWorkspaceName,
    createNewWorkspace,
    markBootstrapNextWorkspace,
} from "./workspace";
import type { WorkspaceKeys, WorkspaceRecord } from "./workspace";

type WorkspaceSessionProps = {
    workspace: WorkspaceKeys;
    fallbackActive: boolean;
    bootstrapWelcomeDoc: boolean;
};

export function WorkspaceSession({
    workspace,
    fallbackActive,
    bootstrapWelcomeDoc,
}: WorkspaceSessionProps) {
    const doc = useMemo(() => createConfiguredDoc(), []);
    (window as unknown as { doc?: unknown }).doc = doc;
    const undo = useMemo(() => createUndoManager(doc), [doc]);

    const { state, setState } = useLoroStore<typeof todoSchema>({
        doc,
        schema: todoSchema,
        initialState: initialTodoState,
    });

    const [newText, setNewText] = useState<string>("");
    const [dragCid, setDragCid] = useState<string | null>(null);
    const [insertIndex, setInsertIndex] = useState<number | null>(null);
    const listRef = useRef<HTMLUListElement | null>(null);
    const [detached, setDetached] = useState<boolean>(doc.isDetached());
    const [showHistory, setShowHistory] = useState<boolean>(false);
    const [showHelp, setShowHelp] = useState<boolean>(false);
    const [, setOnline] = useState<boolean>(false);
    const [connectionStatus, setConnectionStatus] =
        useState<ClientStatusValue>("connecting");
    const [latencyMs, setLatencyMs] = useState<number | null>(null);
    const [presenceCount, setPresenceCount] = useState<number>(0);
    const [workspaceHex, setWorkspaceHex] = useState<string>(workspace.publicHex);
    const [presencePeers, setPresencePeers] = useState<string[]>([]);
    const [syncClient, setSyncClient] = useState<LoroWebsocketClient | null>(null);
    const [shareUrl, setShareUrl] = useState<string>("");
    const [toast, setToast] = useState<string | null>(null);
    const toastTimerRef = useRef<number | undefined>(undefined);
    const [storageWarning, setStorageWarning] = useState<string | null>(null);
    const [workspaces, setWorkspaces] = useState<WorkspaceRecord[]>([]);
    const [workspaceTitle, setWorkspaceTitle] = useState<string>("Untitled List");
    const [joiningWorkspace, setJoiningWorkspace] = useState<boolean>(false);
    const wsDebounceRef = useRef<number | undefined>(undefined);
    const [showWsMenu, setShowWsMenu] = useState<boolean>(false);
    const [showDeleteDialog, setShowDeleteDialog] = useState<boolean>(false);
    const wsTitleRef = useRef<HTMLDivElement | null>(null);
    const wsTitleInputRef = useRef<HTMLInputElement | null>(null);
    const wsMeasureRef = useRef<HTMLSpanElement | null>(null);
    const wsMenuRef = useRef<HTMLDivElement | null>(null);
    const wsDropdownButtonRef = useRef<HTMLButtonElement | null>(null);
    const wsImportInputRef = useRef<HTMLInputElement | null>(null);
    const helpButtonRef = useRef<HTMLButtonElement | null>(null);
    const helpDialogRef = useRef<HTMLDivElement | null>(null);
    const deleteDialogRef = useRef<HTMLDivElement | null>(null);
    const skipSnapshotOnUnloadRef = useRef<boolean>(false);
    const newTodoInputRef = useRef<HTMLInputElement | null>(null);
    const itemRefs = useRef<Map<string, HTMLLIElement>>(new Map());
    const persistentRequestRef = useRef<{
        granted: boolean;
        promise: Promise<boolean> | null;
        unsupportedNotified: boolean;
    }>({ granted: false, promise: null, unsupportedNotified: false });

    const [transformTransitionsReady, setTransformTransitionsReady] =
        useState<boolean>(false);
    const hasDone = useMemo(
        () => state.todos.some((t) => t.status === "done"),
        [state.todos],
    );

    const remotePeerColors = useMemo<Record<string, string>>(
        () =>
            presencePeers.reduce<Record<string, string>>((acc, peerId) => {
                acc[peerId] = getCollaboratorColorForId(peerId);
                return acc;
            }, {}),
        [presencePeers],
    );

    const displayedWorkspaceTitle = joiningWorkspace && workspaceTitle.trim().length === 0
        ? "Loading..."
        : workspaceTitle;

    const [itemHeights, setItemHeights] = useState<Record<string, number>>({});
    const ITEM_GAP = 10;
    const DEFAULT_HEIGHT = 48;
    const handleRowHeight = useCallback((cid: string, height: number) => {
        setItemHeights((prev) => {
            if (prev[cid] === height) return prev;
            return { ...prev, [cid]: height };
        });
    }, []);

    useEffect(() => {
        if (transformTransitionsReady) return;
        if (state.todos.length === 0) return;
        const raf = window.requestAnimationFrame(() => {
            setTransformTransitionsReady(true);
        });
        return () => window.cancelAnimationFrame(raf);
    }, [state.todos.length, transformTransitionsReady]);

    const positions = useMemo(() => {
        let y = 0;
        const pos: Record<string, number> = {};
        for (const todo of state.todos) {
            pos[todo.$cid] = y;
            const height = itemHeights[todo.$cid] ?? DEFAULT_HEIGHT;
            y += height + ITEM_GAP;
        }
        const height = Math.max(0, y - (state.todos.length > 0 ? ITEM_GAP : 0));
        return { pos, height } as const;
    }, [state.todos, itemHeights]);

    const itemOrder = useMemo(
        () => state.todos.map((todo) => todo.$cid),
        [state.todos],
    );

    const resolveItemElement = useCallback(
        (cid: string) => itemRefs.current.get(cid) ?? null,
        [],
    );

    const resolveCreateInput = useCallback(() => newTodoInputRef.current, []);

    const handleRowAttachment = useCallback(
        (cid: string, element: HTMLLIElement | null) => {
            if (element) {
                itemRefs.current.set(cid, element);
            } else {
                itemRefs.current.delete(cid);
            }
        },
        [],
    );

    const todosRef = useRef<Todo[]>(state.todos as Todo[]);
    useEffect(() => {
        todosRef.current = state.todos as Todo[];
    }, [state.todos]);

    const handleUndo = useCallback(() => {
        undo.undo();
    }, [undo]);

    const handleRedo = useCallback(() => {
        undo.redo();
    }, [undo]);

    const isMacLike = useMemo(() => {
        if (typeof navigator === "undefined") return false;
        const signature = navigator.platform || navigator.userAgent || "";
        return /mac|ipod|iphone|ipad/i.test(signature);
    }, []);

    const workspaceFileName = useMemo(() => {
        const fallback = workspaceHex || "list";
        const rawBase = workspaceTitle.trim() || fallback;
        const safeBase = rawBase
            .replace(/[^a-zA-Z0-9-_]+/g, "_")
            .replace(/^_+|_+$/g, "");
        const base = safeBase.length > 0 ? safeBase : fallback;
        return `${base}.loro`;
    }, [workspaceHex, workspaceTitle]);

    useEffect(() => {
        if (showHelp) {
            const node = helpDialogRef.current;
            node?.focus();
            const handleKeyDown = (event: KeyboardEvent) => {
                if (event.key === "Escape") {
                    setShowHelp(false);
                }
            };
            document.addEventListener("keydown", handleKeyDown);
            return () => {
                document.removeEventListener("keydown", handleKeyDown);
            };
        }
        if (helpButtonRef.current) {
            helpButtonRef.current.focus();
        }
        return undefined;
    }, [showHelp]);

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

    const TOAST_DURATION_MS = 2600;

    const handleStatusToast = useCallback(
        (message: string | null) => {
            if (!message) return;
            if (toastTimerRef.current) {
                window.clearTimeout(toastTimerRef.current);
            }
            setToast(message);
            toastTimerRef.current = window.setTimeout(() => {
                setToast(null);
            }, TOAST_DURATION_MS);
        },
        [setToast],
    );

    const dismissStorageWarning = useCallback(() => {
        setStorageWarning(null);
    }, []);

    const requestPersistentStorage = useCallback((): Promise<boolean> => {
        const stateRef = persistentRequestRef.current;
        if (stateRef.granted) return Promise.resolve(true);
        if (stateRef.promise) return stateRef.promise;

        const showWarning = (message: string) => {
            stateRef.unsupportedNotified = true;
            setStorageWarning(message);
        };

        const attempt = ensurePersistentStorage()
            .then(({ granted, supported }) => {
                if (granted) {
                    stateRef.granted = true;
                    stateRef.unsupportedNotified = false;
                    if (storageWarning) setStorageWarning(null);
                    // eslint-disable-next-line no-console
                    console.info("Persistent storage granted for this origin.");
                    return true;
                }
                if (!supported && !stateRef.unsupportedNotified) {
                    const reason =
                        "Persistent storage API unsupported or insecure context (granted=false, supported=false).";
                    showWarning(
                        "Your browser doesn't support persistent storage here. Export backups regularly to avoid data loss.",
                    );
                    // eslint-disable-next-line no-console
                    console.warn(
                        "Persistent storage unsupported: falling back to best-effort storage.",
                        {
                            reason,
                        },
                    );
                }
                if (supported && !granted) {
                    const reason =
                        "persist() returned false; the browser declined elevation (likely due to heuristics or low engagement).";
                    // eslint-disable-next-line no-console
                    console.warn("Persistent storage request was denied.", { reason });
                }
                return false;
            })
            .catch((error) => {
                // eslint-disable-next-line no-console
                console.warn("Persistent storage request failed:", error, {
                    reason: "persist() threw or rejected",
                });
                showWarning(
                    "Persistent storage request failed. The browser may clear this list—export a backup to protect it.",
                );
                return false;
            })
            .finally(() => {
                stateRef.promise = null;
            });

        stateRef.promise = attempt;
        return attempt;
    }, [storageWarning]);

    useEffect(() => {
        setConnectionStatus("connecting");
        setLatencyMs(null);
        setOnline(false);
        setSyncClient(null);
        const idleWindow = window as IdleWindow;
        let mounted = true;
        let sessionCleanup: void | (() => void | Promise<void>);
        let idleHandle: number | undefined;
        let startTimeout: number | undefined;
        setJoiningWorkspace(false);

        const presenceScheduler = createPresenceScheduler({
            idleWindow,
            docPeerId: doc.peerIdStr,
            setPresencePeers,
            setPresenceCount,
            isActive: () => mounted,
        });

        const start = async () => {
            try {
                const { setupPublicSync } = await loadPublicSyncModule();
                if (!mounted) return;
                const session = await setupPublicSync(
                    doc,
                    workspace,
                    {
                        setDetached,
                        setOnline,
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
                    presenceScheduler.schedule(client);
                }
            } catch (error) {
                // eslint-disable-next-line no-console
                console.error("Failed to start public sync:", error);
                if (mounted) {
                    setOnline(false);
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
            presenceScheduler.dispose();
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
    }, [bootstrapWelcomeDoc, doc, workspace]);

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
    }, []);

    const removeCurrentWorkspace = useCallback(async () => {
        if (!workspaceHex) return;
        try {
            skipSnapshotOnUnloadRef.current = true;
            const all = await deleteWorkspaceAndList(workspaceHex);
            setWorkspaces(all);
            const next = all.find((w) => w.id !== workspaceHex) ?? null;
            if (next) {
                navigateToWorkspaceRoute(next.id, next.privateHex, { replace: true });
            } else {
                markBootstrapNextWorkspace();
                await createNewWorkspace();
            }
        } catch (error) {
            // eslint-disable-next-line no-console
            console.warn("Delete list failed:", error);
            skipSnapshotOnUnloadRef.current = false;
        }
    }, [workspaceHex]);

    const focusWorkspaceSwitcher = useCallback(() => {
        const button = wsDropdownButtonRef.current;
        if (!button) return;
        window.requestAnimationFrame(() => {
            button.focus();
        });
    }, []);

    const handleCancelDelete = useCallback(() => {
        setShowDeleteDialog(false);
        focusWorkspaceSwitcher();
    }, [focusWorkspaceSwitcher]);

    const handleConfirmDelete = useCallback(async () => {
        setShowDeleteDialog(false);
        await removeCurrentWorkspace();
        focusWorkspaceSwitcher();
    }, [removeCurrentWorkspace, focusWorkspaceSwitcher]);

    useEffect(() => {
        if (!showDeleteDialog) return;
        const node = deleteDialogRef.current;
        node?.focus();
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.preventDefault();
                handleCancelDelete();
            }
        };
        document.addEventListener("keydown", handleKeyDown);
        return () => {
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [showDeleteDialog, handleCancelDelete]);

    const persistSnapshotNow = useCallback(async (): Promise<void> => {
        if (!workspaceHex) return;
        void requestPersistentStorage();
        try {
            await saveWorkspaceSnapshot(doc, workspaceHex);
        } catch (error) {
            // eslint-disable-next-line no-console
            console.warn("Forced snapshot save failed:", error);
        }
    }, [doc, requestPersistentStorage, workspaceHex]);

    const handleExportWorkspace = useCallback(() => {
        if (!workspaceHex) {
            handleStatusToast("List not ready");
            return;
        }
        void requestPersistentStorage();
        try {
            const snapshot = doc.export({ mode: "snapshot" });
            const blob = new Blob([snapshotToArrayBuffer(snapshot)], {
                type: "application/octet-stream",
            });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = workspaceFileName;
            const body = document.body;
            if (!body) {
                throw new Error("Document body unavailable");
            }
            body.appendChild(anchor);
            anchor.click();
            body.removeChild(anchor);
            window.setTimeout(() => URL.revokeObjectURL(url), 0);
            handleStatusToast("List exported");
        } catch (error) {
            // eslint-disable-next-line no-console
            console.warn("Export workspace failed:", error);
            handleStatusToast("Export failed");
        } finally {
            setShowWsMenu(false);
        }
    }, [
        doc,
        handleStatusToast,
        requestPersistentStorage,
        setShowWsMenu,
        workspaceFileName,
        workspaceHex,
    ]);

    const handleRequestImport = useCallback(() => {
        if (!workspaceHex) {
            handleStatusToast("List not ready");
            return;
        }
        void requestPersistentStorage();
        setShowWsMenu(false);
        window.setTimeout(() => {
            wsImportInputRef.current?.click();
        }, 0);
    }, [
        handleStatusToast,
        requestPersistentStorage,
        setShowWsMenu,
        workspaceHex,
    ]);

    const handleImportFileChange = useCallback(
        async (event: ChangeEvent<HTMLInputElement>) => {
            if (!workspaceHex) {
                event.currentTarget.value = "";
                handleStatusToast("List not ready");
                return;
            }
            const input = event.currentTarget;
            const file = input.files?.[0] ?? null;
            input.value = "";
            if (!file) return;
            try {
                const buffer = await file.arrayBuffer();
                const bytes = new Uint8Array(buffer);

                const importedDoc = createConfiguredDoc();
                importedDoc.import(bytes);
                const importedStore = createStore({
                    doc: importedDoc,
                    schema: todoSchema,
                    initialState: initialTodoState,
                });
                const importedState = importedStore.getState();
                const importedTodos = importedState.todos ?? [];
                const importedName =
                    typeof importedState.workspace?.name === "string" &&
                    importedState.workspace.name.trim().length > 0
                        ? importedState.workspace.name
                        : "Untitled List";

                await setState((draft) => {
                    draft.todos.splice(0, draft.todos.length);
                    for (const todo of importedTodos) {
                        const status = todo.status === "done" ? "done" : "todo";
                        draft.todos.push({ text: todo.text ?? "", status });
                    }
                    draft.workspace.name = importedName;
                });

                setWorkspaceTitle(importedName);
                await persistSnapshotNow();
                handleStatusToast("List imported");
            } catch (error) {
                // eslint-disable-next-line no-console
                console.warn("Import workspace failed:", error);
                handleStatusToast("Import failed");
            }
        },
        [handleStatusToast, persistSnapshotNow, setState, workspaceHex],
    );

    useEffect(() => {
        const unsub = doc.subscribe(() => {
            setDetached(doc.isDetached());
        });
        return () => unsub();
    }, [doc]);

    useEffect(() => {
        const name = state.workspace?.name;
        if (typeof name !== "string") return;
        setWorkspaceTitle((current) => (name !== current ? name : current));
    }, [state.workspace?.name]);

    useEffect(() => {
        if (!workspaceHex) return;
        let timer: number | undefined;
        timer = window.setTimeout(async () => {
            try {
                const all = await updateWorkspaceName(workspaceHex, workspaceTitle);
                if (all) setWorkspaces(all);
            } catch (error) {
                // eslint-disable-next-line no-console
                console.warn("Persist workspace name failed:", error);
            }
        }, 300);
        return () => {
            if (timer) window.clearTimeout(timer);
        };
    }, [workspaceTitle, workspaceHex]);

    useEffect(() => {
        if (!showWsMenu) return;
        const onDown = (event: MouseEvent) => {
            if (!wsTitleRef.current) return;
            if (!wsTitleRef.current.contains(event.target as Node)) {
                setShowWsMenu(false);
            }
        };
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") setShowWsMenu(false);
        };
        document.addEventListener("mousedown", onDown);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onDown);
            document.removeEventListener("keydown", onKey);
        };
    }, [showWsMenu]);

    useEffect(() => {
        const input = wsTitleInputRef.current;
        const measure = wsMeasureRef.current;
        if (!input || !measure) return;
        input.style.width = measure.offsetWidth + 12 + "px";
    }, [displayedWorkspaceTitle]);

    useEffect(() => {
        if (!showWsMenu) return;
        const menu = wsMenuRef.current;
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
    }, [showWsMenu]);

    function addTodo(text: string) {
        if (!text.trim()) return;
        void requestPersistentStorage();
        void setState((draft) => {
            draft.todos.splice(0, 0, { text, status: "todo" });
        });
        setNewText("");
    }

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
    }, [persistSnapshotNow]);

    const handleTextChange = useCallback(
        (cid: string, value: string) => {
            void setState((draft) => {
                const index = draft.todos.findIndex((todo) => todo.$cid === cid);
                if (index !== -1) draft.todos[index].text = value;
            });
        },
        [setState],
    );

    const handleDoneChange = useCallback(
        (cid: string, done: boolean) => {
            void setState((draft) => {
                const from = draft.todos.findIndex((todo) => todo.$cid === cid);
                if (from === -1) return;
                draft.todos[from].status = done ? "done" : "todo";
                if (done) {
                    let trailingDone = 0;
                    for (let idx = draft.todos.length - 1; idx >= 0; idx--) {
                        if (draft.todos[idx].status === "done") trailingDone++;
                        else break;
                    }
                    let startIdx = draft.todos.length - trailingDone;
                    let to = startIdx;
                    if (from < to) to -= 1;
                    const [item] = draft.todos.splice(from, 1);
                    draft.todos.splice(to, 0, item);
                } else {
                    let trailingDone = 0;
                    for (let idx = draft.todos.length - 1; idx >= 0; idx--) {
                        if (draft.todos[idx].status === "done" || draft.todos[idx].$cid === cid)
                            trailingDone++;
                        else break;
                    }
                    let to = draft.todos.length - trailingDone;
                    if (from < to) to -= 1;
                    if (to < 0) to = 0;
                    if (to > draft.todos.length) to = draft.todos.length;
                    if (from !== to) {
                        const [item] = draft.todos.splice(from, 1);
                        draft.todos.splice(to, 0, item);
                    }
                }
            });
        },
        [setState],
    );

    const toggleTodo = useCallback(
        (cid: string) => {
            const current = todosRef.current.find((todo) => todo.$cid === cid);
            if (!current) return;
            handleDoneChange(cid, current.status !== "done");
        },
        [handleDoneChange],
    );

    const moveTodoByOffset = useCallback(
        (cid: string, delta: -1 | 1) => {
            if (delta !== -1 && delta !== 1) return;
            void setState((draft) => {
                const fromIndex = draft.todos.findIndex((todo) => todo.$cid === cid);
                if (fromIndex === -1) return;
                const targetIndex = fromIndex + delta;
                if (targetIndex < 0 || targetIndex >= draft.todos.length) return;
                const temp = draft.todos[targetIndex];
                draft.todos[targetIndex] = draft.todos[fromIndex];
                draft.todos[fromIndex] = temp;
            });
        },
        [setState],
    );

    const moveTodoUp = useCallback(
        (cid: string) => {
            moveTodoByOffset(cid, -1);
        },
        [moveTodoByOffset],
    );

    const moveTodoDown = useCallback(
        (cid: string) => {
            moveTodoByOffset(cid, 1);
        },
        [moveTodoByOffset],
    );

    const handleDelete = useCallback(
        (cid: string) => {
            void setState((draft) => {
                const index = draft.todos.findIndex((todo) => todo.$cid === cid);
                if (index !== -1) draft.todos.splice(index, 1);
            });
        },
        [setState],
    );

    const handleDragStart = useCallback((cid: string) => {
        setDragCid(cid);
    }, []);

    const handleDragEndBase = useCallback(() => {
        setDragCid(null);
        setInsertIndex(null);
    }, []);

    const updateInsertIndexFromPointer = useCallback(
        (clientY: number) => {
            const ul = listRef.current;
            if (!ul) return;
            const rect = ul.getBoundingClientRect();
            const y = clientY - rect.top;
            let idx = state.todos.length;
            for (let i = 0; i < state.todos.length; i++) {
                const todo = state.todos[i];
                if (todo.$cid === dragCid) continue;
                const top = positions.pos[todo.$cid] ?? 0;
                const height = itemHeights[todo.$cid] ?? DEFAULT_HEIGHT;
                const midpoint = top + height / 2;
                if (y < midpoint) {
                    idx = i;
                    break;
                }
            }
            setInsertIndex(idx);
        },
        [state.todos, positions.pos, itemHeights, dragCid],
    );

    const handleListDragOver = useCallback(
        (event: ReactDragEvent<HTMLUListElement>) => {
            event.preventDefault();
            updateInsertIndexFromPointer(event.clientY);
        },
        [updateInsertIndexFromPointer],
    );

    const commitDrop = useCallback(() => {
        if (!dragCid || insertIndex == null) return;
        void setState((draft) => {
            const from = draft.todos.findIndex((todo) => todo.$cid === dragCid);
            if (from === -1) return;
            let to = insertIndex;
            if (from < to) to = Math.max(0, to - 1);
            to = Math.min(Math.max(0, to), draft.todos.length);
            if (from === to) return;
            const [item] = draft.todos.splice(from, 1);
            draft.todos.splice(to, 0, item);
        });
        setDragCid(null);
        setInsertIndex(null);
    }, [dragCid, insertIndex, setState]);

    const handleListDrop = useCallback(
        (event?: ReactDragEvent<HTMLUListElement>) => {
            event?.preventDefault();
            commitDrop();
        },
        [commitDrop],
    );

    const shouldHandleLongPress = useCallback(
        (_cid: string, event: ReactPointerEvent<HTMLLIElement>) => {
            if (detached) return false;
            const target = event.target as HTMLElement | null;
            if (!target) return false;
            if (target.closest(".delete-btn")) return false;
            if (event.pointerType === "mouse") {
                return !!target.closest(".drag-handle");
            }
            if (target.closest(".todo-item.editing .todo-text")) {
                return false;
            }
            if (target.closest("input, select, button, a")) {
                return false;
            }
            return true;
        },
        [detached],
    );

    const {
        manualDrag,
        handlePointerDown: handleManualPointerDown,
        handlePointerMove: handleManualPointerMove,
        handlePointerUp: handleManualPointerUp,
        handlePointerCancel: handleManualPointerCancel,
    } = useLongPressDrag({
        listRef,
        positions,
        itemHeights,
        defaultHeight: DEFAULT_HEIGHT,
        detached,
        onDragStart: handleDragStart,
        onDragEnd: handleDragEndBase,
        onUpdateInsertIndex: updateInsertIndexFromPointer,
        onCommitDrop: commitDrop,
        shouldHandlePointerDown: shouldHandleLongPress,
    });

    useEffect(() => {
        if (!dragCid) return;
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
    }, [dragCid, updateInsertIndexFromPointer, commitDrop]);

    return (
        <SelectionProvider
            itemOrder={itemOrder}
            resolveItemElement={resolveItemElement}
            resolveCreateInput={resolveCreateInput}
            remotePeerColors={remotePeerColors}
        >
            <KeyboardShortcutsBridge
                toggleItem={toggleTodo}
                undo={handleUndo}
                redo={handleRedo}
                isMacLike={isMacLike}
                moveItemUp={moveTodoUp}
                moveItemDown={moveTodoDown}
            />
            <SelectionSyncBridge client={syncClient} docPeerId={doc.peerIdStr} />
            <div className="app">
                <header className="app-header">
                    <div className="workspace-title" ref={wsTitleRef}>
                        <input
                            className="workspace-title-input"
                            ref={wsTitleInputRef}
                            value={displayedWorkspaceTitle}
                            onChange={(event) => {
                                const value = event.currentTarget.value;
                                setWorkspaceTitle(value);
                                if (wsDebounceRef.current)
                                    window.clearTimeout(wsDebounceRef.current);
                                wsDebounceRef.current = window.setTimeout(() => {
                                    void setState((draft) => {
                                        draft.workspace.name = value;
                                    });
                                }, 300);
                            }}
                            placeholder="List name"
                            disabled={detached}
                            aria-label="List name"
                        />
                        <span
                            className="workspace-title-measure"
                            ref={wsMeasureRef}
                            aria-hidden
                        >
                            {displayedWorkspaceTitle || "Untitled List"}
                        </span>
                        <button
                            className="title-dropdown btn-text"
                            type="button"
                            ref={wsDropdownButtonRef}
                            onClick={() => setShowWsMenu((value) => !value)}
                            aria-label="Switch list"
                            title="Switch list"
                            disabled={false}
                        >
                            <MaterialSymbolsKeyboardArrowDown />
                        </button>
                        {showWsMenu && (
                            <div
                                className="workspace-selector-pop"
                                ref={wsMenuRef}
                                role="menu"
                            >
                                {(() => {
                                    const options: { id: string; name: string }[] = [];
                                    if (workspaceHex) {
                                        options.push({
                                            id: workspaceHex,
                                            name:
                                                displayedWorkspaceTitle || workspaceHex.slice(0, 16),
                                        });
                                    }
                                    for (const workspaceInfo of workspaces) {
                                        if (workspaceInfo.id === workspaceHex) continue;
                                        options.push({
                                            id: workspaceInfo.id,
                                            name:
                                                workspaceInfo.name ||
                                                workspaceInfo.label ||
                                                workspaceInfo.id.slice(0, 16),
                                        });
                                    }
                                    const onChoose = async (id: string) => {
                                        await persistSnapshotNow();
                                        await switchToWorkspace(id);
                                        setShowWsMenu(false);
                                    };
                                    const onCreate = async () => {
                                        await persistSnapshotNow();
                                        await createNewWorkspace();
                                        setShowWsMenu(false);
                                    };
                                    const onDelete = () => {
                                        setShowWsMenu(false);
                                        setShowDeleteDialog(true);
                                    };
                                    const onJoin = async () => {
                                        const input = window.prompt(
                                            "Paste the invite URL to join:",
                                            "",
                                        );
                                        if (!input) return;
                                        const url = input.trim();
                                        try {
                                            if (workspaceHex) {
                                                await persistSnapshotNow();
                                            }
                                            let handled = false;
                                            try {
                                                const parsed = new URL(url, window.location.href);
                                                if (parsed.origin === window.location.origin) {
                                                    const pathParts = parsed.pathname
                                                        .split("/")
                                                        .filter(Boolean);
                                                    const targetPublic =
                                                        pathParts[pathParts.length - 1] ?? "";
                                                    const targetPrivate = parsed.hash.startsWith("#")
                                                        ? parsed.hash.slice(1)
                                                        : "";
                                                    if (targetPublic && targetPrivate) {
                                                        navigateToWorkspaceRoute(
                                                            targetPublic,
                                                            targetPrivate,
                                                        );
                                                        handled = true;
                                                    }
                                                }
                                            } catch {
                                                handled = false;
                                            }
                                            if (!handled) {
                                                window.location.assign(url);
                                            }
                                        } finally {
                                            setShowWsMenu(false);
                                        }
                                    };
                                    return (
                                        <div className="ws-menu">
                                            {options.length === 0 && (
                                                <div className="ws-empty">No lists</div>
                                            )}
                                            {options.map(({ id, name }) => (
                                                <button
                                                    key={id}
                                                    className={`ws-item${
                                                        id === workspaceHex ? " current" : ""
                                                    }`}
                                                    onClick={() => void onChoose(id)}
                                                    role="menuitem"
                                                >
                                                    {name}
                                                </button>
                                            ))}
                                            <div className="ws-sep" />
                                            <button
                                                className="ws-action"
                                                onClick={handleExportWorkspace}
                                                role="menuitem"
                                                type="button"
                                            >
                                                <MdiTrayArrowUp className="ws-icon" aria-hidden />
                                                <span>Export list</span>
                                                <span
                                                    className="ws-help-icon"
                                                    title="Exports a .loro CRDT snapshot (loro.dev format)"
                                                >
                                                    <MdiHelpCircleOutline aria-hidden />
                                                </span>
                                            </button>
                                            <button
                                                className="ws-action"
                                                onClick={handleRequestImport}
                                                role="menuitem"
                                                type="button"
                                            >
                                                <MdiTrayArrowDown className="ws-icon" aria-hidden />
                                                <span>Import list</span>
                                                <span
                                                    className="ws-help-icon"
                                                    title="Imports a .loro CRDT snapshot (loro.dev format) into this list"
                                                >
                                                    <MdiHelpCircleOutline aria-hidden />
                                                </span>
                                            </button>
                                            <button
                                                className="ws-action"
                                                onClick={() => void onJoin()}
                                                role="menuitem"
                                                type="button"
                                            >
                                                <MdiLinkVariant className="ws-icon" aria-hidden />
                                                Join by URL…
                                            </button>
                                            <button
                                                className="ws-action"
                                                onClick={() => void onCreate()}
                                                role="menuitem"
                                            >
                                                ＋ New list…
                                            </button>
                                            {workspaceHex && (
                                                <button
                                                    className="ws-action danger"
                                                    onClick={() => void onDelete()}
                                                    role="menuitem"
                                                >
                                                    <StreamlinePlumpRecycleBin2Remix /> Delete current…
                                                </button>
                                            )}
                                        </div>
                                    );
                                })()}
                            </div>
                        )}
                        <input
                            ref={wsImportInputRef}
                            type="file"
                            accept=".loro,application/octet-stream"
                            style={{ display: "none" }}
                            onChange={(event) => {
                                void handleImportFileChange(event);
                            }}
                        />
                    </div>
                    <NetworkStatusIndicator
                        connectionStatus={connectionStatus}
                        presenceCount={presenceCount}
                        presencePeers={presencePeers}
                        latencyMs={latencyMs}
                        onRequestToast={handleStatusToast}
                        selfPeerId={doc.peerIdStr}
                    />
                    {fallbackActive && (
                        <div className="fallback-banner" role="alert" aria-live="assertive">
                            Sync is offline because Web Crypto isn't available. Serve the app
                            over HTTPS or localhost to re-enable public sync.
                        </div>
                    )}
                </header>
                {storageWarning && (
                    <div className="storage-warning" role="alert" aria-live="assertive">
                        <span className="storage-warning-message">{storageWarning}</span>
                        <button
                            type="button"
                            className="storage-warning-dismiss"
                            onClick={dismissStorageWarning}
                            aria-label="Dismiss storage warning"
                        >
                            Dismiss
                        </button>
                    </div>
                )}

                <div className="new-todo">
                    <NewTodoInput
                        inputRef={newTodoInputRef}
                        value={newText}
                        detached={detached}
                        onChange={setNewText}
                        onSubmit={() => addTodo(newText)}
                    />
                    <button
                        className="btn btn-primary"
                        onClick={() => {
                            addTodo(newText);
                        }}
                        disabled={detached}
                    >
                        Add
                    </button>
                </div>

                <div className="toolbar">
                    <button
                        className="btn btn-secondary btn-icon-only"
                        onClick={() => {
                            undo.undo();
                        }}
                        disabled={!undo.canUndo?.() || detached}
                        aria-label="Undo"
                        title="Undo"
                    >
                        <LucideUndo2 className="btn-icon" aria-hidden />
                    </button>
                    <button
                        className="btn btn-secondary btn-icon-only"
                        onClick={() => {
                            undo.redo();
                        }}
                        disabled={!undo.canRedo?.() || detached}
                        aria-label="Redo"
                        title="Redo"
                    >
                        <LucideUndo2
                            className="btn-icon"
                            style={{ transform: "scaleX(-1)" }}
                            aria-hidden
                        />
                    </button>
                    <button
                        className="btn btn-secondary btn-icon-only"
                        onClick={() =>
                            void setState((draft) => {
                                for (let i = draft.todos.length - 1; i >= 0; i--) {
                                    if (draft.todos[i].status === "done") {
                                        draft.todos.splice(i, 1);
                                    }
                                }
                            })
                        }
                        disabled={detached || !hasDone}
                        aria-label="Clear completed"
                        title="Clear completed"
                    >
                        <MdiBroom className="btn-icon" aria-hidden />
                    </button>
                    <button
                        className="btn btn-secondary push-right"
                        onClick={async () => {
                            try {
                                await navigator.clipboard.writeText(shareUrl);
                                if (toastTimerRef.current)
                                    window.clearTimeout(toastTimerRef.current);
                                setToast("Invite link copied");
                                toastTimerRef.current = window.setTimeout(() => {
                                    setToast(null);
                                }, TOAST_DURATION_MS);
                            } catch {
                                window.prompt("Copy this invite URL and share it:", shareUrl);
                            }
                        }}
                        title="Copy invite URL"
                    >
                        Share
                    </button>
                    <button
                        className={
                            "btn btn-secondary " + (showHistory ? "" : "btn-icon-only")
                        }
                        onClick={() => setShowHistory((value) => !value)}
                        aria-expanded={showHistory}
                        aria-controls="workspace-history"
                    >
                        {showHistory ? (
                            "Hide History"
                        ) : (
                            <IcSharpHistory className="btn-icon" />
                        )}
                    </button>
                    <button
                        className={"btn btn-secondary " + (showHelp ? "" : "btn-icon-only")}
                        ref={helpButtonRef}
                        type="button"
                        onClick={() => setShowHelp((value) => !value)}
                        aria-label="About Loro"
                        aria-expanded={showHelp}
                        aria-controls="loro-help-panel"
                        aria-haspopup="dialog"
                        title={showHelp ? "Hide help" : "About Loro"}
                    >
                        {showHelp ? (
                            "Hide Help"
                        ) : (
                            <LucideInfo className="btn-icon" aria-hidden />
                        )}
                    </button>
                </div>
                {showHelp && (
                    <div
                        className="help-backdrop"
                        role="presentation"
                        onClick={() => setShowHelp(false)}
                    >
                        <section
                            id="loro-help-panel"
                            ref={helpDialogRef}
                            className="help-card card help-dialog"
                            aria-label="About Loro"
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="loro-help-title"
                            tabIndex={-1}
                            onClick={(event) => {
                                event.stopPropagation();
                            }}
                        >
                            <header className="help-header">
                                <h2 className="help-title" id="loro-help-title">
                                    About
                                </h2>
                                <button
                                    type="button"
                                    className="help-close"
                                    onClick={() => setShowHelp(false)}
                                    aria-label="Close help dialog"
                                    title="Close"
                                >
                                    Close
                                </button>
                            </header>
                            <p className="help-lead">
                                This example to-do app is powered by Loro. It stays local-first
                                and account-free, keeping your edits in this browser while
                                mirroring them through Loro&apos;s relay for seven days so
                                everyone stays in sync.
                            </p>
                            <div className="help-quick-cards">
                                <article className="help-quick-card">
                                    <LucideUsers className="help-card-icon" aria-hidden />
                                    <div>
                                        <h3>Invite instantly</h3>
                                        <p>Share the link to co-edit live.</p>
                                    </div>
                                </article>
                                <article className="help-quick-card">
                                    <LucideWifiOff className="help-card-icon" aria-hidden />
                                    <div>
                                        <h3>Stay offline</h3>
                                        <p>
                                            Keep working offline; Loro merges edits when you
                                            reconnect.
                                        </p>
                                    </div>
                                </article>
                                <article className="help-quick-card">
                                    <LucideCode2 className="help-card-icon" aria-hidden />
                                    <div>
                                        <h3>
                                            Build with{" "}
                                            <a
                                                href="https://loro.dev"
                                                target="_blank"
                                                style={{ color: "currentcolor" }}
                                            >
                                                Loro
                                            </a>
                                        </h3>
                                        <p>
                                            Developers can ship collaborative apps like this with the
                                            same toolkit.
                                        </p>
                                    </div>
                                </article>
                            </div>
                            <p className="help-paragraph">
                                Open source on{" "}
                                <a
                                    href="https://github.com/loro-dev/loro-todo"
                                    target="_blank"
                                    rel="noreferrer"
                                    className="help-inline-link help-github-link"
                                >
                                    <LucideGithub className="help-github-icon" aria-hidden />
                                    loro-dev/loro-todo
                                </a>
                                .
                            </p>
                        </section>
                    </div>
                )}
                {showDeleteDialog && (
                    <div
                        className="confirm-backdrop"
                        role="presentation"
                        onClick={handleCancelDelete}
                    >
                        <section
                            className="card delete-dialog"
                            role="alertdialog"
                            aria-modal="true"
                            aria-labelledby="delete-dialog-title"
                            aria-describedby="delete-dialog-body"
                            tabIndex={-1}
                            ref={deleteDialogRef}
                            onClick={(event) => {
                                event.stopPropagation();
                            }}
                        >
                            <h2 id="delete-dialog-title">Delete list?</h2>
                            {/* TODO: REVIEW [Ensure delete confirmation copy matches product tone] */}
                            <p id="delete-dialog-body">
                                Deleting only removes this list’s local data. It stays in the
                                cloud for 7 days and you can re-add it with the invite URL.
                            </p>
                            <p className="delete-dialog-note">
                                Lose the URL and it cannot be recovered.
                            </p>
                            <div className="delete-dialog-actions">
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={handleCancelDelete}
                                >
                                    Keep list
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-danger"
                                    onClick={() => {
                                        void handleConfirmDelete();
                                    }}
                                >
                                    Delete list
                                </button>
                            </div>
                        </section>
                    </div>
                )}
                {showHistory && (
                    <div id="workspace-history">
                        <HistoryView doc={doc} />
                    </div>
                )}

                <ul
                    className="todo-list"
                    ref={listRef}
                    onDragOver={handleListDragOver}
                    onDrop={handleListDrop}
                    style={{
                        height: positions.height,
                        touchAction: manualDrag ? "none" : undefined,
                    }}
                >
                    {(() => {
                        const stableTodos = [...state.todos].sort((a, b) =>
                            a.$cid.localeCompare(b.$cid),
                        );
                        const indexByCid: Record<string, number> = {};
                        for (let i = 0; i < state.todos.length; i++) {
                            indexByCid[state.todos[i].$cid] = i;
                        }
                        return stableTodos.map((todo) => {
                            const realIndex = indexByCid[todo.$cid] ?? 0;
                            const baseY = positions.pos[todo.$cid] ?? 0;
                            let translateY = baseY;
                            let transition = transformTransitionsReady
                                ? "transform 240ms ease"
                                : "transform 0ms linear";
                            let zIndex = 1;
                            const activeDragCid = manualDrag?.cid ?? dragCid;
                            const isManualActive = manualDrag?.cid === todo.$cid;
                            const activeDragIndex =
                                activeDragCid != null ? (indexByCid[activeDragCid] ?? -1) : -1;
                            const activeDragHeight =
                                activeDragCid != null
                                    ? (manualDrag?.height ??
                                        itemHeights[activeDragCid] ??
                                        DEFAULT_HEIGHT)
                                    : DEFAULT_HEIGHT;
                            if (isManualActive && manualDrag) {
                                const rawY =
                                    manualDrag.clientY - manualDrag.listTop - manualDrag.offsetY;
                                const minY = -manualDrag.height * 0.6;
                                const maxY = Math.max(
                                    positions.height - manualDrag.height * 0.4,
                                    minY,
                                );
                                const clampedY = Math.min(Math.max(rawY, minY), maxY);
                                translateY = clampedY;
                                transition = "transform 0ms linear";
                                zIndex = 5;
                            } else if (activeDragCid === todo.$cid && dragCid === todo.$cid) {
                                transition = "transform 0ms linear";
                                zIndex = 5;
                            }
                            if (
                                activeDragCid &&
                                activeDragIndex !== -1 &&
                                insertIndex != null &&
                                todo.$cid !== activeDragCid
                            ) {
                                if (insertIndex > activeDragIndex) {
                                    if (
                                        realIndex > activeDragIndex &&
                                        realIndex <= insertIndex - 1
                                    ) {
                                        translateY -= activeDragHeight + ITEM_GAP;
                                    }
                                } else if (insertIndex <= activeDragIndex) {
                                    if (realIndex >= insertIndex && realIndex < activeDragIndex) {
                                        translateY += activeDragHeight + ITEM_GAP;
                                    }
                                }
                            }
                            return (
                                <TodoItemRow
                                    key={todo.$cid}
                                    todo={todo as Todo}
                                    onTextChange={handleTextChange}
                                    onDoneChange={handleDoneChange}
                                    onDelete={handleDelete}
                                    dragging={dragCid === todo.$cid}
                                    onManualPointerDown={handleManualPointerDown}
                                    onManualPointerMove={handleManualPointerMove}
                                    onManualPointerUp={handleManualPointerUp}
                                    onManualPointerCancel={handleManualPointerCancel}
                                    detached={detached}
                                    onHeightChange={handleRowHeight}
                                    onRowRefChange={handleRowAttachment}
                                    style={{
                                        position: "absolute",
                                        left: 0,
                                        right: 0,
                                        transform: `translateY(${translateY}px)`,
                                        transition,
                                        willChange: "transform",
                                        zIndex,
                                        touchAction:
                                            manualDrag?.cid === todo.$cid ? "none" : undefined,
                                    }}
                                />
                            );
                        });
                    })()}
                </ul>

                {toast && (
                    <div className="toast" role="status" aria-live="polite">
                        {toast}
                    </div>
                )}
            </div>
        </SelectionProvider>
    );
}
