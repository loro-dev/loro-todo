import type { ReactNode } from "react";

type ToastMessageProps = {
    children: ReactNode;
};

export function ToastMessage({ children }: ToastMessageProps) {
    return (
        <div className="toast" role="status" aria-live="polite">
            {children}
        </div>
    );
}
