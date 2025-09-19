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
import type { ClientStatusValue } from "loro-websocket";
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
import {
    SelectionProvider,
    type RemoteSelectionMap,
} from "./selection";
import HistoryView from "./HistoryView";
import {
    KeyboardShortcutsBridge,
} from "./KeyboardShortcutsBridge";
import { SelectionSyncBridge } from "./SelectionSyncBridge";
import type { Todo } from "./todos/types";
import { getCollaboratorColorForId } from "./collaboratorColors";
import {
    deleteWorkspaceAndList,
    ensurePersistentStorage,
    navigateToWorkspaceRoute,
    saveWorkspaceSnapshot,
    snapshotToArrayBuffer,
    switchToWorkspace,
    updateWorkspaceName,
    createNewWorkspace,
    markBootstrapNextWorkspace,
} from "./workspace";
import type { WorkspaceKeys, WorkspaceRecord } from "./workspace";
import {
    usePublicSyncSession,
    useWorkspacePersistence,
    useWorkspaceListLoader,
    usePreventViewportScaling,
    useHelpDialogFocus,
    useDeleteDialogFocus,
    useWorkspaceTitleAutosize,
    useWorkspaceMenuDismiss,
    useWorkspaceMenuPlacement,
    useSnapshotOnUnload,
    useGlobalDragDropHandlers,
} from "./workspace/hooks";
import { WorkspaceTitleSection } from "./workspace/WorkspaceTitleSection";
import { WorkspaceToolbar } from "./workspace/WorkspaceToolbar";
import { HelpDialog, DeleteWorkspaceDialog } from "./workspace/WorkspaceDialogs";
import { WorkspaceNewTodo } from "./workspace/WorkspaceNewTodo";
import { WorkspaceTodoList } from "./workspace/WorkspaceTodoList";
import { StorageWarningBanner } from "./workspace/StorageWarningBanner";
import { ToastMessage } from "./workspace/ToastMessage";

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
    const [connectionStatus, setConnectionStatus] =
        useState<ClientStatusValue>("connecting");
    const [latencyMs, setLatencyMs] = useState<number | null>(null);
    const [presenceCount, setPresenceCount] = useState<number>(0);
    const [workspaceHex, setWorkspaceHex] = useState<string>(workspace.publicHex);
    const [presencePeers, setPresencePeers] = useState<string[]>([]);
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

    usePreventViewportScaling();

    const closeHelp = useCallback(() => {
        setShowHelp(false);
    }, [setShowHelp]);

    const syncClient = usePublicSyncSession({
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
    });

    useWorkspacePersistence(doc, workspaceHex);
    useWorkspaceListLoader(setWorkspaces);
    useHelpDialogFocus(showHelp, helpDialogRef, helpButtonRef, closeHelp);
    useWorkspaceTitleAutosize(
        displayedWorkspaceTitle,
        wsTitleInputRef,
        wsMeasureRef,
    );
    useWorkspaceMenuDismiss(showWsMenu, wsTitleRef, setShowWsMenu);
    useWorkspaceMenuPlacement(showWsMenu, wsMenuRef);

    const handleWorkspaceTitleChange = useCallback((value: string) => {
        setWorkspaceTitle(value);
        if (wsDebounceRef.current) {
            window.clearTimeout(wsDebounceRef.current);
        }
        wsDebounceRef.current = window.setTimeout(() => {
            void setState((draft) => {
                draft.workspace.name = value;
            });
        }, 300);
    }, [setState, setWorkspaceTitle]);

    const toggleWorkspaceMenu = useCallback(() => {
        setShowWsMenu((value) => !value);
    }, [setShowWsMenu]);

    const closeWorkspaceMenu = useCallback(() => {
        setShowWsMenu(false);
    }, [setShowWsMenu]);

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
    useDeleteDialogFocus(showDeleteDialog, deleteDialogRef, handleCancelDelete);

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

    useSnapshotOnUnload(persistSnapshotNow, skipSnapshotOnUnloadRef);

    const handleWorkspaceSelect = useCallback(async (id: string) => {
        await persistSnapshotNow();
        await switchToWorkspace(id);
        closeWorkspaceMenu();
    }, [closeWorkspaceMenu, persistSnapshotNow]);

    const handleWorkspaceCreate = useCallback(async () => {
        await persistSnapshotNow();
        await createNewWorkspace();
        closeWorkspaceMenu();
    }, [closeWorkspaceMenu, persistSnapshotNow]);

    const handleWorkspaceDeleteRequest = useCallback(() => {
        closeWorkspaceMenu();
        setShowDeleteDialog(true);
    }, [closeWorkspaceMenu, setShowDeleteDialog]);

    const handleWorkspaceJoin = useCallback(async () => {
        const input = window.prompt("Paste the invite URL to join:", "");
        if (!input) {
            closeWorkspaceMenu();
            return;
        }
        const url = input.trim();
        try {
            if (workspaceHex) {
                await persistSnapshotNow();
            }
            let handled = false;
            try {
                const parsed = new URL(url, window.location.href);
                if (parsed.origin === window.location.origin) {
                    const pathParts = parsed.pathname.split("/").filter(Boolean);
                    const targetPublic = pathParts[pathParts.length - 1] ?? "";
                    const targetPrivate = parsed.hash.startsWith("#")
                        ? parsed.hash.slice(1)
                        : "";
                    if (targetPublic && targetPrivate) {
                        navigateToWorkspaceRoute(targetPublic, targetPrivate);
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
            closeWorkspaceMenu();
        }
    }, [closeWorkspaceMenu, persistSnapshotNow, workspaceHex]);

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
            closeWorkspaceMenu();
        }
    }, [
        doc,
        handleStatusToast,
        requestPersistentStorage,
        closeWorkspaceMenu,
        workspaceFileName,
        workspaceHex,
    ]);

    const handleRequestImport = useCallback(() => {
        if (!workspaceHex) {
            handleStatusToast("List not ready");
            return;
        }
        void requestPersistentStorage();
        closeWorkspaceMenu();
        window.setTimeout(() => {
            wsImportInputRef.current?.click();
        }, 0);
    }, [
        handleStatusToast,
        requestPersistentStorage,
        closeWorkspaceMenu,
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


    function addTodo(text: string) {
        if (!text.trim()) return;
        void requestPersistentStorage();
        void setState((draft) => {
            draft.todos.splice(0, 0, { text, status: "todo" });
        });
        setNewText("");
    }

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

    const handleClearCompleted = useCallback(() => {
        void setState((draft) => {
            for (let i = draft.todos.length - 1; i >= 0; i--) {
                if (draft.todos[i].status === "done") {
                    draft.todos.splice(i, 1);
                }
            }
        });
    }, [setState]);

    const handleShareInvite = useCallback(() => {
        if (typeof navigator === "undefined" || !navigator.clipboard) {
            window.prompt("Copy this invite URL and share it:", shareUrl);
            return;
        }
        void navigator.clipboard.writeText(shareUrl).then(
            () => {
                handleStatusToast("Invite link copied");
            },
            () => {
                window.prompt("Copy this invite URL and share it:", shareUrl);
            },
        );
    }, [handleStatusToast, shareUrl]);

    const toggleHistory = useCallback(() => {
        setShowHistory((value) => !value);
    }, [setShowHistory]);

    const toggleHelp = useCallback(() => {
        setShowHelp((value) => !value);
    }, [setShowHelp]);

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

    useGlobalDragDropHandlers(dragCid, updateInsertIndexFromPointer, commitDrop);

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
                    <WorkspaceTitleSection
                        displayedWorkspaceTitle={displayedWorkspaceTitle}
                        disabled={detached}
                        onTitleChange={handleWorkspaceTitleChange}
                        titleContainerRef={wsTitleRef}
                        titleInputRef={wsTitleInputRef}
                        titleMeasureRef={wsMeasureRef}
                        dropdownButtonRef={wsDropdownButtonRef}
                        showMenu={showWsMenu}
                        onToggleMenu={toggleWorkspaceMenu}
                        menuRef={wsMenuRef}
                        workspaceHex={workspaceHex}
                        workspaces={workspaces}
                        onChooseWorkspace={handleWorkspaceSelect}
                        onCreateWorkspace={handleWorkspaceCreate}
                        onDeleteWorkspace={handleWorkspaceDeleteRequest}
                        onJoinWorkspace={handleWorkspaceJoin}
                        onExportWorkspace={handleExportWorkspace}
                        onRequestImport={handleRequestImport}
                        importInputRef={wsImportInputRef}
                        onImportFileChange={handleImportFileChange}
                    />
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
                    <StorageWarningBanner
                        message={storageWarning}
                        onDismiss={dismissStorageWarning}
                    />
                )}

                <WorkspaceNewTodo
                    value={newText}
                    detached={detached}
                    onChange={setNewText}
                    onSubmit={() => addTodo(newText)}
                    inputRef={newTodoInputRef}
                />

                <WorkspaceToolbar
                    onUndo={handleUndo}
                    onRedo={handleRedo}
                    disableUndo={!undo.canUndo?.() || detached}
                    disableRedo={!undo.canRedo?.() || detached}
                    onClearCompleted={handleClearCompleted}
                    clearCompletedDisabled={detached || !hasDone}
                    onShare={handleShareInvite}
                    onToggleHistory={toggleHistory}
                    showHistory={showHistory}
                    onToggleHelp={toggleHelp}
                    showHelp={showHelp}
                    helpButtonRef={helpButtonRef}
                />
                <HelpDialog open={showHelp} onClose={closeHelp} dialogRef={helpDialogRef} />
                <DeleteWorkspaceDialog
                    open={showDeleteDialog}
                    onCancel={handleCancelDelete}
                    onConfirm={handleConfirmDelete}
                    dialogRef={deleteDialogRef}
                />
                {showHistory && (
                    <div id="workspace-history">
                        <HistoryView doc={doc} />
                    </div>
                )}

                <WorkspaceTodoList
                    todos={state.todos as Todo[]}
                    listRef={listRef}
                    positions={positions}
                    transformTransitionsReady={transformTransitionsReady}
                    dragCid={dragCid}
                    insertIndex={insertIndex}
                    itemHeights={itemHeights}
                    itemGap={ITEM_GAP}
                    defaultHeight={DEFAULT_HEIGHT}
                    manualDrag={manualDrag}
                    onListDragOver={handleListDragOver}
                    onListDrop={handleListDrop}
                    onTextChange={handleTextChange}
                    onDoneChange={handleDoneChange}
                    onDelete={handleDelete}
                    onHeightChange={handleRowHeight}
                    onRowRefChange={handleRowAttachment}
                    onManualPointerDown={handleManualPointerDown}
                    onManualPointerMove={handleManualPointerMove}
                    onManualPointerUp={handleManualPointerUp}
                    onManualPointerCancel={handleManualPointerCancel}
                    detached={detached}
                />

                {toast && <ToastMessage>{toast}</ToastMessage>}
            </div>
        </SelectionProvider>
    );
}
