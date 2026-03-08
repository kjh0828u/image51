/**
 * imageProcessor.ts
 *
 * 이미지 변환을 수행하는 핵심 로직입니다.
 * 필터링, 이미지 압축, 크기 조절 등의 파이프라인을 관리합니다.
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

/**
 * [이미지 처리 통합 파이프라인]
 * 사용자가 선택한 옵션들을 순차적으로 적용하여 최종 변환된 이미지의 결과 URL을 반환합니다.
 */
export async function processImage(file: File, options: AppOptions): Promise<string> {
    let currentBlob: Blob = file;

    const origBmp = await createImageBitmap(currentBlob);
    const { canvas, ctx } = await getCanvasAndContext(origBmp);
    const imgData = getImageData(canvas, ctx);
    const data = imgData.data;

    // 1. 그레이스케일 처리
    if (options.enableGrayscale && options.grayscale > 0) {
        applyGrayscale(data, options.grayscale / 100);
        ctx.putImageData(imgData, 0, 0);
    }

    // 2. 자동 크롭 및 리사이징
    let workCanvas = canvas;
    if (options.enableAutoCrop) {
        workCanvas = autoCropCanvas(workCanvas, options.autoCropMargin);
    }
    if (options.enableResize) {
        workCanvas = resizeCanvas(workCanvas, options.resizeWidth, options.resizeHeight, options.keepRatio);
    }

    // 3. PNG/JPEG 포맷 처리
    let mimeType = (file.type || 'image/png');
    if (mimeType.includes('jpeg') || mimeType.includes('jpg')) {
        const { canvas: fCanvas, ctx: fCtx } = await getCanvasAndContext(workCanvas);
        fCtx.fillStyle = '#FFFFFF';
        fCtx.fillRect(0, 0, fCanvas.width, fCanvas.height);
        fCtx.drawImage(workCanvas, 0, 0);
        workCanvas = fCanvas;
    }

    // 4. 압축 및 최종 결과 URL 생성
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
