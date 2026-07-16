# Remove — 원클릭 AI 배경제거(누끼) 웹앱

혼자 쓰기 위한 개인용 AI 배경제거 툴. 이미지를 올리면 버튼을 누를 필요 없이
**즉시** 배경이 제거되고, 항상 **투명 PNG**로 저장됩니다.

## 핵심 특징

- **원클릭**: 드래그&드롭 / 클릭 업로드 / `Ctrl+V` 붙여넣기 → 업로드 즉시 자동 처리
- **속도**: 전체 추론이 **브라우저 안에서** 실행됩니다. 서버로 이미지가 전송되지
  않으므로 네트워크 왕복이 없고, WebGPU가 있으면 자동으로 GPU를 사용합니다
- **정확도**: ISNet 기반 매팅 모델로 머리카락 · 털 · 반투명 · 유리 · 식물 ·
  액세서리까지 자연스럽게 분리
- **비교**: 좌(원본) / 우(결과) 슬라이더로 실시간 비교, 체커보드 배경
- **배치 처리**: 여러 장 동시 업로드 → 동시 처리 → ZIP으로 전체 다운로드
- **원본 파일명 유지**: `apple.jpg` → `apple.png`

## 기술 스택

| 영역 | 사용 기술 |
| --- | --- |
| Frontend | Next.js 15 (App Router) · React 19 · TypeScript · TailwindCSS v4 · shadcn/ui |
| AI 추론 (기본, 클라이언트) | [`@imgly/background-removal`](https://github.com/imgly/background-removal-js) — ISNet 계열 모델을 ONNX Runtime Web으로 브라우저에서 실행 (WebGPU 우선, 미지원 시 WASM/CPU 자동 전환) |
| AI 추론 (보조, 서버) | `@imgly/background-removal-node` — Next.js API Route(`/api/remove-bg`)에서 `onnxruntime-node`로 서버 추론 (배치/자동화용) |
| ZIP | `fflate` (경량, 의존성 최소화) |

### 왜 이 모델인가

RMBG-2.0 / BRIA RMBG-2.0 / BiRefNet은 모두 큰 BiRefNet 계열 아키텍처라 브라우저에서
2~5초 목표를 지키기 어렵습니다. `@imgly/background-removal`이 사용하는 ISNet 계열
모델은 브라우저 실행에 맞게 최적화되어 있어 **정확도 손실을 최소화하면서 속도
목표를 만족**시킬 수 있는 실질적인 선택입니다. (`model: "isnet_fp16"` 기본 사용)

## AI 파이프라인 (정확도 최적화)

업로드된 이미지 하나가 처리되는 순서:

1. **Padding 자동 계산** — 가장자리 픽셀을 복제해 이미지 주변에 여백을 만든 뒤
   추론합니다. 객체가 프레임 경계에 닿아 있어도 잘리지 않도록 하기 위함입니다.
2. **배경 제거 추론** — WebGPU(가능 시) 또는 WASM으로 ISNet 모델 실행
3. **Padding 제거** — 추론에 사용한 여백을 잘라내 원본 크기로 복원
4. **그림자 모드 적용** — 소프트 매트에 남은 그림자의 옅은 알파를 threshold +
   remap으로 정리(기본값) 또는 그대로 유지(원본 그림자 유지 옵션)
5. **Feather(0~2px)** — 알파 채널만 별도로 블러링해 색 번짐 없이 경계를 부드럽게
   (Anti-alias)
6. **자동 Crop(선택)** — 투명 여백을 bounding box 기준으로 제거

## 프로젝트 구조

```
src/
  app/
    page.tsx                 # 메인 페이지 (업로드 → 그리드 → 다운로드)
    layout.tsx                # 전역 레이아웃, Toast/Tooltip Provider
    globals.css                # Tailwind 테마 + 체커보드 유틸리티
    api/remove-bg/route.ts    # 서버 추론 API (Node runtime)
  components/
    UploadZone.tsx             # 드래그&드롭 / 클릭 업로드 영역
    CompareSlider.tsx          # 원본/결과 슬라이더 비교 (체커보드)
    ImageCard.tsx               # 개별 이미지 카드 (진행률, 다운로드, 재시도)
    Toolbar.tsx                  # 배경색/자동크롭/그림자/페더 옵션 + 배치 다운로드
    ErrorBanner.tsx              # 모델/네트워크 오류 배너
    ui/                            # shadcn/ui 컴포넌트
  hooks/
    useBackgroundRemoval.ts    # 모델 로드/캐싱, 처리 큐, 배치 상태 관리
    useDragAndDrop.ts            # 드래그&드롭 훅
    useClipboardPaste.ts          # Ctrl+V 붙여넣기 훅
  lib/
    imageUtils.ts                # padding/crop/feather/그림자/배경합성 캔버스 유틸
    device.ts                     # WebGPU 지원 감지
    zip.ts                          # 배치 ZIP 생성 (fflate)
    types.ts                        # 공용 타입 및 기본 옵션값
```

## 실행 방법

```bash
npm install
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000) 접속. 첫 실행 시
AI 모델(및 WASM 런타임)을 한 번 내려받으며, 이후에는 브라우저 캐시에 저장되어
바로 시작합니다.

프로덕션 빌드:

```bash
npm run build
npm start
```

## 속도 최적화 요약

- 모델은 **세션당 1회만** preload되어 재사용됩니다 (`useBackgroundRemoval.ts`의
  모듈 스코프 싱글턴)
- `@imgly/background-removal`이 내부적으로 **Web Worker**에서 추론을 실행해
  메인 스레드/UI가 블로킹되지 않습니다
- `next.config.ts`에서 `Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy`
  헤더를 설정해 `SharedArrayBuffer`를 활성화, 가능한 환경에서 멀티스레드 WASM 사용
- WebGPU 사용 가능 여부를 세션당 1회만 감지해 캐싱 (`lib/device.ts`)

## 오류 처리

- **모델 로딩 실패 / 네트워크 오류**: 상단 오류 배너로 표시, 닫기 가능
- **지원하지 않는 파일 형식**: 업로드 즉시 토스트로 안내 (jpg/jpeg/png/webp만 허용)
- **개별 이미지 처리 실패**: 카드 내부에 오류 메시지 + "다시 시도" 버튼

## 배포 시 참고

- `@imgly/background-removal`의 모델/WASM 파일은 기본적으로 IMG.LY CDN에서
  제공됩니다. 완전히 오프라인/자체 호스팅하려면 README의 "Custom Asset Serving"
  섹션을 참고해 `publicPath`를 자체 서버로 지정하세요.
- `/api/remove-bg`는 Node.js 런타임에서만 동작합니다(`onnxruntime-node`의 네이티브
  바이너리 의존).
