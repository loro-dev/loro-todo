import { useEffect, useRef } from "react";
import type { LoroWebsocketClient } from "loro-websocket";
import {
    useAppSelection,
    type RemoteSelectionMap,
} from "./selection";
import {
    createSelectionSyncSession,
    type SelectionSyncSession,
} from "./state/selectionSync";

type SelectionSyncBridgeProps = {
    client: LoroWebsocketClient | null;
    docPeerId: string;
};

export function SelectionSyncBridge({
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
                        session.updateLocalSelection({
                            cid: current.cid,
                            mode: current.mode,
                        });
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
