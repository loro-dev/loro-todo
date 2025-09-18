import React, { useMemo } from "react";
import type { ClientStatusValue } from "loro-websocket";
import { getCollaboratorColorByIndex } from "./collaboratorColors";

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

export function NetworkStatusIndicator({
    connectionStatus,
    presenceCount,
    presencePeers,
    latencyMs,
    onRequestToast,
    selfPeerId,
}: NetworkStatusIndicatorProps) {
    const hasSelf = presenceCount > presencePeers.length;
    const totalCount = hasSelf ? presencePeers.length + 1 : presencePeers.length;
    const statusDescription = useMemo(() => {
        switch (connectionStatus) {
            case "connected":
                if (totalCount <= 0) {
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
    }, [connectionStatus, totalCount]);

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
                    {(() => {
                        const dotPeers = (hasSelf
                            ? [selfPeerId, ...presencePeers]
                            : presencePeers
                        ).slice(0, 8);
                        const dots = dotPeers.map((peerId, index) => (
                            <span
                                key={peerId ?? index}
                                aria-hidden
                                style={{
                                    marginLeft: index === 0 ? 0 : -4,
                                    color:
                                        peerId != null
                                            ? getCollaboratorColorByIndex(index)
                                            : getCollaboratorColorByIndex(index),
                                }}
                            >
                                ●
                            </span>
                        ));
                        const safeDots =
                            dots.length > 0 ? (
                                dots
                            ) : (
                                <span aria-hidden style={{ color: "#29c329" }}>
                                    ●
                                </span>
                            );
                        return (
                            <>
                                {safeDots}
                                {totalCount > 0 && (
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
                            </>
                        );
                    })()}
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
