/**
 * imageProcessor.ts
 *
 * MediaPipe Selfie Segmentation을 사용하여 이미지 변환을 수행하는 핵심 로직입니다.
 * 배경 제거, 필터링, 이미지 압축, 크기 조절 등의 파이프라인을 관리합니다.
 */
import { AppOptions } from "../store/useAppStore";
import Compressor from 'compressorjs';
import {
    getCanvasAndContext,
    getImageData,
    canvasToBlob,
    applyGrayscale,
    autoCropCanvas,
    resizeCanvas,
} from './canvasUtils';

// MediaPipe Selfie Segmentation 동적 로딩 관련
let selfieSegmentation: any = null;

/**
 * MediaPipe Selfie Segmentation 초기화 및 모델 로드
 */
async function getSelfieSegmentation() {
    if (selfieSegmentation) return selfieSegmentation;

    // MediaPipe 스크립트 로드
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/selfie_segmentation.js';
    await new Promise(resolve => {
        script.onload = resolve;
        document.head.appendChild(script);
    });

    const mpSelfie = (window as any).SelfieSegmentation;
    selfieSegmentation = new mpSelfie({
        locateFile: (file: string) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`;
        }
    });

    return selfieSegmentation;
}

/**
 * MediaPipe를 사용하여 배경 제거
 */
async function applyBgRemoval(blob: Blob, modelType: 'general' | 'landscape'): Promise<Blob> {
    const segmenter = await getSelfieSegmentation();
    const imageBitmap = await createImageBitmap(blob);

    // 모델 옵션 설정 (0: general, 1: landscape)
    segmenter.setOptions({
        modelSelection: modelType === 'general' ? 0 : 1,
    });

    // 결과를 담을 프로미스 생성
    return new Promise((resolve, reject) => {
        // 결과 처리 콜백
        segmenter.onResults((results: any) => {
            const canvas = document.createElement('canvas');
            canvas.width = results.image.width;
            canvas.height = results.image.height;
            const ctx = canvas.getContext('2d')!;

            // 1. 마스크 그리기
            ctx.drawImage(results.segmentationMask, 0, 0, canvas.width, canvas.height);

            // 2. 소스 이미지를 합성
            ctx.globalCompositeOperation = 'source-in';
            ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

            // 결과 Blob 생성
            canvasToBlob(canvas, 'image/png').then(resolve).catch(reject);
        });

        // 처리 실행
        segmenter.send({ image: imageBitmap as any })
            .catch((err: any) => reject(err));
    });
}

/**
 * [이미지 처리 통합 파이프라인]
 * 사용자가 선택한 옵션들을 순차적으로 적용하여 최종 변환된 이미지의 결과 URL을 반환합니다.
 */
export async function processImage(file: File, options: AppOptions): Promise<string> {
    let currentBlob: Blob = file;

    // 1. 배경 제거 (MediaPipe) - 선택 시
    if (options.enableBgRemoval) {
        currentBlob = await applyBgRemoval(currentBlob, options.mediaPipeModel);
    }

    const origBmp = await createImageBitmap(currentBlob);
    const { canvas, ctx } = await getCanvasAndContext(origBmp);
    const imgData = getImageData(canvas, ctx);
    const data = imgData.data;

    // 2. 그레이스케일 처리
    if (options.enableGrayscale && options.grayscale > 0) {
        applyGrayscale(data, options.grayscale / 100);
        ctx.putImageData(imgData, 0, 0);
    }

    // 3. 자동 크롭 및 리사이징
    let workCanvas = canvas;
    if (options.enableAutoCrop) {
        workCanvas = autoCropCanvas(workCanvas, options.autoCropMargin);
    }
    if (options.enableResize) {
        workCanvas = resizeCanvas(workCanvas, options.resizeWidth, options.resizeHeight, options.keepRatio);
    }

    // 4. PNG/JPEG 포맷 처리
    let mimeType = options.enableBgRemoval ? 'image/png' : (file.type || 'image/png');
    if (mimeType.includes('jpeg') || mimeType.includes('jpg')) {
        const { canvas: fCanvas, ctx: fCtx } = await getCanvasAndContext(workCanvas);
        fCtx.fillStyle = '#FFFFFF';
        fCtx.fillRect(0, 0, fCanvas.width, fCanvas.height);
        fCtx.drawImage(workCanvas, 0, 0);
        workCanvas = fCanvas;
    }

    // 5. 압축 및 최종 결과 URL 생성
    let finalBlob = await canvasToBlob(workCanvas, mimeType);
    if (options.enableCompress) {
        finalBlob = await new Promise<Blob>((resolve) => {
            new Compressor(finalBlob, {
                quality: options.quality / 100,
                mimeType,
                strict: true,
                checkOrientation: false,
                success: resolve,
                error: () => resolve(finalBlob)
            });
        });
    }

    return URL.createObjectURL(finalBlob);
}

