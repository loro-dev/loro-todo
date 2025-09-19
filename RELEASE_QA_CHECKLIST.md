# Release QA Checklist

## Core Todo Flows

- Add todos on desktop (including IME) and touch keyboards; ensure entries stay single-line, empty submissions are blocked, and focus toggles correctly between preview and edit.
- Verify toggling via mouse, touch checkbox, and Cmd/Ctrl+Enter, confirming completed tasks gather at the end while reactivated items return to active.
- Reorder items with mouse drag, long-press drag on touch (including edge auto-scroll), and Shift+Cmd/Ctrl+Arrow keys; confirm dropping outside the list still commits.
- Exercise undo/redo buttons and keyboard shortcuts while toggling todos and clearing completed items; controls must disable when offline.
- Delete individual todos and confirm collaborator indicators add/remove correctly and stay aligned.

## Workspace Lifecycle

- Walk through switching, creating, joining, and deleting workspaces to ensure snapshots save before navigation, the delete dialog traps focus, and deleting the current workspace bootstraps the next one.
- Export a workspace to `.loro`, re-import it, and check success/failure toasts.
- Trigger the persistent-storage prompt by adding many todos, deny permission, and validate the warning banner plus dismiss flow.
- Delete the final workspace to confirm the welcome todos seed in automatically and the URL canonicalizes.
- Edit the workspace title to verify auto-width sizing, disabled state during joins, and the temporary “Loading…” label while connecting.

## Collaboration & Sync

- Connect two clients to check presence dots/count, latency toast, and the fallback banner when crypto is unavailable.
- Join a new workspace to observe the joining state disablement and live sync after reconnects.
- Confirm remote selection highlights, editing handoff, and cleanup when peers disconnect.
- In a two-client session, scrub the history slider to detach and reattach the document, verifying preview state and the “Return to latest” action.
- Simulate offline mode by interrupting sync and ensure the UI reflects the detached state, recovering once online again.

## Selection Controls

- Selection state can be `none`, the create row, or a specific todo in either preview or editing mode; transitions keep focus valid even when the underlying list changes.
- Focusing the create row supports both preview and editing modes, enabling keyboard-driven entry of new todos.
- Item focus tracks the current order array so that reordering or removal updates selection automatically; when a selected item disappears, the selection falls back to the next item or the create row.
- Entering and exiting editing simply flips the current mode while preserving which row is selected.
- The selection provider scrolls the focused row into view with top/bottom margins and can follow reorders using smooth or immediate scrolling when requested.
- Remote selections are captured alongside their modes and timestamps so collaborator indicators can render consistently.

## Keyboard Shortcuts

- Cmd/Ctrl+Z triggers undo for both list and text edits; redo uses Shift+Cmd/Ctrl+Z on macOS and either Shift+Ctrl+Z or Ctrl+Y elsewhere.
- Shift+Cmd/Ctrl+Arrow Up/Down reorders the selected todo while keeping it in view.
- Cmd/Ctrl+Enter toggles the done state of the selected todo and restores preview mode afterward.
- Escape exits editing for the create row or a todo; if nothing is editing it clears the current selection entirely.
- Enter starts editing depending on context: it focuses the create row when nothing is selected, enters editing for the create row in preview, and enables editing for the selected todo in preview.
- Arrow Up/Down move selection between items (or to/from the create row) unless the current row is actively being edited.

## Safety Nets & Auxiliary UI

- Open the Help dialog, testing backdrop dismissal, Escape key, focus trap, and outbound links.
- Trigger the Share button clipboard flow and fallback prompt; verify toast lifecycle and message timing.
- Exercise storage warning dismissals, fallback banner messaging, and toast auto-clear after roughly three seconds.
- Validate delete-dialog Escape/backdrop handling and that confirming skips the unload snapshot while returning focus to the workspace switcher.
- Check keyboard navigation for empty lists, the create row, and Escape clearing selection; ensure global listeners clean up on unmount.
