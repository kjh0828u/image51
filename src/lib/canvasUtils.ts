/**
 * Canvas 관련 유틸리티 함수들
 */

/**
 * Blob이나 ImageBitmap으로부터 캔버스를 생성하고 이미지 데이터를 반환합니다.
 */
export async function getCanvasAndContext(source: Blob | ImageBitmap | HTMLCanvasElement): Promise<{
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D
}> {
    let bmp: ImageBitmap | HTMLCanvasElement;
    if (source instanceof Blob) {
        bmp = await createImageBitmap(source);
    } else {
        bmp = source;
    }

    const canvas = document.createElement("canvas");
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(bmp, 0, 0);
    return { canvas, ctx };
}

/**
 * 캔버스에서 ImageData를 추출합니다.
 */
export function getImageData(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): ImageData {
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/**
 * 캔버스를 Blob으로 변환합니다.
 */
export async function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string = 'image/png', quality: number = 1.0): Promise<Blob> {
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error("Canvas to Blob Failed"));
        }, mimeType, quality);
    });
}

/**
 * 그레이스케일 필터를 적용합니다.
 */
export function applyGrayscale(data: Uint8ClampedArray, factor: number) {
    for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] === 0) continue;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const avg = (r + g + b) / 3;
        data[i] = r * (1 - factor) + avg * factor;
        data[i + 1] = g * (1 - factor) + avg * factor;
        data[i + 2] = b * (1 - factor) + avg * factor;
    }
}

/**
 * 가짜 투명도(체크무늬)를 제거합니다.
 */
export function removeFakeTransparency(data: Uint8ClampedArray, tolerance: number) {
    for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] === 0) continue;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const maxC = Math.max(r, g, b);
        const minC = Math.min(r, g, b);
        const diff = maxC - minC;
        const avg = (r + g + b) / 3;
        if (diff < tolerance && avg > 150) {
            data[i + 3] = 0;
        }
    }
}
