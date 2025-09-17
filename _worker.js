const WASM_CONTENT_TYPE = "application/wasm";
const BROTLI_TOKEN = "br";
const SPA_FALLBACK_PATH = "/index.html";

function acceptsBrotli(headerValue) {
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

function appendVaryHeader(current, value) {
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

function acceptsHtml(headerValue) {
  if (!headerValue) {
    return true;
  }

  return headerValue
    .toLowerCase()
    .split(",")
    .some((entry) => entry.includes("text/html") || entry.includes("*/*"));
}

function hasFileExtension(pathname) {
  const lastSegment = pathname.split("/").pop();
  if (!lastSegment) {
    return false;
  }

  return lastSegment.includes(".");
}

function shouldServeSpaFallback(pathname) {
  if (pathname === "/") {
    return false;
  }

  if (pathname.startsWith("/_")) {
    return false;
  }

  if (pathname.startsWith("/cdn-cgi/")) {
    return false;
  }

  return !hasFileExtension(pathname);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const method = request.method;
    const isWasmAsset = url.pathname.endsWith(".wasm");
    const supportsBrotli = acceptsBrotli(
      request.headers.get("Accept-Encoding"),
    );
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
        headers.set(
          "Vary",
          appendVaryHeader(headers.get("Vary"), "Accept-Encoding"),
        );
        headers.delete("Content-Length");
        return new Response(brotliResponse.body, {
          status: brotliResponse.status,
          statusText: brotliResponse.statusText,
          headers,
        });
      }
    }

    const assetResponse = await env.ASSETS.fetch(request);

    if (
      assetResponse.status === 404 &&
      eligibleMethod &&
      acceptsHtml(request.headers.get("Accept")) &&
      shouldServeSpaFallback(url.pathname)
    ) {
      const fallbackUrl = new URL(SPA_FALLBACK_PATH, request.url);
      const fallbackRequest = new Request(fallbackUrl.toString(), request);
      const fallbackResponse = await env.ASSETS.fetch(fallbackRequest);

      if (fallbackResponse.ok) {
        const headers = new Headers(fallbackResponse.headers);
        headers.set("Vary", appendVaryHeader(headers.get("Vary"), "Accept"));

        return new Response(fallbackResponse.body, {
          status: fallbackResponse.status,
          statusText: fallbackResponse.statusText,
          headers,
        });
      }
    }

    return assetResponse;
  },
};
