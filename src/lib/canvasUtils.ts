/**
 * canvasUtils.ts
 * 
 * 브라우저 캔버스(Canvas API)를 이용한 이미지 조작 유틸리티 모음입니다.
 * 필터 적용, 크기 조절, 여백 제거 등 픽셀 단위의 연산을 수행합니다.
 */

/**
 * 소스(Blob, Bitmap, Canvas, ImageData)로부터 캔버스와 2D 컨텍스트를 생성합니다.
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
 * 캔버스의 현재 상태에서 ImageData(픽셀 데이터)를 추출합니다.
 */
export function getImageData(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): ImageData {
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/**
 * 캔버스를 지정된 포맷의 Blob 객체로 변환합니다.
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
 * 이미지에 그레이스케일(흑백) 필터를 적용합니다.
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
 * 이미지 내부의 체크무늬 배경(가짜 투명도)을 감지하여 제거합니다.
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
 * 이미지의 투명 여백을 감지하여 자동으로 크롭합니다.
 */
export function autoCropCanvas(canvas: HTMLCanvasElement, margin: number): HTMLCanvasElement {
    const ctx = canvas.getContext('2d')!;
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let minX = canvas.width, minY = canvas.height, maxX = 0, maxY = 0, found = false;

    // 투명하지 않은 픽셀의 경계 계산
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

    // 크롭된 영역을 새 캔버스에 그리기
    const cropCanvas = document.createElement("canvas");
    cropCanvas.width = nW; cropCanvas.height = nH;
    cropCanvas.getContext("2d")!.drawImage(canvas, minX, minY, cW, cH, margin, margin, cW, cH);
    return cropCanvas;
}

/**
 * 이미지를 지정된 크기로 리사이징합니다. 비율 유지가 활성화된 경우 Math.min 비율을 적용합니다.
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
 * 알파 채널에 부드러운 임계값(Soft Threshold)을 적용하여 외곽선을 보정합니다.
 */
export function applyAlphaMatting(data: Uint8ClampedArray, fgT: number, bgT: number) {
    for (let i = 0; i < data.length; i += 4) {
        const a = data[i + 3];
        // fgT 이상은 완전 불투명, bgT 이하는 완전 투명, 그 사이는 보간 적용
        data[i + 3] = a >= fgT ? 255 : (a <= bgT ? 0 : Math.round(((a - bgT) / (fgT - bgT)) * 255));
    }
}

/**
 * 알파 채널 부식(Erosion) 필터를 적용하여 불필요한 외곽선 잔상을 제거합니다.
 */
export function erodeAlpha(data: Uint8ClampedArray, width: number, height: number, size: number) {
    const temp = new Uint8ClampedArray(data);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;
            if (temp[idx + 3] > 0) {
                let minA = 255;
                // 커널 크기만큼 주변 픽셀 마스킹
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
 * 원본 배경 색상과 유사한 픽셀을 찾아 투명하게 만듭니다. 컬러 매칭 및 제거용입니다.
 */
export function removeColorMatch(data: Uint8ClampedArray, originalData: Uint8ClampedArray, tolerance: number) {
    let sumR = 0, sumG = 0, sumB = 0, cnt = 0;

    // 제거된 영역에서 원본 이미지의 평균 배경색을 추출
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
                // 유클리드 거리 기반 컬러 매칭
                if (dR * dR + dG * dG + dB * dB < tolSq) {
                    data[i + 3] = 0;
                }
            }
        }
    }
}

// ── box blur 기반 선택 영역 부드럽게 처리 ──────────────────
export function boxBlur01(sel: Uint8Array, w: number, h: number, r: number): Float32Array {
    const tmp = new Float32Array(w * h);
    const out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
        const row = y * w;
        let sum = 0;
        for (let x = -r; x <= r; x++) {
            const xx = Math.min(w - 1, Math.max(0, x));
            sum += sel[row + xx];
        }
        tmp[row] = sum;
        for (let x = 1; x < w; x++) {
            const addX = Math.min(w - 1, x + r);
            const subX = Math.max(0, x - r - 1);
            sum += sel[row + addX] - sel[row + subX];
            tmp[row + x] = sum;
        }
    }
    const denom = (2 * r + 1) * (2 * r + 1);
    for (let x = 0; x < w; x++) {
        let sum = 0;
        for (let y = -r; y <= r; y++) {
            const yy = Math.min(h - 1, Math.max(0, y));
            sum += tmp[yy * w + x];
        }
        out[x] = sum / denom;
        for (let y = 1; y < h; y++) {
            const addY = Math.min(h - 1, y + r);
            const subY = Math.max(0, y - r - 1);
            sum += tmp[addY * w + x] - tmp[subY * w + x];
            out[y * w + x] = sum / denom;
        }
    }
    return out;
}

export function threshold01ToBinary(a: Float32Array, cutoff: number): Uint8Array {
    const out = new Uint8Array(a.length);
    for (let i = 0; i < a.length; i++) out[i] = a[i] >= cutoff ? 1 : 0;
    return out;
}

export function blurAndThresholdBinary(
    sel: Uint8Array, w: number, h: number,
    radius: number, cutoff = 0.5, iterations = 1
): Uint8Array {
    if (radius <= 0 || iterations <= 0) return sel;
    let cur = sel;
    for (let it = 0; it < iterations; it++) {
        const blurred = boxBlur01(cur, w, h, radius);
        cur = threshold01ToBinary(blurred, cutoff);
    }
    return cur;
}

export function expandSelection(sel: Uint8Array, width: number, height: number, amount: number): Uint8Array {
    if (amount === 0) return sel;
    let current = sel;
    const abs = Math.abs(amount);
    const expand = amount > 0;

    for (let step = 0; step < abs; step++) {
        const next = new Uint8Array(current.length);
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const pos = y * width + x;
                if (expand) {
                    if (
                        current[pos] ||
                        (x > 0 && current[pos - 1]) ||
                        (x < width - 1 && current[pos + 1]) ||
                        (y > 0 && current[pos - width]) ||
                        (y < height - 1 && current[pos + width])
                    ) {
                        next[pos] = 1;
                    }
                } else {
                    if (
                        current[pos] &&
                        (x === 0 || current[pos - 1]) &&
                        (x === width - 1 || current[pos + 1]) &&
                        (y === 0 || current[pos - width]) &&
                        (y === height - 1 || current[pos + width])
                    ) {
                        next[pos] = 1;
                    }
                }
            }
        }
        current = next;
    }
    return current;
}

export function floodFillSelect(
    imageData: ImageData,
    startX: number,
    startY: number,
    tolerance: number
): Uint8Array {
    const { width, height, data } = imageData;
    const selected = new Uint8Array(width * height);

    const idx = (x: number, y: number) => (y * width + x) * 4;
    const startIdx = idx(startX, startY);
    const sr = data[startIdx]!;
    const sg = data[startIdx + 1]!;
    const sb = data[startIdx + 2]!;
    const sa = data[startIdx + 3]!;

    const colorDiff = (i: number) => {
        const dr = data[i]! - sr;
        const dg = data[i + 1]! - sg;
        const db = data[i + 2]! - sb;
        const da = data[i + 3]! - sa;
        return Math.sqrt(dr * dr + dg * dg + db * db + da * da);
    };

    const stack: number[] = [startX + startY * width];
    const visited = new Uint8Array(width * height);
    visited[startX + startY * width] = 1;

    while (stack.length > 0) {
        const pos = stack.pop()!;
        const x = pos % width;
        const y = Math.floor(pos / width);

        if (colorDiff(idx(x, y)) <= tolerance) {
            selected[pos] = 1;

            const neighbors = [
                [x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1],
            ];
            for (const [nx, ny] of neighbors) {
                if (nx! >= 0 && nx! < width && ny! >= 0 && ny! < height) {
                    const npos = nx! + ny! * width;
                    if (!visited[npos]) {
                        visited[npos] = 1;
                        stack.push(npos);
                    }
                }
            }
        }
    }

    return selected;
}

// ── 투명 픽셀 기준 자동 크롭 bounds 계산 ──────────────────
export function getAutoCropBounds(canvas: HTMLCanvasElement, margin = 0) {
    const ctx = canvas.getContext('2d')!;
    const { width, height } = canvas;
    const data = ctx.getImageData(0, 0, width, height).data;

    let minX = width, minY = height, maxX = 0, maxY = 0;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const a = data[(y * width + x) * 4 + 3]!;
            if (a > 10) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
    }

    if (minX > maxX || minY > maxY) return null; // 완전 투명

    return {
        x: Math.max(0, minX - margin),
        y: Math.max(0, minY - margin),
        w: Math.min(width, maxX + 1 + margin) - Math.max(0, minX - margin),
        h: Math.min(height, maxY + 1 + margin) - Math.max(0, minY - margin),
    };
}
