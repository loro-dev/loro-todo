import { FALLBACK_WORKSPACE_KEYS } from "./constants";

export const AUTH_SALT = "loro-public-sync-server";

function getSubtleCrypto(): SubtleCrypto | null {
    if (typeof globalThis === "undefined") return null;
    const maybeCrypto = (globalThis as typeof globalThis & { crypto?: Crypto }).crypto;
    if (!maybeCrypto) return null;
    return typeof maybeCrypto.subtle === "object" && maybeCrypto.subtle
        ? maybeCrypto.subtle
        : null;
}

function buildShareUrl(publicHex: string, privateHex: string): string {
    if (typeof window === "undefined") {
        return `/${publicHex}#${privateHex}`;
    }
    const origin = window.location.origin || "";
    return origin
        ? `${origin}/${publicHex}#${privateHex}`
        : `/${publicHex}#${privateHex}`;
}

export function hasSubtleCrypto(): boolean {
    return getSubtleCrypto() !== null;
}

export function getFallbackWorkspaceKeys(): {
    publicHex: string;
    privateHex: string;
    share: string;
} {
    const { publicHex, privateHex } = FALLBACK_WORKSPACE_KEYS;
    return {
        publicHex,
        privateHex,
        share: buildShareUrl(publicHex, privateHex),
    };
}

export function bytesToHex(arr: Uint8Array): string {
    let hex = "";
    for (let i = 0; i < arr.length; i++) {
        hex += arr[i].toString(16).padStart(2, "0");
    }
    return hex;
}

export function hexToBytes(hex: string): Uint8Array {
    const clean = hex.trim().toLowerCase();
    if (clean.length % 2 !== 0) throw new Error("Invalid hex length");
    const out = new Uint8Array(clean.length / 2);
    for (let i = 0; i < out.length; i++) {
        const byte = clean.slice(i * 2, i * 2 + 2);
        const value = Number.parseInt(byte, 16);
        if (Number.isNaN(value)) throw new Error("Invalid hex byte");
        out[i] = value;
    }
    return out;
}

export function bytesToBase64Url(bytes: Uint8Array): string {
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    return base64.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

export function base64UrlToBytes(value: string): Uint8Array {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const padLength = base64.length % 4 ? 4 - (base64.length % 4) : 0;
    const padded = base64 + "=".repeat(padLength);
    const binary = atob(padded);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        out[i] = binary.charCodeAt(i);
    }
    return out;
}

export async function exportRawPublicKeyHex(pubKey: CryptoKey): Promise<string> {
    const subtle = getSubtleCrypto();
    if (!subtle) {
        throw new Error("SubtleCrypto is not available");
    }
    const raw = new Uint8Array(await subtle.exportKey("raw", pubKey));
    return bytesToHex(raw);
}

export async function signSaltTokenHex(privateKey: CryptoKey): Promise<string> {
    const subtle = getSubtleCrypto();
    if (!subtle) {
        throw new Error("SubtleCrypto is not available");
    }
    const message = new TextEncoder().encode(AUTH_SALT);
    const signature = new Uint8Array(
        await subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privateKey, message),
    );
    return bytesToHex(signature);
}

export function buildAuthUrl(base: string, workspaceId: string, token: string): string {
    return `${base}/ws/${workspaceId}?token=${token}`;
}

export async function importKeyPairFromHex(
    publicHex: string,
    privateHex: string,
): Promise<{ privateKey: CryptoKey; publicKey: CryptoKey } | null> {
    try {
        const subtle = getSubtleCrypto();
        if (!subtle) {
            return null;
        }
        if (publicHex.length !== 130 || !publicHex.startsWith("04")) {
            return null;
        }
        const publicRaw = hexToBytes(publicHex);
        const x = publicRaw.slice(1, 33);
        const y = publicRaw.slice(33, 65);
        if (privateHex.length !== 64) return null;
        const d = hexToBytes(privateHex);

        const jwkPublic: JsonWebKey = {
            kty: "EC",
            crv: "P-256",
            x: bytesToBase64Url(x),
            y: bytesToBase64Url(y),
            ext: true,
        };
        const jwkPrivate: JsonWebKey = {
            kty: "EC",
            crv: "P-256",
            x: jwkPublic.x,
            y: jwkPublic.y,
            d: bytesToBase64Url(d),
            ext: true,
        };

        const publicKey = await subtle.importKey(
            "jwk",
            jwkPublic,
            { name: "ECDSA", namedCurve: "P-256" },
            true,
            ["verify"],
        );
        const privateKey = await subtle.importKey(
            "jwk",
            jwkPrivate,
            { name: "ECDSA", namedCurve: "P-256" },
            true,
            ["sign"],
        );

        const message = new TextEncoder().encode(AUTH_SALT);
        const signature = await subtle.sign(
            { name: "ECDSA", hash: "SHA-256" },
            privateKey,
            message,
        );
        const verified = await subtle.verify(
            { name: "ECDSA", hash: "SHA-256" },
            publicKey,
            signature,
            message,
        );
        if (!verified) return null;
        return { privateKey, publicKey };
    } catch {
        return null;
    }
}

export async function generatePairAndUrl(): Promise<{
    privateKey: CryptoKey | null;
    publicKey: CryptoKey | null;
    publicHex: string;
    privateHex: string;
    share: string;
}> {
    const subtle = getSubtleCrypto();
    if (!subtle) {
        const fallback = getFallbackWorkspaceKeys();
        return {
            privateKey: null,
            publicKey: null,
            publicHex: fallback.publicHex,
            privateHex: fallback.privateHex,
            share: fallback.share,
        };
    }

    const keyPair = await subtle.generateKey(
        { name: "ECDSA", namedCurve: "P-256" },
        true,
        ["sign", "verify"],
    );
    const publicHex = await exportRawPublicKeyHex(keyPair.publicKey);
    const jwkPrivate = await subtle.exportKey("jwk", keyPair.privateKey);
    const dBytes = base64UrlToBytes(jwkPrivate.d ?? "");
    const privateHex = bytesToHex(dBytes);
    const share = buildShareUrl(publicHex, privateHex);
    return {
        privateKey: keyPair.privateKey,
        publicKey: keyPair.publicKey,
        publicHex,
        privateHex,
        share,
    };
}
