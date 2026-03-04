import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Wand2,
  Eraser,
  Undo2,
  Redo2,
  Crop,
  Sparkles,
  Save,
  Trash2,
  RefreshCcw,
  Palette,
  Maximize2,
  MinusCircle,
  PlusCircle,
  Scissors
} from 'lucide-react';

type Tool = 'erase' | 'restore' | 'wand' | 'crop';

interface BrushEditorProps {
  imageUrl: string;
  onReset: () => void;
}

// ── box blur 기반 선택 영역 부드럽게 처리 ──────────────────
function boxBlur01(sel: Uint8Array, w: number, h: number, r: number): Float32Array {
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

function threshold01ToBinary(a: Float32Array, cutoff: number): Uint8Array {
  const out = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] >= cutoff ? 1 : 0;
  return out;
}

function blurAndThresholdBinary(
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

function expandSelection(sel: Uint8Array, width: number, height: number, amount: number): Uint8Array {
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

function floodFillSelect(
  imageData: ImageData,
  startX: number,
  startY: number,
  tolerance: number
): Uint8Array {
  const { width, height, data } = imageData;
  const selected = new Uint8Array(width * height);

  const idx = (x: number, y: number) => (y * width + x) * 4;
  const startIdx = idx(startX, startY);
  const sr = data[startIdx];
  const sg = data[startIdx + 1];
  const sb = data[startIdx + 2];
  const sa = data[startIdx + 3];

  const colorDiff = (i: number) => {
    const dr = data[i] - sr;
    const dg = data[i + 1] - sg;
    const db = data[i + 2] - sb;
    const da = data[i + 3] - sa;
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
function getAutoCropBounds(canvas: HTMLCanvasElement, margin = 0) {
  const ctx = canvas.getContext('2d')!;
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;

  let minX = width, minY = height, maxX = 0, maxY = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = data[(y * width + x) * 4 + 3];
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

export function BrushEditor({ imageUrl, onReset }: BrushEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const originalRef = useRef<HTMLCanvasElement>(null);
  const maskRef = useRef<HTMLCanvasElement>(null);
  const aiResultRef = useRef<HTMLCanvasElement>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const isPainting = useRef(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  const selectionRef = useRef<Uint8Array | null>(null);
  const baseSelectionRef = useRef<Uint8Array | null>(null);
  const marchingOffset = useRef(0);
  const marchingTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const overlayCache = useRef<ImageData | null>(null);
  const marchingSegs = useRef<number[]>([]);
  const cachedSelKey = useRef<Uint8Array | null>(null);
  const isSliding = useRef(false);

  // 크롭 드래그 상태
  const cropStartRef = useRef<{ x: number; y: number } | null>(null);
  const cropRectRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const [cropRect, setCropRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  const [tool, setTool] = useState<Tool>('wand');
  const [brushSize, setBrushSize] = useState(30);
  const [brushOpacity, setBrushOpacity] = useState(100);
  const [tolerance, setTolerance] = useState(30);
  const [isProcessing, setIsProcessing] = useState(false);
  const [aiDone, setAiDone] = useState(false);
  const [progress, setProgress] = useState(0);
  const [imageSize, setImageSize] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(1);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  const [hasSelection, setHasSelection] = useState(false);
  const [wandExpand, setWandExpand] = useState(0);
  const [wandSmooth, setWandSmooth] = useState(1);
  const [bgPreset, setBgPreset] = useState(0);
  const expandRafRef = useRef<number | null>(null);

  // 배경 채우기 관련
  const [fillColor, setFillColor] = useState('#ffffff');
  const [showFillPanel, setShowFillPanel] = useState(false);

  // 압축 다운로드 관련
  const [showDownloadPanel, setShowDownloadPanel] = useState(false);
  const [downloadFormat, setDownloadFormat] = useState<'png' | 'jpeg' | 'webp'>('png');
  const [downloadQuality, setDownloadQuality] = useState(90);

  // 여백 컷 margin
  const [cropMargin, setCropMargin] = useState(4);

  const undoStack = useRef<ImageData[]>([]);
  const redoStack = useRef<ImageData[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const compositeAndRender = useCallback(() => {
    if (!canvasRef.current || !originalRef.current || !maskRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d')!;
    const w = canvas.width;
    const h = canvas.height;

    // GPU 가속을 이용한 렌더링 (픽셀 루프 제거)
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(originalRef.current, 0, 0);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(maskRef.current, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
  }, []);

  const saveMaskSnapshot = useCallback(() => {
    if (!maskRef.current) return;
    const ctx = maskRef.current.getContext('2d')!;
    const snap = ctx.getImageData(0, 0, maskRef.current.width, maskRef.current.height);
    undoStack.current.push(snap);
    redoStack.current = [];
    setCanUndo(true);
    setCanRedo(false);
  }, []);

  const undo = useCallback(() => {
    if (!maskRef.current || undoStack.current.length === 0) return;
    const ctx = maskRef.current.getContext('2d')!;
    const current = ctx.getImageData(0, 0, maskRef.current.width, maskRef.current.height);
    redoStack.current.push(current);
    const prev = undoStack.current.pop()!;
    ctx.putImageData(prev, 0, 0);
    compositeAndRender();
    setCanUndo(undoStack.current.length > 0);
    setCanRedo(true);
  }, [compositeAndRender]);

  const redo = useCallback(() => {
    if (!maskRef.current || redoStack.current.length === 0) return;
    const ctx = maskRef.current.getContext('2d')!;
    const current = ctx.getImageData(0, 0, maskRef.current.width, maskRef.current.height);
    undoStack.current.push(current);
    const next = redoStack.current.pop()!;
    ctx.putImageData(next, 0, 0);
    compositeAndRender();
    setCanUndo(true);
    setCanRedo(redoStack.current.length > 0);
  }, [compositeAndRender]);

  const drawMarching = useCallback(() => {
    const overlay = overlayRef.current;
    const sel = selectionRef.current;
    if (!overlay || !sel) return;

    const w = overlay.width;
    const h = overlay.height;
    const ctx = overlay.getContext('2d')!;

    if (cachedSelKey.current !== sel) {
      cachedSelKey.current = sel;

      const highlight = new ImageData(w, h);
      const buf = highlight.data;
      for (let i = 0; i < sel.length; i++) {
        if (!sel[i]) continue;
        buf[i * 4] = 100;
        buf[i * 4 + 1] = 180;
        buf[i * 4 + 2] = 255;
        buf[i * 4 + 3] = 60;
      }
      overlayCache.current = highlight;

      const segs: number[] = [];
      const s = (x: number, y: number) =>
        x >= 0 && x < w && y >= 0 && y < h ? sel[y * w + x] : 0;

      for (let cy = 0; cy < h; cy++) {
        for (let cx = 0; cx < w; cx++) {
          const tl = s(cx, cy);
          const tr = s(cx + 1, cy);
          const br = s(cx + 1, cy + 1);
          const bl = s(cx, cy + 1);
          const idx = (tl << 3) | (tr << 2) | (br << 1) | bl;
          if (idx === 0 || idx === 15) continue;

          const tx = cx + 0.5, ty = cy;
          const rx = cx + 1, ry = cy + 0.5;
          const bx = cx + 0.5, by = cy + 1;
          const lx = cx, ly = cy + 0.5;

          switch (idx) {
            case 1: segs.push(bx, by, lx, ly); break;
            case 2: segs.push(rx, ry, bx, by); break;
            case 3: segs.push(rx, ry, lx, ly); break;
            case 4: segs.push(tx, ty, rx, ry); break;
            case 5: segs.push(tx, ty, lx, ly); segs.push(rx, ry, bx, by); break;
            case 6: segs.push(tx, ty, bx, by); break;
            case 7: segs.push(tx, ty, lx, ly); break;
            case 8: segs.push(lx, ly, tx, ty); break;
            case 9: segs.push(bx, by, tx, ty); break;
            case 10: segs.push(lx, ly, bx, by); segs.push(tx, ty, rx, ry); break;
            case 11: segs.push(rx, ry, tx, ty); break;
            case 12: segs.push(lx, ly, rx, ry); break;
            case 13: segs.push(bx, by, rx, ry); break;
            case 14: segs.push(lx, ly, bx, by); break;
          }
        }
      }
      marchingSegs.current = segs;
    }

    ctx.clearRect(0, 0, w, h);
    if (overlayCache.current) ctx.putImageData(overlayCache.current, 0, 0);

    if (isSliding.current) return;

    const segs = marchingSegs.current;
    if (!segs || segs.length === 0) return;

    const t = marchingOffset.current;
    const colors = [
      [168, 85, 247],
      [255, 255, 255],
      [56, 189, 248],
      [236, 72, 153],
      [255, 255, 255],
      [168, 85, 247],
    ];
    const steps = colors.length - 1;
    const pos = t * steps;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const [r1, g1, b1] = colors[idx]!;
    const [r2, g2, b2] = colors[idx + 1]!;
    const r = Math.round(r1 + (r2 - r1) * frac);
    const g = Math.round(g1 + (g2 - g1) * frac);
    const b = Math.round(b1 + (b2 - b1) * frac);

    const drawPath = () => {
      ctx.beginPath();
      for (let i = 0; i < segs.length; i += 4) {
        ctx.moveTo(segs[i]!, segs[i + 1]!);
        ctx.lineTo(segs[i + 2]!, segs[i + 3]!);
      }
      ctx.stroke();
    };

    ctx.save();
    ctx.setLineDash([]);
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    drawPath();
    ctx.lineWidth = 2;
    ctx.strokeStyle = `rgb(${r},${g},${b})`;
    drawPath();
    ctx.restore();
  }, []);

  const startMarching = useCallback(() => {
    if (marchingTimer.current) clearInterval(marchingTimer.current);
    let lastTime = performance.now();

    marchingTimer.current = setInterval(() => {
      const now = performance.now();
      if (!isSliding.current) {
        const dt = (now - lastTime) / 1000;
        marchingOffset.current = (marchingOffset.current + 0.2 * dt) % 1;
        drawMarching();
      }
      lastTime = now;
    }, 40);
  }, [drawMarching]);

  const stopMarching = useCallback(() => {
    if (marchingTimer.current) {
      clearInterval(marchingTimer.current);
      marchingTimer.current = null;
    }
    if (overlayRef.current) {
      overlayRef.current.getContext('2d')!.clearRect(
        0, 0,
        overlayRef.current.width,
        overlayRef.current.height
      );
    }
    selectionRef.current = null;
    baseSelectionRef.current = null;
    overlayCache.current = null;
    marchingSegs.current = [];
    cachedSelKey.current = null;
    isSliding.current = false;
    setHasSelection(false);
  }, []);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      setImageSize({ w, h });

      const containerW = containerRef.current?.clientWidth ?? 800;
      const containerH = containerRef.current?.clientHeight ?? 600;
      setZoom(Math.min((containerW - 40) / w, (containerH - 40) / h, 1));

      [canvasRef, overlayRef, originalRef, maskRef, aiResultRef].forEach((ref) => {
        if (ref.current) {
          ref.current.width = w;
          ref.current.height = h;
        }
      });

      originalRef.current!.getContext('2d')!.drawImage(img, 0, 0);

      const maskCtx = maskRef.current!.getContext('2d')!;
      maskCtx.fillStyle = 'black';
      maskCtx.fillRect(0, 0, w, h);

      aiResultRef.current!.getContext('2d')!.drawImage(img, 0, 0);

      compositeAndRender();
    };
    img.src = imageUrl;

    return () => stopMarching();
  }, [imageUrl, compositeAndRender, stopMarching]);

  const runAI = useCallback(async () => {
    if (!originalRef.current || !maskRef.current || !aiResultRef.current) return;
    saveMaskSnapshot();
    setIsProcessing(true);
    setProgress(0);

    try {
      const { removeBackground } = await import('@imgly/background-removal');
      const blob = await new Promise<Blob>((resolve) =>
        originalRef.current!.toBlob((b) => resolve(b!), 'image/png')
      );
      const resultBlob = await removeBackground(blob, {
        progress: (_key: string, current: number, total: number) => {
          setProgress(Math.round((current / total) * 100));
        },
        output: { format: 'image/png', quality: 1 },
      });

      const resultUrl = URL.createObjectURL(resultBlob);
      const resultImg = new Image();
      resultImg.onload = () => {
        const ctx = aiResultRef.current!.getContext('2d')!;
        ctx.clearRect(0, 0, aiResultRef.current!.width, aiResultRef.current!.height);
        ctx.drawImage(resultImg, 0, 0);

        const aiData = ctx.getImageData(0, 0, aiResultRef.current!.width, aiResultRef.current!.height);
        const maskCtx = maskRef.current!.getContext('2d')!;
        const maskData = maskCtx.getImageData(0, 0, maskRef.current!.width, maskRef.current!.height);

        for (let i = 0; i < aiData.data.length; i += 4) {
          const a = aiData.data[i + 3]!;
          // 알파 마스크 방식으로 저장
          maskData.data[i] = 0;
          maskData.data[i + 1] = 0;
          maskData.data[i + 2] = 0;
          maskData.data[i + 3] = a;
        }
        maskCtx.putImageData(maskData, 0, 0);
        URL.revokeObjectURL(resultUrl);
        compositeAndRender();
        setIsProcessing(false);
        setAiDone(true);
      };
      resultImg.src = resultUrl;
    } catch (err) {
      console.error('배경제거 실패:', err);
      setIsProcessing(false);
    }
  }, [compositeAndRender, saveMaskSnapshot]);

  const getCanvasPos = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0]!.clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0]!.clientY : e.clientY;
    return {
      x: Math.round(((clientX - rect.left) / rect.width) * canvas.width),
      y: Math.round(((clientY - rect.top) / rect.height) * canvas.height),
    };
  }, []);

  const handleWand = useCallback(
    (pos: { x: number; y: number }, additive: boolean) => {
      if (!originalRef.current) return;
      const w = originalRef.current.width;
      const h = originalRef.current.height;

      // 이미지 범위를 벗어난 클릭은 무시
      if (pos.x < 0 || pos.x >= w || pos.y < 0 || pos.y >= h) return;

      const x = Math.max(0, Math.min(w - 1, pos.x));
      const y = Math.max(0, Math.min(h - 1, pos.y));

      const origData = originalRef.current.getContext('2d')!.getImageData(0, 0, w, h);
      const rawSel = floodFillSelect(origData, x, y, tolerance);
      const radius = Math.min(3, Math.floor(wandSmooth / 6));
      const iterations = wandSmooth >= 12 ? 2 : 1;
      const newSel = radius > 0
        ? blurAndThresholdBinary(rawSel, w, h, radius, 0.5, iterations)
        : rawSel;

      let baseSel: Uint8Array;
      if (additive && baseSelectionRef.current) {
        baseSel = new Uint8Array(baseSelectionRef.current.length);
        for (let i = 0; i < baseSel.length; i++) {
          baseSel[i] = baseSelectionRef.current[i]! | newSel[i]!;
        }
      } else {
        baseSel = newSel;
      }

      baseSelectionRef.current = baseSel;
      const expanded = expandSelection(baseSel, w, h, wandExpand + 1);
      selectionRef.current = expanded;

      setHasSelection(true);
      drawMarching();
      startMarching();
    },
    [tolerance, wandExpand, wandSmooth, drawMarching, startMarching]
  );

  const handleExpandChange = useCallback(
    (value: number) => {
      setWandExpand(value);
      if (!baseSelectionRef.current || !originalRef.current) return;
      if (expandRafRef.current !== null) cancelAnimationFrame(expandRafRef.current);

      const w = originalRef.current.width;
      const h = originalRef.current.height;
      const base = baseSelectionRef.current;

      isSliding.current = true;
      const expanded = expandSelection(base, w, h, value + 1);
      selectionRef.current = expanded;
      drawMarching();

      expandRafRef.current = requestAnimationFrame(() => {
        expandRafRef.current = requestAnimationFrame(() => {
          expandRafRef.current = null;
          isSliding.current = false;
          cachedSelKey.current = null;
          drawMarching();
        });
      });
    },
    [drawMarching]
  );

  const applySelectionToMask = useCallback(
    (mode: 'erase' | 'restore') => {
      const sel = selectionRef.current;
      if (!sel || !maskRef.current) return;

      saveMaskSnapshot();
      const maskCtx = maskRef.current.getContext('2d')!;
      const maskData = maskCtx.getImageData(
        0, 0,
        maskRef.current.width,
        maskRef.current.height
      );
      const val = mode === 'erase' ? 0 : 255;

      for (let i = 0; i < sel.length; i++) {
        if (sel[i]) {
          maskData.data[i * 4] = 0;
          maskData.data[i * 4 + 1] = 0;
          maskData.data[i * 4 + 2] = 0;
          maskData.data[i * 4 + 3] = val;
        }
      }
      maskCtx.putImageData(maskData, 0, 0);
      compositeAndRender();
      stopMarching();
    },
    [compositeAndRender, stopMarching, saveMaskSnapshot]
  );

  const paint = useCallback(
    (pos: { x: number; y: number }) => {
      const maskCtx = maskRef.current!.getContext('2d')!;
      const from = lastPos.current ?? pos;

      maskCtx.save();
      // 알파 합성을 통한 고성능 브러싱
      if (tool === 'erase') {
        maskCtx.globalCompositeOperation = 'destination-out';
      } else {
        maskCtx.globalCompositeOperation = 'source-over';
      }

      maskCtx.globalAlpha = brushOpacity / 100;
      maskCtx.strokeStyle = 'black';
      maskCtx.lineWidth = brushSize;
      maskCtx.lineCap = 'round';
      maskCtx.lineJoin = 'round';
      maskCtx.beginPath();
      maskCtx.moveTo(from.x, from.y);
      maskCtx.lineTo(pos.x, pos.y);
      maskCtx.stroke();
      maskCtx.restore();

      lastPos.current = pos;
      compositeAndRender();
    },
    [tool, brushSize, brushOpacity, compositeAndRender]
  );

  // ── 크롭 오버레이 그리기 ──────────────────────────────────
  const drawCropOverlay = useCallback((rect: { x: number; y: number; w: number; h: number } | null) => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext('2d')!;
    const W = overlay.width;
    const H = overlay.height;
    ctx.clearRect(0, 0, W, H);
    if (!rect || rect.w <= 0 || rect.h <= 0) return;

    // 어두운 오버레이 (선택 영역 밖)
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, W, H);
    ctx.clearRect(rect.x, rect.y, rect.w, rect.h);

    // 선택 테두리
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);
    ctx.setLineDash([]);

    // 3x3 그리드 가이드라인
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 3; i++) {
      const gx = rect.x + (rect.w / 3) * i;
      const gy = rect.y + (rect.h / 3) * i;
      ctx.beginPath(); ctx.moveTo(gx, rect.y); ctx.lineTo(gx, rect.y + rect.h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(rect.x, gy); ctx.lineTo(rect.x + rect.w, gy); ctx.stroke();
    }

    // 모서리 핸들
    const hs = 8;
    ctx.fillStyle = 'white';
    const corners = [
      [rect.x, rect.y], [rect.x + rect.w - hs, rect.y],
      [rect.x, rect.y + rect.h - hs], [rect.x + rect.w - hs, rect.y + rect.h - hs],
    ];
    for (const [cx, cy] of corners) ctx.fillRect(cx!, cy!, hs, hs);
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      const pos = getCanvasPos(e);
      if (tool === 'wand') {
        const isCtrl = 'ctrlKey' in e ? e.ctrlKey : false;
        handleWand(pos, isCtrl);
      } else if (tool === 'crop') {
        cropStartRef.current = pos;
        cropRectRef.current = { x: pos.x, y: pos.y, w: 0, h: 0 };
        setCropRect({ x: pos.x, y: pos.y, w: 0, h: 0 });
        drawCropOverlay({ x: pos.x, y: pos.y, w: 0, h: 0 });
        isPainting.current = true;
      } else {
        saveMaskSnapshot();
        isPainting.current = true;
        lastPos.current = pos;
        paint(pos);
      }
    },
    [tool, getCanvasPos, handleWand, paint, saveMaskSnapshot, drawCropOverlay]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      const clientX = 'touches' in e ? e.touches[0]!.clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0]!.clientY : e.clientY;
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      setCursorPos({ x: clientX - rect.left, y: clientY - rect.top });

      if (!isPainting.current) return;

      if (tool === 'crop' && cropStartRef.current) {
        const pos = getCanvasPos(e);
        const start = cropStartRef.current;
        const newRect = {
          x: Math.min(start.x, pos.x),
          y: Math.min(start.y, pos.y),
          w: Math.abs(pos.x - start.x),
          h: Math.abs(pos.y - start.y),
        };
        cropRectRef.current = newRect;
        setCropRect(newRect);
        drawCropOverlay(newRect);
      } else {
        paint(getCanvasPos(e));
      }
    },
    [getCanvasPos, paint, tool, drawCropOverlay]
  );

  const handleMouseUp = useCallback(() => {
    isPainting.current = false;
    lastPos.current = null;
  }, []);

  // ── 크롭 실행 ────────────────────────────────────────────
  const applyCrop = useCallback(() => {
    const rect = cropRectRef.current;
    if (!rect || rect.w < 2 || rect.h < 2) return;
    if (!canvasRef.current || !originalRef.current || !maskRef.current) return;

    const sx = Math.round(rect.x);
    const sy = Math.round(rect.y);
    const sw = Math.round(rect.w);
    const sh = Math.round(rect.h);

    // 원본 크롭
    const origCropped = document.createElement('canvas');
    origCropped.width = sw;
    origCropped.height = sh;
    origCropped.getContext('2d')!.drawImage(originalRef.current, sx, sy, sw, sh, 0, 0, sw, sh);

    // 마스크 크롭
    const maskCropped = document.createElement('canvas');
    maskCropped.width = sw;
    maskCropped.height = sh;
    maskCropped.getContext('2d')!.drawImage(maskRef.current, sx, sy, sw, sh, 0, 0, sw, sh);

    // 모든 캔버스 리사이즈
    [canvasRef, overlayRef, originalRef, maskRef, aiResultRef].forEach((ref) => {
      if (ref.current) { ref.current.width = sw; ref.current.height = sh; }
    });

    originalRef.current.getContext('2d')!.drawImage(origCropped, 0, 0);
    maskRef.current.getContext('2d')!.drawImage(maskCropped, 0, 0);
    aiResultRef.current!.getContext('2d')!.drawImage(origCropped, 0, 0);

    setImageSize({ w: sw, h: sh });
    undoStack.current = [];
    redoStack.current = [];
    setCanUndo(false);
    setCanRedo(false);

    cropRectRef.current = null;
    setCropRect(null);
    overlayRef.current?.getContext('2d')?.clearRect(0, 0, sw, sh);
    setTool('wand');
    compositeAndRender();
  }, [compositeAndRender]);

  const cancelCrop = useCallback(() => {
    cropRectRef.current = null;
    setCropRect(null);
    if (overlayRef.current) {
      overlayRef.current.getContext('2d')!.clearRect(0, 0, overlayRef.current.width, overlayRef.current.height);
    }
    setTool('wand');
  }, []);

  // ── 여백 컷 ──────────────────────────────────────────────
  const autoCrop = useCallback(() => {
    if (!canvasRef.current || !originalRef.current || !maskRef.current) return;
    const bounds = getAutoCropBounds(canvasRef.current, cropMargin);
    if (!bounds) return;

    const { x, y, w, h } = bounds;

    const origCropped = document.createElement('canvas');
    origCropped.width = w;
    origCropped.height = h;
    origCropped.getContext('2d')!.drawImage(originalRef.current, x, y, w, h, 0, 0, w, h);

    const maskCropped = document.createElement('canvas');
    maskCropped.width = w;
    maskCropped.height = h;
    maskCropped.getContext('2d')!.drawImage(maskRef.current, x, y, w, h, 0, 0, w, h);

    [canvasRef, overlayRef, originalRef, maskRef, aiResultRef].forEach((ref) => {
      if (ref.current) { ref.current.width = w; ref.current.height = h; }
    });

    originalRef.current.getContext('2d')!.drawImage(origCropped, 0, 0);
    maskRef.current.getContext('2d')!.drawImage(maskCropped, 0, 0);
    aiResultRef.current!.getContext('2d')!.drawImage(origCropped, 0, 0);

    setImageSize({ w, h });
    undoStack.current = [];
    redoStack.current = [];
    setCanUndo(false);
    setCanRedo(false);
    stopMarching();
    compositeAndRender();
  }, [compositeAndRender, stopMarching, cropMargin]);

  // ── 배경색 채우기 ─────────────────────────────────────────
  const applyFillColor = useCallback(() => {
    if (!canvasRef.current || !originalRef.current || !maskRef.current) return;
    const w = canvasRef.current.width;
    const h = canvasRef.current.height;

    // 결과 이미지(투명 + 피사체) 위에 배경색을 깔아 새 캔버스 생성
    const flat = document.createElement('canvas');
    flat.width = w;
    flat.height = h;
    const fctx = flat.getContext('2d')!;

    // 배경 채우기
    fctx.fillStyle = fillColor;
    fctx.fillRect(0, 0, w, h);

    // 피사체 합성 (현재 canvasRef는 알파 포함)
    fctx.drawImage(canvasRef.current, 0, 0);

    // 원본 및 마스크를 flat으로 교체
    originalRef.current.getContext('2d')!.clearRect(0, 0, w, h);
    originalRef.current.getContext('2d')!.drawImage(flat, 0, 0);

    const maskCtx = maskRef.current.getContext('2d')!;
    maskCtx.fillStyle = 'white';
    maskCtx.fillRect(0, 0, w, h);

    undoStack.current = [];
    redoStack.current = [];
    setCanUndo(false);
    setCanRedo(false);
    setShowFillPanel(false);
    compositeAndRender();
  }, [fillColor, compositeAndRender]);

  const resetMask = useCallback(() => {
    if (!maskRef.current) return;
    saveMaskSnapshot();
    const ctx = maskRef.current.getContext('2d')!;
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, maskRef.current.width, maskRef.current.height);
    compositeAndRender();
    stopMarching();
    setAiDone(false);
  }, [compositeAndRender, stopMarching, saveMaskSnapshot]);

  // ── 다운로드 ──────────────────────────────────────────────
  const download = useCallback(() => {
    if (!canvasRef.current) return;
    if (downloadFormat === 'png') {
      const link = document.createElement('a');
      link.download = 'result.png';
      link.href = canvasRef.current.toDataURL('image/png');
      link.click();
    } else {
      const link = document.createElement('a');
      link.download = `result.${downloadFormat}`;
      link.href = canvasRef.current.toDataURL(`image/${downloadFormat}`, downloadQuality / 100);
      link.click();
    }
    setShowDownloadPanel(false);
  }, [downloadFormat, downloadQuality]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isRangeInput = e.target instanceof HTMLInputElement && (e.target as HTMLInputElement).type === 'range';
      const isTextInput = (e.target instanceof HTMLInputElement && !isRangeInput) || e.target instanceof HTMLTextAreaElement;
      if (isTextInput) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (hasSelection) applySelectionToMask('erase');
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        redo();
      }
      if (e.key === 'Escape') {
        if (tool === 'crop') cancelCrop();
      }
      if (e.key === 'Enter') {
        if (tool === 'crop' && cropRect && cropRect.w > 2) applyCrop();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hasSelection, applySelectionToMask, undo, redo, tool, cancelCrop, applyCrop, cropRect]);

  // 전역 마우스/터치 이동 리스너 (캔버스 밖에서도 작업 유지)
  useEffect(() => {
    const handleGlobalMove = (e: MouseEvent | TouchEvent) => {
      const overlay = overlayRef.current;
      if (!overlay) return;

      const rect = overlay.getBoundingClientRect();
      const clientX = 'touches' in e ? (e as TouchEvent).touches[0]!.clientX : (e as MouseEvent).clientX;
      const clientY = 'touches' in e ? (e as TouchEvent).touches[0]!.clientY : (e as MouseEvent).clientY;

      // 마우스/터치 위치 업데이트 (커서 프리뷰용)
      setCursorPos({ x: clientX - rect.left, y: clientY - rect.top });

      if (isPainting.current) {
        // Prevent scrolling on touch devices while drawing
        if ('touches' in e) {
          e.preventDefault();
        }

        const pos = getCanvasPos(e as any); // getCanvasPos expects React.MouseEvent | React.TouchEvent
        if (tool === 'crop' && cropStartRef.current) {
          const start = cropStartRef.current;
          const newRect = {
            x: Math.min(start.x, pos.x),
            y: Math.min(start.y, pos.y),
            w: Math.abs(pos.x - start.x),
            h: Math.abs(pos.y - start.y),
          };
          cropRectRef.current = newRect;
          setCropRect(newRect);
          drawCropOverlay(newRect);
        } else if (tool === 'erase' || tool === 'restore') {
          paint(pos);
        }
      }
    };

    window.addEventListener('mousemove', handleGlobalMove);
    window.addEventListener('touchmove', handleGlobalMove, { passive: false });
    return () => {
      window.removeEventListener('mousemove', handleGlobalMove);
      window.removeEventListener('touchmove', handleGlobalMove);
    };
  }, [getCanvasPos, paint, tool, drawCropOverlay]);

  // Global mouseup/touchend listener to stop painting if mouse leaves canvas
  useEffect(() => {
    const handleGlobalUp = () => {
      if (isPainting.current) {
        handleMouseUp();
      }
    };
    window.addEventListener('mouseup', handleGlobalUp);
    window.addEventListener('touchend', handleGlobalUp);
    return () => {
      window.removeEventListener('mouseup', handleGlobalUp);
      window.removeEventListener('touchend', handleGlobalUp);
    };
  }, [handleMouseUp]);

  // ── Ctrl+휠 줌 ────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setZoom(z => Math.min(8, Math.max(0.1, parseFloat((z + delta).toFixed(2)))));
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, []);

  const displayWidth = imageSize.w * zoom;
  const displayHeight = imageSize.h * zoom;
  const isBrushTool = tool === 'erase' || tool === 'restore';

  // 배경 프리셋
  const BG_PRESETS = [
    { label: '어두운 체크', swatch: 'bg-swatch-dark-check', style: { backgroundImage: 'linear-gradient(45deg,#1a1a1b 25%,transparent 25%),linear-gradient(-45deg,#1a1a1b 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#1a1a1b 75%),linear-gradient(-45deg,transparent 75%,#1a1a1b 75%)', backgroundSize: '16px 16px', backgroundPosition: '0 0,0 8px,8px -8px,-8px 0', backgroundColor: '#111' } },
    { label: '밝은 체크', swatch: 'bg-swatch-light-check', style: { backgroundImage: 'linear-gradient(45deg,#ccc 25%,transparent 25%),linear-gradient(-45deg,#ccc 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#ccc 75%),linear-gradient(-45deg,transparent 75%,#ccc 75%)', backgroundSize: '16px 16px', backgroundPosition: '0 0,0 8px,8px -8px,-8px 0', backgroundColor: '#fff' } },
    { label: '검정', swatch: 'bg-swatch-black', style: { backgroundImage: 'none', backgroundColor: '#000' } },
    { label: '흰색', swatch: 'bg-swatch-white', style: { backgroundImage: 'none', backgroundColor: '#fff' } },
    { label: '회색', swatch: 'bg-swatch-gray', style: { backgroundImage: 'none', backgroundColor: '#808080' } },
  ] as const;

  return (
    <div className="brush-editor-wrap">
      {/* 상단 툴바 (옵션 바) */}
      <div className="brush-top-bar">
        <button onClick={onReset} className="brush-tool-btn" title="목록으로">
          <ArrowLeft size={20} />
        </button>
        <div className="brush-top-sep" />

        {/* Undo/Redo */}
        <div className="flex items-center gap-1">
          <button onClick={undo} disabled={!canUndo} className="brush-tool-btn" title="되돌리기 (Ctrl+Z)">
            <Undo2 size={18} />
          </button>
          <button onClick={redo} disabled={!canRedo} className="brush-tool-btn" title="다시 실행 (Ctrl+Y)">
            <Redo2 size={18} />
          </button>
        </div>

        <div className="brush-top-sep" />

        {/* AI Background Removal */}
        <button
          onClick={runAI}
          disabled={isProcessing || aiDone}
          className={`brush-btn-action px-4 h-8 flex items-center gap-2 rounded text-xs font-bold ${aiDone ? 'opacity-50' : ''}`}
        >
          <Sparkles size={14} />
          {isProcessing ? `AI 처리 중... ${progress}%` : aiDone ? 'AI 처리 완료' : 'AI 배경 제거'}
        </button>

        <div className="flex-1" />

        {/* Save/Download */}
        <div className="relative">
          <button
            onClick={() => setShowDownloadPanel(!showDownloadPanel)}
            className="brush-btn-restore px-4 h-8 flex items-center gap-2 rounded text-xs font-bold"
          >
            <Save size={14} />
            결과 저장
          </button>

          {showDownloadPanel && (
            <div className="brush-fill-panel" style={{ position: 'absolute', left: 'auto', right: '0', top: '2.5rem', zIndex: 1000 }}>
              <div className="brush-panel-title">포맷 선택</div>
              <div className="flex gap-1 mb-3">
                {(['png', 'jpeg', 'webp'] as const).map(fmt => (
                  <button
                    key={fmt}
                    onClick={() => setDownloadFormat(fmt)}
                    className={`flex-1 h-8 rounded text-[10px] uppercase font-bold ${downloadFormat === fmt ? 'bg-white text-black' : 'bg-[#333] text-[#aaa]'}`}
                  >
                    {fmt}
                  </button>
                ))}
              </div>
              {downloadFormat !== 'png' && (
                <div className="mb-3">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[10px] text-[#888] font-bold">QUALITY</span>
                    <span className="text-[10px] text-indigo-400 font-bold">{downloadQuality}%</span>
                  </div>
                  <input
                    type="range" min={10} max={100} step={5} value={downloadQuality}
                    onChange={(e) => setDownloadQuality(Number(e.target.value))}
                    className="w-full range-slider h-1"
                  />
                </div>
              )}
              <button onClick={download} className="brush-btn-action w-full h-8 rounded text-xs font-bold">
                다운로드 실행
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="brush-editor-layout">
        {/* 좌측 메인 도구바 */}
        <div className="brush-editor-sidebar-left">
          <button
            onClick={() => { cancelCrop(); setTool('wand'); }}
            className={`brush-tool-btn ${tool === 'wand' ? 'brush-tool-btn-active' : ''}`}
            title="마법봉 (스마트 선택)"
          >
            <Wand2 size={20} />
          </button>
          <button
            onClick={() => { stopMarching(); cancelCrop(); setTool('erase'); }}
            className={`brush-tool-btn ${tool === 'erase' ? 'brush-tool-btn-active' : ''}`}
            title="지우개 (배경 삭제)"
          >
            <Eraser size={20} />
          </button>
          <button
            onClick={() => { stopMarching(); cancelCrop(); setTool('restore'); }}
            className={`brush-tool-btn ${tool === 'restore' ? 'brush-tool-btn-active' : ''}`}
            title="복구 브러시"
          >
            <RefreshCcw size={18} />
          </button>
          <button
            onClick={() => { stopMarching(); setTool('crop'); setCropRect(null); cropRectRef.current = null; }}
            className={`brush-tool-btn ${tool === 'crop' ? 'brush-tool-btn-active' : ''}`}
            title="자르기 도구"
          >
            <Crop size={20} />
          </button>

          <div className="w-8 h-[1px] bg-[#333] my-2" />

          <button
            onClick={() => setZoom(z => Math.min(8, z + 0.2))}
            className="brush-tool-btn"
            title="확대"
          >
            <PlusCircle size={18} />
          </button>
          <button
            onClick={() => setZoom(z => Math.max(0.1, z - 0.2))}
            className="brush-tool-btn"
            title="축소"
          >
            <MinusCircle size={18} />
          </button>
          <button
            onClick={() => {
              const containerW = containerRef.current?.clientWidth ?? 800;
              const containerH = containerRef.current?.clientHeight ?? 600;
              setZoom(Math.min((containerW - 40) / imageSize.w, (containerH - 40) / imageSize.h, 1));
            }}
            className="brush-tool-btn"
            title="화면에 맞추기"
          >
            <Maximize2 size={18} />
          </button>
        </div>

        {/* 중앙 캔버스 영역 */}
        <div
          ref={containerRef}
          className="brush-canvas-area"
          onMouseLeave={() => setCursorPos(null)}
          onMouseDown={handleMouseDown}
          onTouchStart={handleMouseDown}
        >
          <div
            className="brush-canvas-frame"
            style={{ width: displayWidth, height: displayHeight, ...BG_PRESETS[bgPreset]!.style }}
          >
            <canvas ref={canvasRef} style={{ width: displayWidth, height: displayHeight, display: 'block' }} />
            <canvas
              ref={overlayRef}
              style={{
                position: 'absolute', top: 0, left: 0,
                width: displayWidth, height: displayHeight,
                cursor: tool === 'wand' ? 'crosshair' : tool === 'crop' ? 'crosshair' : 'none',
                touchAction: 'none',
              }}
            />
            {isBrushTool && cursorPos && (
              <div
                className="brush-cursor-preview"
                style={{
                  width: brushSize * zoom,
                  height: brushSize * zoom,
                  left: cursorPos.x,
                  top: cursorPos.y,
                  borderColor: tool === 'erase' ? '#ef4444' : '#22c55e',
                  backgroundColor: tool === 'erase' ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)',
                }}
              />
            )}
          </div>
        </div>

        {/* 우측 속성 패널 */}
        <div className="brush-editor-sidebar-right">
          {/* 도구별 옵션 */}
          <div className="brush-panel-section">
            <div className="brush-panel-title">
              {tool === 'wand' ? 'WAND PROPERTIES' :
                tool === 'erase' ? 'ERASER PROPERTIES' :
                  tool === 'restore' ? 'RESTORE PROPERTIES' : 'CROP PROPERTIES'}
            </div>

            {tool === 'wand' && (
              <div className="flex flex-col gap-4">
                <div className="brush-input-group">
                  <div className="flex justify-between items-center mb-1">
                    <span className="brush-label">허용치</span>
                    <span className="brush-value">{tolerance}</span>
                  </div>
                  <input
                    type="range" min={5} max={120} value={tolerance}
                    onChange={(e) => setTolerance(Number(e.target.value))}
                    className="range-slider brush-range"
                  />
                </div>
                <div className="brush-input-group">
                  <div className="flex justify-between items-center mb-1">
                    <span className="brush-label">스무딩</span>
                    <span className="brush-value">{wandSmooth}</span>
                  </div>
                  <input
                    type="range" min={0} max={20} step={1} value={wandSmooth}
                    onChange={(e) => setWandSmooth(Number(e.target.value))}
                    className="range-slider brush-range"
                  />
                </div>

                {hasSelection && (
                  <>
                    <div className="brush-input-group">
                      <div className="flex justify-between items-center mb-1">
                        <span className="brush-label">영역 확장/축소</span>
                        <span className={`brush-value ${wandExpand < 0 ? 'text-orange-400' : wandExpand > 0 ? 'text-cyan-400' : ''}`}>
                          {wandExpand > 0 ? `+${wandExpand}` : wandExpand}
                        </span>
                      </div>
                      <input
                        type="range" min={-15} max={15} step={1} value={wandExpand}
                        onChange={(e) => handleExpandChange(Number(e.target.value))}
                        className="range-slider brush-range"
                      />
                    </div>
                    <div className="flex gap-2 mt-2">
                      <button onClick={() => applySelectionToMask('erase')} className="brush-btn-erase flex-1 h-9 rounded text-[11px] font-bold">삭제</button>
                      <button onClick={() => applySelectionToMask('restore')} className="brush-btn-restore flex-1 h-9 rounded text-[11px] font-bold">복구</button>
                    </div>
                    <button onClick={stopMarching} className="brush-btn-ghost h-8 rounded text-[10px] font-bold border border-[#444] mt-1">
                      선택 해제
                    </button>
                  </>
                )}
              </div>
            )}

            {isBrushTool && (
              <div className="flex flex-col gap-4">
                <div className="brush-input-group">
                  <div className="flex justify-between items-center mb-1">
                    <span className="brush-label">브러시 크기</span>
                    <span className="brush-value">{brushSize}px</span>
                  </div>
                  <input
                    type="range" min={5} max={150} value={brushSize}
                    onChange={(e) => setBrushSize(Number(e.target.value))}
                    className="range-slider brush-range"
                  />
                </div>
                <div className="brush-input-group">
                  <div className="flex justify-between items-center mb-1">
                    <span className="brush-label">불투명도</span>
                    <span className="brush-value">{brushOpacity}%</span>
                  </div>
                  <input
                    type="range" min={10} max={100} value={brushOpacity}
                    onChange={(e) => setBrushOpacity(Number(e.target.value))}
                    className="range-slider brush-range"
                  />
                </div>
              </div>
            )}

            {tool === 'crop' && (
              <div className="flex flex-col gap-4">
                {cropRect && cropRect.w > 2 ? (
                  <>
                    <div className="flex justify-between items-center bg-[#1a1a1a] p-3 rounded border border-[#333]">
                      <div className="flex flex-col">
                        <span className="text-[10px] text-[#555] font-bold">DIMENSIONS</span>
                        <span className="text-xs text-[#aaa] font-mono">{Math.round(cropRect.w)} × {Math.round(cropRect.h)}</span>
                      </div>
                      <Scissors size={16} className="text-[#555]" />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={applyCrop} className="brush-btn-action flex-1 h-9 rounded text-[11px] font-bold">크롭 적용</button>
                      <button onClick={cancelCrop} className="brush-btn-ghost flex-1 h-9 rounded text-[11px] font-bold border border-[#444]">취소</button>
                    </div>
                  </>
                ) : (
                  <p className="text-[11px] text-[#666] leading-relaxed">
                    캔버스 위를 드래그하여 자를 영역을 선택하세요.<br />
                    Enter를 누르면 적용됩니다.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* 자동 여백 섹션 */}
          <div className="brush-panel-section">
            <div className="brush-panel-title">AUTO BOUNDS</div>
            <div className="brush-input-group mb-3">
              <div className="flex justify-between items-center mb-1">
                <span className="brush-label">여백 (PADDING)</span>
                <span className="brush-value">{cropMargin}px</span>
              </div>
              <input
                type="range" min={0} max={40} step={1} value={cropMargin}
                onChange={(e) => setCropMargin(Number(e.target.value))}
                className="range-slider brush-range"
              />
            </div>
            <button onClick={autoCrop} className="brush-btn-ghost w-full h-9 flex items-center justify-center gap-2 rounded text-[11px] font-bold border border-[#444] hover:bg-[#333] transition-colors">
              <Sparkles size={14} className="text-indigo-400" />
              자동 여백 제거 실행
            </button>
          </div>

          {/* 배경 설정 */}
          <div className="brush-panel-section">
            <div className="brush-panel-title">BACKGROUND DISPLAY</div>
            <div className="flex flex-wrap gap-2 mb-4">
              {BG_PRESETS.map((p, i) => (
                <button
                  key={i}
                  onClick={() => setBgPreset(i)}
                  className={`w-8 h-8 rounded border-2 transition-all ${bgPreset === i ? 'border-indigo-500 scale-110' : 'border-[#333]'} ${p.swatch}`}
                  title={p.label}
                />
              ))}
            </div>

            <div className="relative">
              <button
                onClick={() => setShowFillPanel(!showFillPanel)}
                className={`w-full h-9 flex items-center justify-center gap-2 rounded text-[11px] font-bold border transition-colors ${showFillPanel ? 'bg-indigo-600 border-indigo-500' : 'border-[#444] hover:bg-[#333]'}`}
              >
                <Palette size={14} />
                배경색 채워넣기
              </button>

              {showFillPanel && (
                <div className="brush-fill-panel" style={{ bottom: '110%', top: 'auto', left: '0', right: '0' }}>
                  <div className="brush-panel-title">색상 선택</div>
                  <div className="flex items-center gap-3 mb-4">
                    <input
                      type="color"
                      value={fillColor}
                      onChange={(e) => setFillColor(e.target.value)}
                      className="w-10 h-10 rounded cursor-pointer bg-transparent border-0"
                    />
                    <span className="font-mono text-xs font-bold" style={{ color: fillColor }}>{fillColor.toUpperCase()}</span>
                  </div>
                  <button onClick={applyFillColor} className="brush-btn-restore w-full h-8 rounded text-[10px] font-bold">
                    현재 색상으로 채우기
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="flex-1" />

          {/* 하단 위험 구역 */}
          <div className="brush-panel-section border-t border-[#333] border-b-0">
            <button
              onClick={resetMask}
              className="w-full h-9 flex items-center justify-center gap-2 rounded text-[11px] font-bold text-red-400 border border-red-900/30 hover:bg-red-950/30 transition-colors"
            >
              <Trash2 size={14} />
              모든 작업 초기화
            </button>
          </div>
        </div>

        {/* 숨겨진 작업용 캔버스 */}
        <canvas ref={originalRef} className="hidden" />
        <canvas ref={maskRef} className="hidden" />
        <canvas ref={aiResultRef} className="hidden" />
      </div>

      {/* 상태바 (포토샵 스타일) */}
      <div className="brush-status-bar">
        <div className="brush-status-dot" />
        <span className="text-[10px] font-bold text-[#888] uppercase tracking-wider">
          {tool === 'crop' ? 'Crop Tool' : tool === 'wand' ? 'Magic Wand' : tool === 'erase' ? 'Eraser' : 'Restore Brush'}
        </span>
        <div className="brush-status-sep" />
        <span className="text-[10px] font-medium text-[#666]">
          {tool === 'wand' ? 'Click to select area. Shift+Click to add.' :
            tool === 'crop' ? 'Drag to define crop area.' : 'Click and drag to edit masks.'}
        </span>
        <div className="flex-1" />
        {imageSize.w > 0 && (
          <span className="text-[10px] font-mono text-[#888]">
            {imageSize.w} × {imageSize.h} PX
          </span>
        )}
        <div className="brush-status-sep" />
        <span className="text-[10px] font-mono text-[#888]">
          {Math.round(zoom * 100)}%
        </span>
      </div>
    </div>
  );
}
