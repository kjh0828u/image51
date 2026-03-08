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
    hasTransparency,
} from './canvasUtils';

const formatToMime: Record<string, string> = {
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'webp': 'image/webp',
    'svg': 'image/svg+xml'
};

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

    // 3. 포맷 결정
    let mimeType = (file.type || 'image/png');
    if (options.enableCustomFormat) {
        mimeType = formatToMime[options.customFormat] || 'image/png';
    }

    // 4. 투명도 처리 및 배경 합성 (JPEG인 경우)
    const needsBackground = mimeType.includes('jpeg') || mimeType.includes('jpg');
    if (needsBackground) {
        const { canvas: fCanvas, ctx: fCtx } = await getCanvasAndContext(workCanvas);
        fCtx.fillStyle = '#FFFFFF';
        fCtx.fillRect(0, 0, fCanvas.width, fCanvas.height);
        fCtx.drawImage(workCanvas, 0, 0);
        workCanvas = fCanvas;
    }

    // 5. SVG 특수 처리
    if (mimeType === 'image/svg+xml') {
        const dataUrl = workCanvas.toDataURL('image/png');
        const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${workCanvas.width}" height="${workCanvas.height}">
  <image href="${dataUrl}" width="${workCanvas.width}" height="${workCanvas.height}" />
</svg>`;
        const finalBlob = new Blob([svgContent], { type: 'image/svg+xml' });
        return URL.createObjectURL(finalBlob);
    }

    // 6. 압축 및 최종 결과 URL 생성
    let finalBlob = await canvasToBlob(workCanvas, mimeType);
    if (options.enableCompress && !mimeType.includes('svg')) {
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
