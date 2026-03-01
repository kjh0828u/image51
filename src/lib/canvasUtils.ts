/**
 * Canvas 관련 유틸리티 함수들
 */

/**
 * Blob이나 ImageBitmap으로부터 캔버스를 생성하고 이미지 데이터를 반환합니다.
 */
export async function getCanvasAndContext(source: Blob | ImageBitmap | HTMLCanvasElement | ImageData): Promise<{
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D
}> {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

    if (source instanceof ImageData) {
        canvas.width = source.width;
        canvas.height = source.height;
        ctx.putImageData(source, 0, 0);
    } else {
        let bmp: ImageBitmap | HTMLCanvasElement;
        if (source instanceof Blob) {
            bmp = await createImageBitmap(source);
        } else {
            bmp = source;
        }
        canvas.width = bmp.width;
        canvas.height = bmp.height;
        ctx.drawImage(bmp, 0, 0);
    }

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

/**
 * 이미지의 투명 여백을 자동으로 제거하고 크롭합니다.
 */
export function autoCropCanvas(canvas: HTMLCanvasElement, margin: number): HTMLCanvasElement {
    const ctx = canvas.getContext('2d')!;
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let minX = canvas.width, minY = canvas.height, maxX = 0, maxY = 0, found = false;

    for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
            if (data[(y * canvas.width + x) * 4 + 3] > 0) {
                minX = Math.min(minX, x); maxX = Math.max(maxX, x);
                minY = Math.min(minY, y); maxY = Math.max(maxY, y);
                found = true;
            }
        }
    }

    if (!found) return canvas;

    const cW = maxX - minX + 1, cH = maxY - minY + 1;
    const nW = cW + margin * 2, nH = cH + margin * 2;
    const cropCanvas = document.createElement("canvas");
    cropCanvas.width = nW; cropCanvas.height = nH;
    cropCanvas.getContext("2d")!.drawImage(canvas, minX, minY, cW, cH, margin, margin, cW, cH);
    return cropCanvas;
}

/**
 * 이미지를 지정된 크기로 조절합니다.
 */
export function resizeCanvas(canvas: HTMLCanvasElement, targetW: string, targetH: string, keepRatio: boolean): HTMLCanvasElement {
    let nW = parseInt(targetW, 10) || canvas.width;
    let nH = parseInt(targetH, 10) || canvas.height;

    if (keepRatio) {
        const ratio = Math.min(nW / canvas.width, nH / canvas.height);
        nW = Math.max(1, Math.round(canvas.width * ratio));
        nH = Math.max(1, Math.round(canvas.height * ratio));
    }

    if (nW === canvas.width && nH === canvas.height) return canvas;

    const rCanvas = document.createElement("canvas");
    rCanvas.width = nW; rCanvas.height = nH;
    const rCtx = rCanvas.getContext("2d")!;
    rCtx.imageSmoothingEnabled = true;
    rCtx.imageSmoothingQuality = "high";
    rCtx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, nW, nH);
    return rCanvas;
}

/**
 * 알파 채널에 부드러운 임계값(Matting)을 적용합니다.
 */
export function applyAlphaMatting(data: Uint8ClampedArray, fgT: number, bgT: number) {
    for (let i = 0; i < data.length; i += 4) {
        const a = data[i + 3];
        data[i + 3] = a >= fgT ? 255 : (a <= bgT ? 0 : Math.round(((a - bgT) / (fgT - bgT)) * 255));
    }
}

/**
 * 알파 채널 부식(Erosion) 처리를 수행합니다.
 */
export function erodeAlpha(data: Uint8ClampedArray, width: number, height: number, size: number) {
    const temp = new Uint8ClampedArray(data);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            if (temp[idx + 3] > 0) {
                let minA = 255;
                for (let dy = -size; dy <= size; dy++) {
                    for (let dx = -size; dx <= size; dx++) {
                        const ny = y + dy, nx = x + dx;
                        if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
                            minA = Math.min(minA, temp[(ny * width + nx) * 4 + 3]);
                        } else {
                            minA = 0;
                        }
                    }
                }
                data[idx + 3] = minA;
            }
        }
    }
}

/**
 * 원본 이미지의 배경 색상과 유사한 부분을 찾아 제거합니다.
 */
export function removeColorMatch(data: Uint8ClampedArray, originalData: Uint8ClampedArray, tolerance: number) {
    let sumR = 0, sumG = 0, sumB = 0, cnt = 0;

    // 제거된 영역에서 원본의 평균 배경색을 추출
    for (let i = 0; i < data.length; i += 4) {
        if (originalData[i + 3] > 200 && data[i + 3] < 50) {
            sumR += originalData[i];
            sumG += originalData[i + 1];
            sumB += originalData[i + 2];
            cnt++;
        }
    }

    if (cnt > 0) {
        const avgR = sumR / cnt, avgG = sumG / cnt, avgB = sumB / cnt;
        const tolSq = tolerance ** 2;

        for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3] > 0) {
                const dR = data[i] - avgR;
                const dG = data[i + 1] - avgG;
                const dB = data[i + 2] - avgB;
                if (dR * dR + dG * dG + dB * dB < tolSq) {
                    data[i + 3] = 0;
                }
            }
        }
    }
}
