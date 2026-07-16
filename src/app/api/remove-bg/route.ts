import { NextRequest, NextResponse } from "next/server";
import { removeBackground } from "@imgly/background-removal-node";

export const runtime = "nodejs";
export const maxDuration = 60;

const ACCEPTED_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

/**
 * Server-side inference fallback for batch jobs or clients without WebGPU/WASM
 * support. Runs the same ISNet matting model via onnxruntime-node (CPU
 * execution provider — the browser path is the GPU-accelerated default).
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "이미지 파일이 필요합니다." },
        { status: 400 },
      );
    }

    if (!ACCEPTED_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: `지원하지 않는 파일 형식입니다: ${file.type}` },
        { status: 415 },
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const resultBlob = await removeBackground(
      new Blob([arrayBuffer], { type: file.type }),
      {
        model: "medium",
        output: { format: "image/png", quality: 1 },
      },
    );

    const resultBuffer = Buffer.from(await resultBlob.arrayBuffer());

    return new NextResponse(resultBuffer, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[remove-bg] inference failed:", err);
    const message =
      err instanceof Error ? err.message : "배경 제거 처리 중 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
