import type { RefObject } from "react";
import {
  LucideUsers,
  LucideWifiOff,
  LucideCode2,
  LucideGithub,
} from "../icons";

type HelpDialogProps = {
  open: boolean;
  onClose: () => void;
  dialogRef: RefObject<HTMLDivElement>;
};

type DeleteWorkspaceDialogProps = {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  dialogRef: RefObject<HTMLDivElement>;
};

export function HelpDialog({ open, onClose, dialogRef }: HelpDialogProps) {
  if (!open) return null;

  return (
    <div className="help-backdrop" role="presentation" onClick={onClose}>
      <section
        id="loro-help-panel"
        ref={dialogRef}
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
            onClick={onClose}
            aria-label="Close help dialog"
            title="Close"
          >
            Close
          </button>
        </header>
        <p className="help-lead">
          This example to-do app is powered by Loro. It stays local-first and
          account-free, keeping your edits in this browser while mirroring them
          through Loro&apos;s relay for seven days so everyone stays in sync.
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
              <p>Keep working offline; Loro merges edits when you reconnect.</p>
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
                Developers can ship collaborative apps like this with the same
                toolkit.
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
  );
}

export function DeleteWorkspaceDialog({
  open,
  onCancel,
  onConfirm,
  dialogRef,
}: DeleteWorkspaceDialogProps) {
  if (!open) return null;

  return (
    <div className="confirm-backdrop" role="presentation" onClick={onCancel}>
      <section
        className="card delete-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-dialog-title"
        aria-describedby="delete-dialog-body"
        tabIndex={-1}
        ref={dialogRef}
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <h2 id="delete-dialog-title">Delete list?</h2>
        {/* TODO: REVIEW [Ensure delete confirmation copy matches product tone] */}
        <p id="delete-dialog-body">
          Deleting only removes this list’s local data. It stays in the cloud
          for 7 days and you can re-add it with the invite URL.
        </p>
        <p className="delete-dialog-note">
          Lose the URL and it cannot be recovered.
        </p>
        <div className="delete-dialog-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onCancel}
          >
            Keep list
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => {
              onConfirm();
            }}
          >
            Delete list
          </button>
        </div>
      </section>
    </div>
  );
}
