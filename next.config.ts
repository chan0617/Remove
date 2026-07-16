import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // onnxruntime-node ships a native .node binary; keep it external instead
  // of letting webpack try to bundle it.
  serverExternalPackages: ["onnxruntime-node", "@imgly/background-removal-node"],
  async headers() {
    return [
      {
        // Enables SharedArrayBuffer so the client-side ONNX runtime can use
        // multi-threaded WASM (falls back gracefully without it).
        source: "/:path*",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
        ],
      },
    ];
  },
};

export default nextConfig;
