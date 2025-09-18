export const COLLABORATOR_COLORS = [
    "var(--brand)",
    "color-mix(in oklab, var(--brand) 80%, #ffffff)",
    "color-mix(in oklab, var(--brand) 65%, #ffffff)",
    "color-mix(in oklab, var(--brand) 50%, #ffffff)",
    "var(--crimson)",
    "var(--secondary)",
    "var(--burnt)",
    "var(--golden)",
];

export function getCollaboratorColorByIndex(index: number): string {
    if (COLLABORATOR_COLORS.length === 0) {
        return "var(--brand)";
    }
    const idx = ((index % COLLABORATOR_COLORS.length) + COLLABORATOR_COLORS.length) % COLLABORATOR_COLORS.length;
    return COLLABORATOR_COLORS[idx];
}

export function getCollaboratorColorForId(peerId: string): string {
    let hash = 0;
    for (let i = 0; i < peerId.length; i += 1) {
        hash = (hash << 5) - hash + peerId.charCodeAt(i);
        hash |= 0;
    }
    return getCollaboratorColorByIndex(Math.abs(hash));
}
