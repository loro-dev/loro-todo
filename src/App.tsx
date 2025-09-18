import React, {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  SVGProps,
} from "react";
import { useLoroStore } from "loro-mirror-react";
import {
  createConfiguredDoc,
  createUndoManager,
  initialTodoState,
  todoSchema,
  type TodoStatus,
} from "./state/doc";
import {
  deleteWorkspaceAndList,
  fetchWorkspaceById,
  listAllWorkspaces,
  saveWorkspaceSnapshot,
  setupWorkspacePersistence,
  snapshotToArrayBuffer,
  ensurePersistentStorage,
  updateWorkspaceName,
  type WorkspaceRecord,
} from "./state/storage";
import type { ClientStatusValue, LoroWebsocketClient } from "loro-websocket";
import type { WorkspaceConnectionKeys } from "./state/publicSync";
import { useLongPressDrag } from "./useLongPressDrag";
import { NetworkStatusIndicator } from "./NetworkStatusIndicator";
import { createPresenceScheduler, type IdleWindow } from "./state/presence";
import { TodoTextInput } from "./TodoTextInput";
import {
  SelectionProvider,
  useAppSelection,
  type RemoteSelectionMap,
} from "./selection";
import { registerKeyboardHandlers } from "./keyboard";
import {
  createSelectionSyncSession,
  type SelectionSyncSession,
} from "./state/selectionSync";
import { getCollaboratorColorForId } from "./collaboratorColors";

const HistoryView = React.lazy(() => import("./HistoryView"));

type PublicSyncModule = typeof import("./state/publicSync");
type CryptoModule = typeof import("./state/crypto");
type WorkspaceKeys = WorkspaceConnectionKeys;

let publicSyncModulePromise: Promise<PublicSyncModule> | null = null;
function loadPublicSyncModule(): Promise<PublicSyncModule> {
  if (!publicSyncModulePromise) {
    publicSyncModulePromise = import("./state/publicSync");
  }
  return publicSyncModulePromise;
}

let cryptoModulePromise: Promise<CryptoModule> | null = null;
function loadCryptoModule(): Promise<CryptoModule> {
  if (!cryptoModulePromise) {
    cryptoModulePromise = import("./state/crypto");
  }
  return cryptoModulePromise;
}
async function switchToWorkspace(id: string): Promise<void> {
  const record = await fetchWorkspaceById(id);
  if (!record) return;
  window.location.assign(`/${record.id}#${record.privateHex}`);
}

async function createNewWorkspace(): Promise<void> {
  const { generatePairAndUrl } = await loadCryptoModule();
  const generated = await generatePairAndUrl();
  window.location.assign(`/${generated.publicHex}#${generated.privateHex}`);
}

function normalizeHex(value: string): string {
  return value.trim().toLowerCase();
}

function getWorkspaceRouteKey(): string {
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

export function MaterialSymbolsKeyboardArrowDown(
  props: SVGProps<SVGSVGElement>,
) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      {...props}
    >
      {/* Icon from Material Symbols by Google - https://github.com/google/material-design-icons/blob/master/LICENSE */}
      <path
        fill="currentColor"
        d="m12 15.4l-6-6L7.4 8l4.6 4.6L16.6 8L18 9.4z"
      />
    </svg>
  );
}

export function MdiGithub(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      {...props}
    >
      {/* Icon from Material Design Icons by Pictogrammers - https://github.com/Templarian/MaterialDesign/blob/master/LICENSE */}
      <path
        fill="currentColor"
        d="M12 2A10 10 0 0 0 2 12c0 4.42 2.87 8.17 6.84 9.5c.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34c-.46-1.16-1.11-1.47-1.11-1.47c-.91-.62.07-.6.07-.6c1 .07 1.53 1.03 1.53 1.03c.87 1.52 2.34 1.07 2.91.83c.09-.65.35-1.09.63-1.34c-2.22-.25-4.55-1.11-4.55-4.92c0-1.11.38-2 1.03-2.71c-.1-.25-.45-1.29.1-2.64c0 0 .84-.27 2.75 1.02c.79-.22 1.65-.33 2.5-.33s1.71.11 2.5.33c1.91-1.29 2.75-1.02 2.75-1.02c.55 1.35.2 2.39.1 2.64c.65.71 1.03 1.6 1.03 2.71c0 3.82-2.34 4.66-4.57 4.91c.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0 0 12 2"
      />
    </svg>
  );
}

export function MdiBroom(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      {...props}
    >
      {/* Icon from Material Design Icons by Pictogrammers - https://github.com/Templarian/MaterialDesign/blob/master/LICENSE */}
      <path
        fill="currentColor"
        d="m19.36 2.72l1.42 1.42l-5.72 5.71c1.07 1.54 1.22 3.39.32 4.59L9.06 8.12c1.2-.9 3.05-.75 4.59.32zM5.93 17.57c-2.01-2.01-3.24-4.41-3.58-6.65l4.88-2.09l7.44 7.44l-2.09 4.88c-2.24-.34-4.64-1.57-6.65-3.58"
      />
    </svg>
  );
}

export function MdiTrayArrowUp(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      {...props}
    >
      {/* Icon from Material Design Icons by Pictogrammers - https://github.com/Templarian/MaterialDesign/blob/master/LICENSE */}
      <path
        fill="currentColor"
        d="M2 12h2v5h16v-5h2v5c0 1.11-.89 2-2 2H4a2 2 0 0 1-2-2zM12 2L6.46 7.46l1.42 1.42L11 5.75V15h2V5.75l3.13 3.13l1.42-1.43z"
      />
    </svg>
  );
}

export function MdiTrayArrowDown(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      {...props}
    >
      {/* Icon from Material Design Icons by Pictogrammers - https://github.com/Templarian/MaterialDesign/blob/master/LICENSE */}
      <path
        fill="currentColor"
        d="M2 12h2v5h16v-5h2v5c0 1.11-.89 2-2 2H4a2 2 0 0 1-2-2zm10 3l5.55-5.46l-1.42-1.41L13 11.25V2h-2v9.25L7.88 8.13L6.46 9.55z"
      />
    </svg>
  );
}

export function MdiLinkVariant(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      {...props}
    >
      {/* Icon from Material Design Icons by Pictogrammers - https://github.com/Templarian/MaterialDesign/blob/master/LICENSE */}
      <path
        fill="currentColor"
        d="M10.59 13.41c.41.39.41 1.03 0 1.42c-.39.39-1.03.39-1.42 0a5.003 5.003 0 0 1 0-7.07l3.54-3.54a5.003 5.003 0 0 1 7.07 0a5.003 5.003 0 0 1 0 7.07l-1.49 1.49c.01-.82-.12-1.64-.4-2.42l.47-.48a2.98 2.98 0 0 0 0-4.24a2.98 2.98 0 0 0-4.24 0l-3.53 3.53a2.98 2.98 0 0 0 0 4.24m2.82-4.24c.39-.39 1.03-.39 1.42 0a5.003 5.003 0 0 1 0 7.07l-3.54 3.54a5.003 5.003 0 0 1-7.07 0a5.003 5.003 0 0 1 0-7.07l1.49-1.49c-.01.82.12 1.64.4 2.43l-.47.47a2.98 2.98 0 0 0 0 4.24a2.98 2.98 0 0 0 4.24 0l3.53-3.53a2.98 2.98 0 0 0 0-4.24a.973.973 0 0 1 0-1.42"
      />
    </svg>
  );
}

export function MdiHelpCircleOutline(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      {...props}
    >
      {/* Icon from Material Design Icons by Pictogrammers - https://github.com/Templarian/MaterialDesign/blob/master/LICENSE */}
      <path
        fill="currentColor"
        d="M11 18h2v-2h-2zm1-16A10 10 0 0 0 2 12a10 10 0 0 0 10 10a10 10 0 0 0 10-10A10 10 0 0 0 12 2m0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8s8 3.59 8 8s-3.59 8-8 8m0-14a4 4 0 0 0-4 4h2a2 2 0 0 1 2-2a2 2 0 0 1 2 2c0 2-3 1.75-3 5h2c0-2.25 3-2.5 3-5a4 4 0 0 0-4-4"
      />
    </svg>
  );
}

// Lucide Undo2 icon for undo/redo buttons
// Icon from Lucide by Lucide Contributors - https://github.com/lucide-icons/lucide/blob/main/LICENSE
export function LucideUndo2(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      {...props}
    >
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      >
        <path d="M9 14L4 9l5-5" />
        <path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11" />
      </g>
    </svg>
  );
}

// Lucide Info icon for help button
// Icon from Lucide by Lucide Contributors - https://github.com/lucide-icons/lucide/blob/main/LICENSE
export function LucideInfo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      {...props}
    >
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M12 16v-4" />
        <path d="M12 8h.01" />
      </g>
    </svg>
  );
}

// Lucide Users icon for collaboration tips
// Icon from Lucide by Lucide Contributors - https://github.com/lucide-icons/lucide/blob/main/LICENSE
export function LucideUsers(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      {...props}
    >
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      >
        <path d="M18 21a8 8 0 0 0-16 0" />
        <circle cx="10" cy="8" r="4" />
        <path d="M23 21a10.38 10.38 0 0 0-6-9.5" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </g>
    </svg>
  );
}

// Lucide WifiOff icon for offline messaging
// Icon from Lucide by Lucide Contributors - https://github.com/lucide-icons/lucide/blob/main/LICENSE
export function LucideWifiOff(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      {...props}
    >
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      >
        <path d="m2 2l20 20" />
        <path d="M16.72 11.06A10.94 10.94 0 0 0 12 10c-2.2 0-4.25.64-5.9 1.72" />
        <path d="M5 16.58a5.53 5.53 0 0 1 7.68-.11" />
        <path d="M1.42 9a17.91 17.91 0 0 1 5.1-2.88" />
        <path d="M10.71 5.05A17.9 17.9 0 0 1 22.58 9" />
        <path d="M12 20h.01" />
      </g>
    </svg>
  );
}

// Lucide Code2 icon for developer messaging
// Icon from Lucide by Lucide Contributors - https://github.com/lucide-icons/lucide/blob/main/LICENSE
export function LucideCode2(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      {...props}
    >
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      >
        <path d="m18 16l4-4l-4-4" />
        <path d="m6 8l-4 4l4 4" />
        <path d="m14.5 4l-5 16" />
      </g>
    </svg>
  );
}

// Lucide Github icon for repository link
// Icon from Lucide by Lucide Contributors - https://github.com/lucide-icons/lucide/blob/main/LICENSE
export function LucideGithub(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      {...props}
    >
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      >
        <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5c.08-1.33-.35-2.63-1.2-3.65c.28-1.15.28-2.35 0-3.5c0 0-1-.3-3 1.2c-2.04-.56-4.2-.56-6.24 0c-2-1.5-3-1.2-3-1.2c-.28 1.15-.28 2.35 0 3.5C5.35 6.37 4.92 7.67 5 9c0 3.5 3 5.5 6 5.5c-.39.49-.68 1.05-.85 1.65c-.17.6-.22 1.23-.15 1.85V22" />
        <path d="M9 18c-4 2-4-2-6-2" />
      </g>
    </svg>
  );
}

export function IcSharpHistory(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      {...props}
    >
      {/* Icon from Google Material Icons by Material Design Authors - https://github.com/material-icons/material-icons/blob/master/LICENSE */}
      <path
        fill="currentColor"
        d="M13 3a9 9 0 0 0-9 9H1l3.89 3.89l.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7s-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.95 8.95 0 0 0 13 21a9 9 0 0 0 0-18m-1 5v5l4.25 2.52l.77-1.29l-3.52-2.09V8z"
      />
    </svg>
  );
}

export function StreamlinePlumpRecycleBin2Remix(
  props: SVGProps<SVGSVGElement>,
) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1em"
      height="1em"
      viewBox="0 0 48 48"
      {...props}
    >
      {/* Icon from Plump free icons by Streamline - https://creativecommons.org/licenses/by/4.0/ */}
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M15.864 5.595a9.045 9.045 0 0 1 16.273 0c3.586.085 6.359.209 8.052.298c1.421.074 2.963.687 3.77 2.14a9.7 9.7 0 0 1 .954 2.461c.065.274.087.541.087.788c0 1.44-.801 2.722-2.024 3.345a659 659 0 0 1-.714 25.01c-.185 3.856-3.142 7.025-7.042 7.351c-3.036.254-7.12.512-11.22.512c-4.099 0-8.184-.258-11.22-.512c-3.9-.326-6.857-3.495-7.042-7.352a659 659 0 0 1-.715-25.009A3.74 3.74 0 0 1 3 11.282c0-.247.022-.514.087-.788c.23-.98.593-1.809.955-2.46c.806-1.454 2.348-2.067 3.77-2.142a283 283 0 0 1 8.052-.297m-6.835 9.58c.102 10.208.454 19.062.704 24.27c.092 1.904 1.531 3.403 3.38 3.557c2.976.25 6.94.498 10.888.498s7.91-.249 10.886-.498c1.849-.154 3.288-1.653 3.38-3.558c.25-5.207.602-14.061.704-24.27c-3.23.167-8.106.326-14.97.326s-11.741-.159-14.972-.326m10.97 6.262a2 2 0 1 0-3.998.125l.5 16a2 2 0 1 0 3.998-.124zM30.063 19.5A2 2 0 0 0 28 21.438l-.5 16a2 2 0 1 0 3.998.124l.5-16a2 2 0 0 0-1.936-2.061"
        clipRule="evenodd"
      />
    </svg>
  );
}

type KeyboardShortcutsBridgeProps = {
  toggleItem: (cid: string) => void;
  undo: () => void;
  redo: () => void;
  isMacLike: boolean;
  moveItemUp: (cid: string) => void;
  moveItemDown: (cid: string) => void;
};

function KeyboardShortcutsBridge({
  toggleItem,
  undo,
  redo,
  isMacLike,
  moveItemUp,
  moveItemDown,
}: KeyboardShortcutsBridgeProps): null {
  const selection = useAppSelection();
  const { actions, ref } = selection;
  const getSelectionState = useCallback(() => ref.current, [ref]);

  useEffect(() => {
    const cleanup = registerKeyboardHandlers({
      getSelectionState,
      actions,
      toggleItem,
      undo,
      redo,
      isMacLike,
      moveItemUp,
      moveItemDown,
    });
    return () => cleanup();
  }, [
    getSelectionState,
    actions,
    toggleItem,
    undo,
    redo,
    isMacLike,
    moveItemUp,
    moveItemDown,
  ]);

  return null;
}

type SelectionSyncBridgeProps = {
  client: LoroWebsocketClient | null;
  docPeerId: string;
};

function SelectionSyncBridge({
  client,
  docPeerId,
}: SelectionSyncBridgeProps): null {
  const { state, setRemotePeers } = useAppSelection();
  const sessionRef = useRef<SelectionSyncSession | null>(null);
  const selectionRef = useRef(state);
  selectionRef.current = state;

  useEffect(() => {
    const session = sessionRef.current;
    if (!session) return;
    if (state.type === "item") {
      session.updateLocalSelection({ cid: state.cid, mode: state.mode });
    } else {
      session.updateLocalSelection(null);
    }
  }, [state]);

  useEffect(() => {
    let disposed = false;
    sessionRef.current = null;
    setRemotePeers({});

    if (!client) {
      return () => {
        disposed = true;
      };
    }

    const handleRemoteSelections = (peers: RemoteSelectionMap) => {
      if (!disposed) {
        setRemotePeers(peers);
      }
    };

    const start = async () => {
      try {
        const session = await createSelectionSyncSession({
          client,
          docPeerId,
          handlers: { onRemoteSelections: handleRemoteSelections },
        });
        if (disposed) {
          if (session) void session.cleanup();
          return;
        }
        sessionRef.current = session;
        if (session) {
          const current = selectionRef.current;
          if (current.type === "item") {
            session.updateLocalSelection({ cid: current.cid, mode: current.mode });
          } else {
            session.updateLocalSelection(null);
          }
        }
      } catch {
        if (!disposed) {
          setRemotePeers({});
        }
      }
    };

    void start();

    return () => {
      disposed = true;
      setRemotePeers({});
      const existing = sessionRef.current;
      sessionRef.current = null;
      if (existing) {
        void existing.cleanup();
      }
    };
  }, [client, docPeerId, setRemotePeers]);

  return null;
}

type WorkspaceSessionProps = {
  workspace: WorkspaceKeys;
  fallbackActive: boolean;
};

function WorkspaceSession({
  workspace,
  fallbackActive,
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
  const wsDebounceRef = useRef<number | undefined>(undefined);
  const [showWsMenu, setShowWsMenu] = useState<boolean>(false);
  const wsTitleRef = useRef<HTMLDivElement | null>(null);
  const wsTitleInputRef = useRef<HTMLInputElement | null>(null);
  const wsMeasureRef = useRef<HTMLSpanElement | null>(null);
  const wsMenuRef = useRef<HTMLDivElement | null>(null);
  const wsImportInputRef = useRef<HTMLInputElement | null>(null);
  const helpButtonRef = useRef<HTMLButtonElement | null>(null);
  const helpDialogRef = useRef<HTMLDivElement | null>(null);
  // Flag to skip snapshot on navigations that intentionally delete the workspace
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

  // Layout: transform-translate positioning for smooth transitions
  const [itemHeights, setItemHeights] = useState<Record<string, number>>({});
  const ITEM_GAP = 10; // vertical gap between items (px)
  const DEFAULT_HEIGHT = 48; // fallback before first measurement
  const handleRowHeight = useCallback((cid: string, h: number) => {
    setItemHeights((prev) => {
      if (prev[cid] === h) return prev;
      return { ...prev, [cid]: h };
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
    for (const t of state.todos) {
      pos[t.$cid] = y;
      const h = itemHeights[t.$cid] ?? DEFAULT_HEIGHT;
      y += h + ITEM_GAP;
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

  const todosRef = useRef(state.todos);
  useEffect(() => {
    todosRef.current = state.todos;
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
    const fallback = workspaceHex || "workspace";
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

  // Ensure mobile viewport is not scalable (disable pinch-zoom)
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

  // Presence tuning
  const TOAST_DURATION_MS = 2600; // slightly longer toast display

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
    const state = persistentRequestRef.current;
    if (state.granted) return Promise.resolve(true);
    if (state.promise) return state.promise;

    const showWarning = (message: string) => {
      state.unsupportedNotified = true;
      setStorageWarning(message);
    };

    const attempt = ensurePersistentStorage()
      .then(({ granted, supported }) => {
        if (granted) {
          state.granted = true;
          state.unsupportedNotified = false;
          if (storageWarning) setStorageWarning(null);
          // eslint-disable-next-line no-console
          console.info("Persistent storage granted for this origin.");
          return true;
        }
        if (!supported && !state.unsupportedNotified) {
          const reason =
            "Persistent storage API unsupported or insecure context (granted=false, supported=false).";
          showWarning(
            "Your browser doesn't support persistent storage here. Export backups regularly to avoid data loss.",
          );
          // eslint-disable-next-line no-console
          console.warn("Persistent storage unsupported: falling back to best-effort storage.", {
            reason,
          });
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
          "Persistent storage request failed. The browser may clear this workspace—export a backup to protect it.",
        );
        return false;
      })
      .finally(() => {
        state.promise = null;
      });

    state.promise = attempt;
    return attempt;
  }, [ensurePersistentStorage, storageWarning]);

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
        const session = await setupPublicSync(doc, workspace, {
          setDetached,
          setOnline,
          setWorkspaceHex,
          setShareUrl,
          setWorkspaces,
          setConnectionStatus,
          setLatency: setLatencyMs,
        });
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
    // doc/workspace stay stable within a session (component remounts on change)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, workspace]);

  // Debounced persistence to IndexedDB keyed by workspace
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

  // Load workspace list initially after the first paint
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
        window.location.assign(`/${next.id}#${next.privateHex}`);
      } else {
        await createNewWorkspace();
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn("Delete workspace failed:", error);
      skipSnapshotOnUnloadRef.current = false;
    }
  }, [workspaceHex]);

  // Persist the latest snapshot immediately (used before programmatic navigations)
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
      handleStatusToast("Workspace not ready");
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
      handleStatusToast("Workspace exported");
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
      handleStatusToast("Workspace not ready");
      return;
    }
    void requestPersistentStorage();
    setShowWsMenu(false);
    window.setTimeout(() => {
      wsImportInputRef.current?.click();
    }, 0);
  }, [handleStatusToast, requestPersistentStorage, setShowWsMenu, workspaceHex]);

  const handleImportFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      if (!workspaceHex) {
        event.currentTarget.value = "";
        handleStatusToast("Workspace not ready");
        return;
      }
      const input = event.currentTarget;
      const file = input.files?.[0] ?? null;
      input.value = "";
      if (!file) return;
      try {
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        doc.import(bytes);
        await persistSnapshotNow();
        handleStatusToast("Workspace imported");
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn("Import workspace failed:", error);
        handleStatusToast("Import failed");
      }
    },
    [doc, handleStatusToast, persistSnapshotNow, workspaceHex],
  );

  useEffect(() => {
    const unsub = doc.subscribe(() => {
      setDetached(doc.isDetached());
    });
    return () => unsub();
  }, [doc]);

  // Keep local title in sync with CRDT state
  useEffect(() => {
    const name = state.workspace?.name;
    if (typeof name === "string" && name !== workspaceTitle) {
      setWorkspaceTitle(name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.workspace?.name]);

  // Persist workspace name alongside key pairs when it changes
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

  // Close workspace menu on outside click or Escape
  useEffect(() => {
    if (!showWsMenu) return;
    const onDown = (e: MouseEvent) => {
      if (!wsTitleRef.current) return;
      if (!wsTitleRef.current.contains(e.target as Node)) {
        setShowWsMenu(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowWsMenu(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [showWsMenu]);

  // Measure workspace title width to fit content precisely
  useEffect(() => {
    const input = wsTitleInputRef.current;
    const meas = wsMeasureRef.current;
    if (!input || !meas) return;
    input.style.width = meas.offsetWidth + 12 + "px";
  }, [workspaceTitle]);

  // Ensure workspace menu stays inside the viewport with margin
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
    void setState((s) => {
      // Insert new todos at the top of the list
      s.todos.splice(0, 0, { text, status: "todo" });
    });
    setNewText("");
  }

  // Best-effort snapshot flush on page navigation/close (skip when deleting workspace)
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
      void setState((s) => {
        const i = s.todos.findIndex((x) => x.$cid === cid);
        if (i !== -1) s.todos[i].text = value;
      });
    },
    [setState],
  );

  const handleDoneChange = useCallback(
    (cid: string, done: boolean) => {
      void setState((s) => {
        const from = s.todos.findIndex((x) => x.$cid === cid);
        if (from === -1) return;
        s.todos[from].status = done ? "done" : "todo";
        if (done) {
          // Count trailing done items (contiguous from the end)
          let trailingDone = 0;
          for (let idx = s.todos.length - 1; idx >= 0; idx--) {
            if (s.todos[idx].status === "done") trailingDone++;
            else break;
          }
          let startIdx = s.todos.length - trailingDone; // first index of trailing done block
          // Move this item to the start of the trailing done block
          let to = startIdx;
          if (from < to) to -= 1; // account for index shift after removal
          const [item] = s.todos.splice(from, 1);
          s.todos.splice(to, 0, item);
        } else {
          // Move to the start of the unfinished block (boundary before trailing done block)
          // Recompute trailing done items after status change
          let trailingDone = 0;
          for (let idx = s.todos.length - 1; idx >= 0; idx--) {
            if (s.todos[idx].status === "done" || s.todos[idx].$cid === cid)
              trailingDone++;
            else break;
          }
          let to = s.todos.length - trailingDone; // index where done block starts
          if (from < to) to -= 1; // account for shift after removal
          if (to < 0) to = 0;
          if (to > s.todos.length) to = s.todos.length;
          if (from !== to) {
            const [item] = s.todos.splice(from, 1);
            s.todos.splice(to, 0, item);
          }
        }
      });
    },
    [setState],
  );

  const toggleTodo = useCallback(
    (cid: string) => {
      const current = todosRef.current.find((t) => t.$cid === cid);
      if (!current) return;
      handleDoneChange(cid, current.status !== "done");
    },
    [handleDoneChange],
  );

  const moveTodoByOffset = useCallback(
    (cid: string, delta: -1 | 1) => {
      if (delta !== -1 && delta !== 1) return;
      void setState((s) => {
        const fromIndex = s.todos.findIndex((x) => x.$cid === cid);
        if (fromIndex === -1) return;
        const targetIndex = fromIndex + delta;
        if (targetIndex < 0 || targetIndex >= s.todos.length) return;
        const tmp = s.todos[targetIndex];
        s.todos[targetIndex] = s.todos[fromIndex];
        s.todos[fromIndex] = tmp;
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
      void setState((s) => {
        const i = s.todos.findIndex((x) => x.$cid === cid);
        if (i !== -1) s.todos.splice(i, 1);
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
      // convert to container-local Y
      const rect = ul.getBoundingClientRect();
      const y = clientY - rect.top;
      // default to end of list
      let idx = state.todos.length;
      for (let i = 0; i < state.todos.length; i++) {
        const t = state.todos[i];
        if (t.$cid === dragCid) continue; // ignore dragging item
        const top = positions.pos[t.$cid] ?? 0;
        const h = itemHeights[t.$cid] ?? DEFAULT_HEIGHT;
        const midpoint = top + h / 2;
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
    (e: React.DragEvent<HTMLUListElement>) => {
      e.preventDefault();
      updateInsertIndexFromPointer(e.clientY);
    },
    [updateInsertIndexFromPointer],
  );

  const commitDrop = useCallback(() => {
    if (!dragCid || insertIndex == null) return;
    void setState((s) => {
      const from = s.todos.findIndex((x) => x.$cid === dragCid);
      if (from === -1) return;
      let to = insertIndex;
      if (from < to) to = Math.max(0, to - 1);
      to = Math.min(Math.max(0, to), s.todos.length);
      if (from === to) return;
      const [item] = s.todos.splice(from, 1);
      s.todos.splice(to, 0, item);
    });
    setDragCid(null);
    setInsertIndex(null);
  }, [dragCid, insertIndex, setState]);

  const handleListDrop = useCallback(
    (e?: React.DragEvent<HTMLUListElement>) => {
      e?.preventDefault();
      commitDrop();
    },
    [commitDrop],
  );

  const shouldHandleLongPress = useCallback(
    (_cid: string, e: React.PointerEvent<HTMLLIElement>) => {
      if (detached) return false;
      const target = e.target as HTMLElement | null;
      if (!target) return false;
      if (target.closest(".delete-btn")) return false;
      if (e.pointerType === "mouse") {
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

  // Global dragover/drop to handle dropping outside the list bounds
  useEffect(() => {
    if (!dragCid) return;
    const onDragOver = (e: DragEvent) => {
      // allow dropping anywhere by canceling default
      e.preventDefault();
      updateInsertIndexFromPointer(e.clientY);
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      updateInsertIndexFromPointer(e.clientY);
      // small timeout to ensure insertIndex state updates if needed
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
              value={workspaceTitle}
              onChange={(e) => {
                const v = e.currentTarget.value;
                setWorkspaceTitle(v);
                if (wsDebounceRef.current)
                  window.clearTimeout(wsDebounceRef.current);
                wsDebounceRef.current = window.setTimeout(() => {
                  void setState((s) => {
                    s.workspace.name = v;
                  });
                }, 300);
              }}
              placeholder="Workspace name"
              disabled={detached}
              aria-label="Workspace name"
            />
            <span
              className="workspace-title-measure"
              ref={wsMeasureRef}
              aria-hidden
            >
              {workspaceTitle || "Untitled List"}
            </span>
            <button
              className="title-dropdown btn-text"
              type="button"
              onClick={() => setShowWsMenu((v) => !v)}
              aria-label="Switch workspace"
              title="Switch workspace"
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
                      name: workspaceTitle || workspaceHex.slice(0, 16),
                    });
                  }
                  for (const w of workspaces) {
                    if (w.id === workspaceHex) continue;
                    options.push({
                      id: w.id,
                      name: w.name || w.label || w.id.slice(0, 16),
                    });
                  }
                  const onChoose = async (id: string) => {
                    // Force-save current snapshot before navigating
                    await persistSnapshotNow();
                    await switchToWorkspace(id);
                    setShowWsMenu(false);
                  };
                  const onCreate = async () => {
                    // Force-save current snapshot before navigating
                    await persistSnapshotNow();
                    await createNewWorkspace();
                    setShowWsMenu(false);
                  };
                  const onDelete = async () => {
                    await removeCurrentWorkspace();
                    setShowWsMenu(false);
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
                    } finally {
                      setShowWsMenu(false);
                      window.location.assign(url);
                    }
                  };
                  return (
                    <div className="ws-menu">
                      {options.length === 0 && (
                        <div className="ws-empty">No workspaces</div>
                      )}
                      {options.map(({ id, name }) => (
                        <button
                          key={id}
                          className={`ws-item${id === workspaceHex ? " current" : ""}`}
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
                        <span>Export</span>
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
                        <span>Import</span>
                        <span
                          className="ws-help-icon"
                          title="Imports a .loro CRDT snapshot (loro.dev format) into this workspace"
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
                        ＋ New workspace…
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
          {/* Room ID inline display removed; shown via selector options */}
        </header>
        {storageWarning && (
          <div
            className="storage-warning"
            role="alert"
            aria-live="assertive"
          >
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
              void setState((s) => {
                for (let i = s.todos.length - 1; i >= 0; i--) {
                  if (s.todos[i].status === "done") {
                    s.todos.splice(i, 1);
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
                // Fallback: prompt
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
            onClick={() => setShowHistory((v) => !v)}
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
            onClick={() => setShowHelp((v) => !v)}
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
        {showHistory && (
          <Suspense fallback={null}>
            <div id="workspace-history">
              <HistoryView doc={doc} />
            </div>
          </Suspense>
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
            return stableTodos.map((t) => {
              const realIndex = indexByCid[t.$cid] ?? 0;
              const baseY = positions.pos[t.$cid] ?? 0;
              let translateY = baseY;
              let transition = transformTransitionsReady
                ? "transform 240ms ease"
                : "transform 0ms linear";
              let zIndex = 1;
              const activeDragCid = manualDrag?.cid ?? dragCid;
              const isManualActive = manualDrag?.cid === t.$cid;
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
              } else if (activeDragCid === t.$cid && dragCid === t.$cid) {
                transition = "transform 0ms linear";
                zIndex = 5;
              }
              if (
                activeDragCid &&
                activeDragIndex !== -1 &&
                insertIndex != null &&
                t.$cid !== activeDragCid
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
                  key={t.$cid}
                  todo={t}
                  onTextChange={handleTextChange}
                  onDoneChange={handleDoneChange}
                  onDelete={handleDelete}
                  dragging={dragCid === t.$cid}
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
                      manualDrag?.cid === t.$cid ? "none" : undefined,
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

export function App() {
  const [workspace, setWorkspace] = useState<WorkspaceKeys | null>(null);
  const [fallbackActive, setFallbackActive] = useState<boolean>(false);
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
      setWorkspace(activeWorkspace);
      return;
    }

    ensureCounterRef.current += 1;
    const ensureId = ensureCounterRef.current;
    const applyFallbackFlag = (value: boolean) => {
      if (ensureCounterRef.current !== ensureId) return;
      setFallbackActive(value);
    };
    setWorkspace(null);

    const commit = (value: WorkspaceKeys | null) => {
      if (ensureCounterRef.current !== ensureId) return;
      currentKeyRef.current = value
        ? `${value.publicHex}#${value.privateHex}`
        : null;
      workspaceRef.current = value;
      setWorkspace(value);
    };

    const [rawPub, rawPriv = ""] = routeKey.split("#");
    const candidatePub = rawPub?.trim().toLowerCase() ?? "";
    const candidatePriv = rawPriv.trim().toLowerCase();
    const hexPattern = /^[0-9a-f]+$/i;

    const useResolvedWorkspace = (value: WorkspaceKeys | null) => {
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
      commit(value);
    };

    const cryptoModule = await loadCryptoModule();
    if (!cryptoModule.hasSubtleCrypto()) {
      // TODO: REVIEW [Fallback to static workspace keys when WebCrypto is unavailable]
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
          useResolvedWorkspace({ publicHex, privateHex });
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
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn("Load last workspace failed:", error);
    }

    try {
      const generated = await cryptoModule.generatePairAndUrl();
      applyFallbackFlag(false);
      useResolvedWorkspace({
        publicHex: generated.publicHex,
        privateHex: generated.privateHex,
      });
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
    />
  );
}

type Todo = { $cid: string; text: string; status: TodoStatus };

type NewTodoInputProps = {
  inputRef: React.RefObject<HTMLInputElement>;
  value: string;
  detached: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
};

function NewTodoInput({
  inputRef,
  value,
  detached,
  onChange,
  onSubmit,
}: NewTodoInputProps) {
  const { state, actions, ref } = useAppSelection();

  const isSelected = state.type === "create";

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    if (detached) {
      if (typeof document !== "undefined" && document.activeElement === input) {
        input.blur();
      }
      return;
    }
    if (state.type === "create" && state.mode === "editing") {
      if (typeof document !== "undefined" && document.activeElement !== input) {
        input.focus();
        input.select();
      }
    } else if (
      typeof document !== "undefined" &&
      document.activeElement === input
    ) {
      input.blur();
    }
  }, [state, detached, inputRef]);

  const handleBlur = useCallback(() => {
    const current = ref.current;
    if (current.type === "create" && current.mode === "editing") {
      actions.exitEditing();
    }
  }, [actions, ref]);

  const className = `todo-input${isSelected ? " is-selected" : ""}`;

  return (
    <input
      className={className}
      ref={inputRef}
      style={{ fontSize: 15 }}
      placeholder="Add a todo..."
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onFocus={() => actions.focusCreateEditing()}
      onBlur={handleBlur}
      onKeyDown={(event) => {
        const nativeEvent = event.nativeEvent;
        const isComposing = nativeEvent.isComposing;
        const isIMEKeyCode =
          (nativeEvent as unknown as { keyCode?: number })?.keyCode === 229;
        if (event.key === "Enter" && !isComposing && !isIMEKeyCode) {
          event.preventDefault();
          onSubmit();
        }
      }}
      disabled={detached}
    />
  );
}

type TodoItemRowProps = {
  todo: Todo;
  onTextChange: (cid: string, value: string) => void;
  onDoneChange: (cid: string, done: boolean) => void;
  onDelete: (cid: string) => void;
  dragging: boolean;
  onManualPointerDown?: (
    cid: string,
    e: React.PointerEvent<HTMLLIElement>,
  ) => void;
  onManualPointerMove?: (
    cid: string,
    e: React.PointerEvent<HTMLLIElement>,
  ) => void;
  onManualPointerUp?: (
    cid: string,
    e: React.PointerEvent<HTMLLIElement>,
  ) => void;
  onManualPointerCancel?: (
    cid: string,
    e: React.PointerEvent<HTMLLIElement>,
  ) => void;
  detached: boolean;
  onHeightChange?: (cid: string, height: number) => void;
  onRowRefChange?: (cid: string, element: HTMLLIElement | null) => void;
  style?: React.CSSProperties;
};

function TodoItemRow({
  todo,
  onTextChange,
  onDoneChange,
  onDelete,
  dragging,
  onManualPointerDown,
  onManualPointerMove,
  onManualPointerUp,
  onManualPointerCancel,
  detached,
  onHeightChange,
  onRowRefChange,
  style,
}: TodoItemRowProps) {
  const inputRef = React.useRef<HTMLDivElement | null>(null);
  const rowRef = React.useRef<HTMLLIElement | null>(null);
  const touchSkipChangeRef = React.useRef<boolean>(false);
  const [localText, setLocalText] = React.useState<string>(todo.text);
  const sanitizeSingleLine = React.useCallback((s: string): string => {
    return s.replace(/\r/g, "").replace(/\n/g, " ");
  }, []);

  const {
    state: selectionState,
    actions: selectionActions,
    remotePeers,
    remotePeerColors,
  } =
    useAppSelection();
  const isSelected =
    selectionState.type === "item" && selectionState.cid === todo.$cid;
  const isEditing = isSelected && selectionState.mode === "editing";

  const remoteSelectors = React.useMemo(
    () =>
      Object.entries(remotePeers).filter(([, selection]) => {
        return selection.cid === todo.$cid;
      }),
    [remotePeers, todo.$cid],
  );

  // TODO: REVIEW [confirm collaborator dot placement beside the checkbox feels aligned in dense lists]
  const remoteSelectorDots = React.useMemo(
    () =>
      remoteSelectors.map(([peerId]) => {
        const color = remotePeerColors[peerId] ?? getCollaboratorColorForId(peerId);
        return (
          <span
            key={peerId}
            className="todo-collab-dot"
            style={{ backgroundColor: color }}
          />
        );
      }),
    [remoteSelectors, remotePeerColors],
  );

  const handleEditorChange = React.useCallback(
    (next: string, shouldCommit: boolean) => {
      const sanitized = sanitizeSingleLine(next);
      setLocalText(sanitized);
      if (shouldCommit) {
        onTextChange(todo.$cid, sanitized);
      }
    },
    [onTextChange, sanitizeSingleLine, todo.$cid],
  );

  React.useEffect(() => {
    const el = inputRef.current;
    const isFocused =
      typeof document !== "undefined" && el
        ? document.activeElement === el
        : false;
    if (!isFocused) {
      setLocalText(sanitizeSingleLine(todo.text));
    }
  }, [sanitizeSingleLine, todo.text]);

  const isDone = todo.status === "done";

  React.useLayoutEffect(() => {
    const el = rowRef.current;
    if (!el || !onHeightChange) return;
    const report = () => onHeightChange(todo.$cid, el.offsetHeight);
    report();
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => report());
      ro.observe(el);
    }
    return () => {
      if (ro) ro.disconnect();
    };
  }, [onHeightChange, todo.$cid, localText, isDone]);

  React.useEffect(() => {
    onRowRefChange?.(todo.$cid, rowRef.current);
    return () => onRowRefChange?.(todo.$cid, null);
  }, [onRowRefChange, todo.$cid]);

  const focusItemPreview = React.useCallback(() => {
    selectionActions.focusItemPreview(todo.$cid);
  }, [selectionActions, todo.$cid]);

  const focusItemEditing = React.useCallback(() => {
    selectionActions.focusItemEditing(todo.$cid);
    const el = inputRef.current;
    if (el && typeof document !== "undefined") {
      window.requestAnimationFrame(() => {
        const text = el.textContent ?? "";
        const length = text.length;
        const sel = window.getSelection();
        if (!sel) return;
        const range = document.createRange();
        if (el.firstChild) {
          range.setStart(
            el.firstChild,
            Math.min(length, el.firstChild.textContent?.length ?? 0),
          );
          range.setEnd(
            el.firstChild,
            Math.min(length, el.firstChild.textContent?.length ?? 0),
          );
        } else {
          range.setStart(el, 0);
          range.setEnd(el, 0);
        }
        sel.removeAllRanges();
        sel.addRange(range);
      });
    }
  }, [selectionActions, todo.$cid]);

  const className = `todo-item card${isDone ? " done" : ""}${
    dragging ? " dragging" : ""
  }${isSelected ? " selected" : ""}${isEditing ? " editing" : ""}`;

  return (
    <li
      className={className}
      ref={rowRef}
      data-cid={todo.$cid}
      style={style}
      onPointerDown={(e) => {
        const target = e.target as HTMLElement | null;
        if (target?.closest(".todo-checkbox")) {
          return;
        }
        if (!detached && !target?.closest(".todo-text")) {
          focusItemPreview();
        }
        onManualPointerDown?.(todo.$cid, e);
      }}
      onPointerMove={(e) => {
        if ((e.target as HTMLElement | null)?.closest(".todo-checkbox")) {
          return;
        }
        onManualPointerMove?.(todo.$cid, e);
      }}
      onPointerUp={(e) => {
        if ((e.target as HTMLElement | null)?.closest(".todo-checkbox")) {
          return;
        }
        onManualPointerUp?.(todo.$cid, e);
      }}
      onPointerCancel={(e) => {
        if ((e.target as HTMLElement | null)?.closest(".todo-checkbox")) {
          return;
        }
        onManualPointerCancel?.(todo.$cid, e);
      }}
    >
      <button
        className="drag-handle"
        draggable={false}
        aria-label="Drag to reorder"
        title="Drag to reorder"
      >
        ☰
      </button>
      {remoteSelectorDots.length > 0 && (
        <span className="todo-collab-dots" aria-hidden>
          {remoteSelectorDots}
        </span>
      )}
      <div
        aria-checked={isDone}
        aria-label={isDone ? "Mark as todo" : "Mark as done"}
        tabIndex={detached ? -1 : 0}
        className={`todo-checkbox${isDone ? " checked" : ""}${detached ? " disabled" : ""}`}
        onPointerUp={(e) => {
          if (detached) return;
          if (e.pointerType === "touch") {
            touchSkipChangeRef.current = true;
            onDoneChange(todo.$cid, !isDone);
            e.preventDefault();
            e.stopPropagation();
          }
        }}
        onPointerCancel={(e) => {
          if (e.pointerType === "touch") {
            touchSkipChangeRef.current = false;
          }
        }}
        onClick={() => {
          if (detached) return;
          if (touchSkipChangeRef.current) {
            touchSkipChangeRef.current = false;
            return;
          }
          onDoneChange(todo.$cid, !isDone);
        }}
      />
      <TodoTextInput
        ref={inputRef}
        value={localText}
        detached={detached}
        selectionActive={isSelected}
        selectionEditing={isEditing}
        sanitize={sanitizeSingleLine}
        onChange={handleEditorChange}
        onRequestEditing={focusItemEditing}
        onRequestPreview={focusItemPreview}
      />
      <button
        className="delete-btn"
        onClick={() => onDelete(todo.$cid)}
        aria-label="Delete todo"
        title="Delete"
        disabled={detached}
      >
        <StreamlinePlumpRecycleBin2Remix />
      </button>
    </li>
  );
}
