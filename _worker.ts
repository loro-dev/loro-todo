interface AssetFetcher {
    fetch(request: Request): Promise<Response>;
}

interface Env {
    ASSETS: AssetFetcher;
}

const WASM_CONTENT_TYPE = "application/wasm";
const BROTLI_TOKEN = "br";

function acceptsBrotli(headerValue: string | null): boolean {
    if (!headerValue) {
        return false;
    }

    return headerValue
        .split(",")
        .map((part) => {
            const [encoding] = part.split(";");
            return encoding.trim().toLowerCase();
        })
        .includes(BROTLI_TOKEN);
}

function appendVaryHeader(current: string | null, value: string): string {
    if (!current) {
        return value;
    }

    const tokens = new Set(
        current
            .split(",")
            .map((token) => token.trim())
            .filter(Boolean),
    );
    tokens.add(value);

    return Array.from(tokens).join(", ");
}

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);
        const method = request.method;
        const isWasmAsset = url.pathname.endsWith(".wasm");
        const supportsBrotli = acceptsBrotli(request.headers.get("Accept-Encoding"));
        const isRangeRequest = request.headers.has("Range");
        const eligibleMethod = method === "GET" || method === "HEAD";

        if (isWasmAsset && supportsBrotli && eligibleMethod && !isRangeRequest) {
            const brotliUrl = new URL(`${url.pathname}.br${url.search}`, request.url);
            const brotliRequest = new Request(brotliUrl.toString(), request);
            const brotliResponse = await env.ASSETS.fetch(brotliRequest);

            if (brotliResponse.ok) {
                const headers = new Headers(brotliResponse.headers);
                headers.set("Content-Encoding", BROTLI_TOKEN);
                headers.set("Content-Type", WASM_CONTENT_TYPE);
                headers.set("Vary", appendVaryHeader(headers.get("Vary"), "Accept-Encoding"));
                headers.delete("Content-Length");
                // TODO: REVIEW confirm whether additional wasm MIME variants are needed for other build outputs.

                return new Response(brotliResponse.body, {
                    status: brotliResponse.status,
                    statusText: brotliResponse.statusText,
                    headers,
                });
            }
        }

        return env.ASSETS.fetch(request);
    },
};
