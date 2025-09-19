import type { ReactNode } from "react";

type StorageWarningBannerProps = {
    message: ReactNode;
    onDismiss: () => void;
};

export function StorageWarningBanner({ message, onDismiss }: StorageWarningBannerProps) {
    return (
        <div className="storage-warning" role="alert" aria-live="assertive">
            <span className="storage-warning-message">{message}</span>
            <button
                type="button"
                className="storage-warning-dismiss"
                onClick={onDismiss}
                aria-label="Dismiss storage warning"
            >
                Dismiss
            </button>
        </div>
    );
}
