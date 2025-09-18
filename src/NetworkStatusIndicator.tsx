import React, { useMemo } from "react";
import type { ClientStatusValue } from "loro-websocket";
import { getCollaboratorColorForId } from "./collaboratorColors";

export type NetworkStatusIndicatorProps = {
    connectionStatus: ClientStatusValue;
    presenceCount: number;
    presencePeers: string[];
    latencyMs: number | null;
    onRequestToast: (message: string | null) => void;
    selfPeerId: string;
};

function capitalize(value: string): string {
    if (value.length === 0) return value;
    return value.charAt(0).toUpperCase() + value.slice(1);
}

const MAX_PEER_DOTS = 8;

export function NetworkStatusIndicator({
    connectionStatus,
    presenceCount,
    presencePeers,
    latencyMs,
    onRequestToast,
    selfPeerId,
}: NetworkStatusIndicatorProps) {
    const includesSelf = presenceCount > presencePeers.length;
    const totalCount = includesSelf ? presencePeers.length + 1 : presencePeers.length;

    const dotPeerIds = useMemo(() => {
        const ids = includesSelf
            ? [selfPeerId, ...presencePeers]
            : presencePeers;
        return ids.slice(0, MAX_PEER_DOTS);
    }, [includesSelf, presencePeers, selfPeerId]);

    const dotElements = useMemo(() => {
        if (dotPeerIds.length === 0) {
            return null;
        }
        return dotPeerIds.map((peerId, index) => (
            <span
                key={peerId}
                aria-hidden
                style={{
                    marginLeft: index === 0 ? 0 : -4,
                    color: getCollaboratorColorForId(peerId),
                }}
            >
                ●
            </span>
        ));
    }, [dotPeerIds]);
    const statusDescription = useMemo(() => {
        switch (connectionStatus) {
            case "connected":
                if (includesSelf && totalCount <= 1) {
                    return "connected";
                }
                return `connected · ${totalCount} person${
                    totalCount === 1 ? "" : "s"
                }`;
            case "connecting":
                return "connecting…";
            default:
                return "disconnected";
        }
    }, [connectionStatus, includesSelf, totalCount]);

    const statusLabel = useMemo(() => capitalize(statusDescription), [statusDescription]);

    const latencyDisplay = useMemo(() => {
        if (connectionStatus !== "connected") return null;
        if (latencyMs == null) return "-- ms";
        const rounded = Math.max(0, Math.round(latencyMs));
        return `${rounded} ms`;
    }, [connectionStatus, latencyMs]);

    const statusToastMessage = useMemo(() => {
        if (latencyDisplay) {
            return `${statusLabel} · ${latencyDisplay} latency`;
        }
        return statusLabel;
    }, [latencyDisplay, statusLabel]);

    const statusIndicatorColor = useMemo(() => {
        switch (connectionStatus) {
            case "disconnected":
                return "#c0392b";
            case "connecting":
                return "var(--golden)";
            default:
                return "var(--muted)";
        }
    }, [connectionStatus]);

    const handleActivate = () => {
        onRequestToast(statusToastMessage);
    };

    return (
        <span
            className="status-inline"
            title={statusToastMessage}
            aria-live="polite"
            aria-label={statusToastMessage}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleActivate();
                }
            }}
            onClick={() => {
                handleActivate();
            }}
            style={{
                display: "inline-flex",
                alignItems: "center",
                cursor: "pointer",
                userSelect: "none",
            }}
        >
            {connectionStatus === "connected" ? (
                <span
                    style={{
                        display: "inline-flex",
                        alignItems: "center",
                        marginLeft: 8,
                    }}
                >
                    {dotElements ?? (
                        <span aria-hidden style={{ color: "#29c329" }}>
                            ●
                        </span>
                    )}
                    {(!includesSelf || totalCount > 1) && (
                        <span
                            style={{
                                marginLeft: 6,
                                fontSize: "0.8rem",
                                lineHeight: 1,
                                color: "var(--muted)",
                            }}
                        >
                            {totalCount}
                        </span>
                    )}
                </span>
            ) : (
                <span
                    aria-hidden
                    style={{ color: statusIndicatorColor, marginLeft: 8 }}
                >
                    ○
                </span>
            )}
        </span>
    );
}
