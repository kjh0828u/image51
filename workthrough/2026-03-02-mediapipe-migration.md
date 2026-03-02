# 배경 제거 엔진 교체 (TensorFlow.js → MediaPipe)

## 개요
기존의 TensorFlow.js(BodyPix, DeepLab) 기반 배경 제거 로직을 제거하고, 더 가볍고 성능이 뛰어난 MediaPipe Selfie Segmentation으로 교체하였습니다. 관련 UI 컴포넌트와 전역 상태(Zustand)도 함께 업데이트되었습니다.

## 변경 사항

### 1. 전역 상태 업데이트 (`src/store/useAppStore.ts`)
- `bgRemovalModel` 옵션을 삭제하고 `mediaPipeModel` ('selfie' | 'landscape') 옵션을 추가했습니다.
- 프리셋 저장 및 불러오기 시 해당 옵션이 포함되도록 수정했습니다.

### 2. 이미지 처리 파이프라인 교체 (`src/lib/imageProcessor.ts`)
- TensorFlow.js 라이브러리 로딩 및 모델(BodyPix, DeepLab) 관련 코드를 모두 제거했습니다.
- MediaPipe Selfie Segmentation 라이브러리를 CDN에서 동적으로 로드하는 로직을 추가했습니다.
- `applyBgRemoval` 함수를 MediaPipe API를 사용하도록 재작성했습니다.

### 3. UI 컴포넌트 교체
- `src/components/DeepLabBgRemovalOptionsCard.tsx` 파일을 삭제했습니다.
- `src/components/MediaPipeBgRemovalOptionsCard.tsx` 파일을 새로 생성하여 MediaPipe 모델 선택 UI를 구현했습니다.
- `src/components/index.ts`에서 새로운 컴포넌트를 내보내도록 수정했습니다.
- `src/app/page.tsx`에서 기존 카드를 새로운 MediaPipe 카드로 교체했습니다.

### 4. 문서 업데이트 (`CODEBASE.md`)
- 프로젝트 구조 및 이미지 처리 파이프라인 설명에서 TensorFlow 관련 내용을 제거하고 MediaPipe로 갱신했습니다.

## 코드 예시

### MediaPipe 배경 제거 적용 (`src/lib/imageProcessor.ts`)
```typescript
async function applyBgRemoval(blob: Blob, modelType: 'selfie' | 'landscape'): Promise<Blob> {
    const segmenter = await getSelfieSegmentation();
    const imageBitmap = await createImageBitmap(blob);

    segmenter.setOptions({
        modelSelection: modelType === 'selfie' ? 0 : 1,
    });

    return new Promise((resolve, reject) => {
        segmenter.onResults((results: any) => {
            const canvas = document.createElement('canvas');
            canvas.width = results.image.width;
            canvas.height = results.image.height;
            const ctx = canvas.getContext('2d')!;

            ctx.drawImage(results.segmentationMask, 0, 0, canvas.width, canvas.height);
            ctx.globalCompositeOperation = 'source-in';
            ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

            canvasToBlob(canvas, 'image/png').then(resolve).catch(reject);
        });

        segmenter.send({ image: imageBitmap as any }).catch(reject);
    });
}
```

## 확인 결과
- `npm run dev` 환경에서 소스 코드 수정 사항이 자동 반영되었습니다.
- 기존 TensorFlow.js 관련 코드가 완전히 제거되었음을 `grep`으로 확인했습니다.
- UI에서 배경 제거 모델 선택 시 'Selfie'와 'Landscape' 옵션이 정상적으로 표시됩니다.
