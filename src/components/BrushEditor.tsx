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
  Scissors,
  AlertCircle,
  Square as SquareIcon,
  Diamond,
  RectangleHorizontal,
  RectangleVertical,
  Minus,
  GripVertical,
  Brush,
  PaintBucket,
  Pipette,
  Layers,
  Activity,
  Sliders,
  Move,
  Type,
  Circle as CircleIcon,
  Stamp,
  LifeBuoy,
  Droplets
} from 'lucide-react';
import {
  blurAndThresholdBinary,
  expandSelection,
  floodFillSelect,
  getAutoCropBounds
} from '../lib/canvasUtils';
import { useBrushConfig, Tool, BrushShape } from './hooks/useBrushConfig';
import { useCanvasCore } from './hooks/useCanvasCore';
import { useHistory } from './hooks/useHistory';
import { useSelectionTools } from './hooks/useSelectionTools';
import { useImageProcessing } from '@/hooks/useImageProcessing';
import { getDownloadFilename } from '@/lib/fileUtils';

interface BrushEditorProps {
  imageUrl: string;
  originalName: string;
  onReset: () => void;
}

const EYEDROPPER_CURSOR = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m2 22 1-1h3l9-9'/%3E%3Cpath d='M3 21v-3l9-9'/%3E%3Cpath d='m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l-3-3Z'/%3E%3C/svg%3E") 0 22, url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m2 22 1-1h3l9-9'/%3E%3Cpath d='M3 21v-3l9-9'/%3E%3Cpath d='m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l-3-3Z'/%3E%3C/svg%3E") 0 22, crosshair`;



export function BrushEditor({ imageUrl, originalName, onReset }: BrushEditorProps) {
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
  const hasStrokeRef = useRef(false);
  const historyListRef = useRef<HTMLDivElement>(null);

  // 크롭 드래그 상태
  const cropStartRef = useRef<{ x: number; y: number } | null>(null);
  const cropRectRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const [cropRect, setCropRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [isDraggingHandle, setIsDraggingHandle] = useState<string | null>(null);
  const cloneSourceRef = useRef<{ x: number; y: number } | null>(null);
  const [hasCloneSource, setHasCloneSource] = useState(false);

  // 성능 최적화용 Ref (고빈도 이벤트 처리용)
  const isDraggingHandleRef = useRef<string | null>(null);
  const rafId = useRef<number | null>(null);

  useEffect(() => { isDraggingHandleRef.current = isDraggingHandle; }, [isDraggingHandle]);

  const brushCursorRef = useRef<HTMLDivElement>(null);
  const [bgPreset, setBgPreset] = useState(0);
  const expandRafRef = useRef<number | null>(null);

  // 배경 채우기 관련
  const [fillColor, setFillColor] = useState('#ffffff');
  const [showFillPanel, setShowFillPanel] = useState(false);

  const [downloadQuality, setDownloadQuality] = useState(90);
  const [showDownloadPanel, setShowDownloadPanel] = useState(false);
  const [downloadFormat, setDownloadFormat] = useState<'png' | 'jpeg' | 'webp'>('png');

  const [cropMargin, setCropMargin] = useState(4);

  // 보정(Adjustments) 관리
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100);
  const [exposure, setExposure] = useState(0);
  const [blur, setBlur] = useState(0);
  const [showAdjustPanel, setShowAdjustPanel] = useState(false);

  // 상태바 및 눈금자 정보
  // 상태바 정보 전용 Ref (리렌더링 방지)
  const statusBarXRef = useRef<HTMLSpanElement>(null);
  const statusBarYRef = useRef<HTMLSpanElement>(null);
  // 뒤로가기 컨펌 모달
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  // 1. 도구(Tool) 및 브러시 설정 가져오기
  const {
    tool, setTool, toolRef,
    brushSize, setBrushSize,
    brushOpacity, setBrushOpacity,
    brushColor, setBrushColor,
    brushShape, setBrushShape,
    brushHardness, setBrushHardness,
    tolerance, setTolerance,
    wandExpand, setWandExpand,
    wandSmooth, setWandSmooth
  } = useBrushConfig();

  // 2. 캔버스 상태 가져오기
  const core = useCanvasCore(imageUrl, () => {
    resetHistory();
    saveMaskSnapshot('Open');
  });

  const {
    canvasRef, overlayRef, originalRef, maskRef, aiResultRef,
    maskSnapshotRef, tempCanvasRef, originalSnapshotRef, blurCacheRef,
    containerRef, containerRectRef, imageSize, zoom, setZoom, zoomRef,
    updateCanvasSize, compositeAndRender
  } = core;

  const { performDownload } = useImageProcessing();

  // 3. Selection Tools
  const selectionTools = useSelectionTools({
    originalRef, maskRef, overlayRef,
    overlayCache, selectionRef, baseSelectionRef,
    cachedSelKey, marchingSegs, marchingOffset, isSliding,
    tolerance, wandSmooth, wandExpand,
    compositeAndRender, toolRef, cropRectRef,
    saveMaskSnapshot: (label) => saveMaskSnapshot(label),
    drawCropOverlay: (rect) => drawCropOverlay(rect)
  });

  const {
    hasSelection, setHasSelection,
    drawMarching, startMarching, stopMarching,
    handleWand, applySelectionToMask
  } = selectionTools;

  // 4. 히스토리 상태 가져오기
  const {
    historyStack, historyIndex, historyVersion, setHistoryVersion,
    saveMaskSnapshot, jumpToHistory, undo, redo, canUndo, canRedo, resetHistory
  } = useHistory({
    canvasRef, originalRef, maskRef, updateCanvasSize,
    compositeAndRender, stopMarching, setHasSelection
  });

  const [isProcessing, setIsProcessing] = useState(false);
  const [aiDone, setAiDone] = useState(false);
  const [progress, setProgress] = useState(0);
  const [aiAdjust, setAiAdjust] = useState(0); // -100 ~ 100 (양수: 축소, 음수: 내부 복원)
  const outerMaskRef = useRef<Uint8Array | null>(null);

  // 히스토리 추가 시 하단 자동 스크롤
  useEffect(() => {
    if (historyListRef.current) {
      historyListRef.current.scrollTo({
        top: historyListRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [historyIndex, historyStack.current.length]);




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

    // 힙한 애니메이션 테두리 (Marching Ants)
    const t = (marchingOffset.current * 20);
    ctx.setLineDash([6, 4]);
    ctx.lineDashOffset = -t;

    // 외곽 그림자 (대비용)
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 3;
    ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);

    // 요술봉과 동일한 컬러 팔레트
    const colors = [[168, 85, 247], [255, 255, 255], [56, 189, 248], [236, 72, 153], [255, 255, 255]];
    const steps = colors.length - 1;
    const colorPos = marchingOffset.current * steps;
    const idx = Math.floor(colorPos);
    const frac = colorPos - idx;
    const [r1, g1, b1] = colors[idx]!;
    const [r2, g2, b2] = colors[idx + 1]!;
    const r = Math.round(r1 + (r2 - r1) * frac);
    const g = Math.round(g1 + (g2 - g1) * frac);
    const b = Math.round(b1 + (b2 - b1) * frac);

    ctx.strokeStyle = `rgb(${r},${g},${b})`;
    ctx.lineWidth = 2;
    ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;

    // 3x3 그리드 가이드라인
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 3; i++) {
      const gx = rect.x + (rect.w / 3) * i;
      const gy = rect.y + (rect.h / 3) * i;
      ctx.beginPath(); ctx.moveTo(gx, rect.y); ctx.lineTo(gx, rect.y + rect.h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(rect.x, gy); ctx.lineTo(rect.x + rect.w, gy); ctx.stroke();
    }

    // 모서리 핸들
    const hs = 10;
    const corners = [
      { id: 'tl', x: rect.x - hs / 2, y: rect.y - hs / 2 },
      { id: 'tr', x: rect.x + rect.w - hs / 2, y: rect.y - hs / 2 },
      { id: 'bl', x: rect.x - hs / 2, y: rect.y + rect.h - hs / 2 },
      { id: 'br', x: rect.x + rect.w - hs / 2, y: rect.y + rect.h - hs / 2 },
      // 변 핸들
      { id: 't', x: rect.x + rect.w / 2 - hs / 2, y: rect.y - hs / 2 },
      { id: 'b', x: rect.x + rect.w / 2 - hs / 2, y: rect.y + rect.h - hs / 2 },
      { id: 'l', x: rect.x - hs / 2, y: rect.y + rect.h / 2 - hs / 2 },
      { id: 'r', x: rect.x + rect.w - hs / 2, y: rect.y + rect.h / 2 - hs / 2 },
    ];
    ctx.fillStyle = 'white';
    ctx.strokeStyle = '#4f46e5';
    ctx.lineWidth = 2;
    for (const c of corners) {
      ctx.fillRect(c.x, c.y, hs, hs);
      ctx.strokeRect(c.x, c.y, hs, hs);
    }
  }, []);

  // ── 크롭 오버레이 그리기 ──────────────────────────────────

  const applyAiThreshold = useCallback((offset: number) => {
    if (!aiResultRef.current || !maskRef.current || !aiResultRef.current) return;
    const aiCtx = aiResultRef.current.getContext('2d')!;
    const aiData = aiCtx.getImageData(0, 0, aiResultRef.current.width, aiResultRef.current.height);
    const maskCtx = maskRef.current.getContext('2d')!;
    const maskData = maskCtx.getImageData(0, 0, maskRef.current.width, maskRef.current.height);

    const w = aiData.width;
    const h = aiData.height;

    for (let i = 0; i < aiData.data.length; i += 4) {
      const a = aiData.data[i + 3];
      const idx = i / 4;
      let finalA = a;

      if (offset > 0) {
        // [축소/수축] 양수일 때는 기존처럼 낮은 알파를 커트 (임계값 처리)
        const threshold = (offset / 100) * 255;
        finalA = a < threshold ? 0 : a;
      } else if (offset < 0) {
        // [스마트 복원] 음수일 때는 "외부 배경"이 아닌 "내부 구멍"만 알파를 높여 복원
        const isOuter = outerMaskRef.current ? outerMaskRef.current[idx] : 1;
        if (!isOuter) {
          // 내부 영역(로고 안쪽 등)이라면 알파를 특정 값만큼 강제로 끌어올림
          const boost = Math.abs(offset / 100) * 255;
          finalA = Math.max(a, boost);
        }
      }
      maskData.data[i + 3] = finalA;
    }
    maskCtx.putImageData(maskData, 0, 0);
    compositeAndRender();
  }, [compositeAndRender]);

  // 외부 배경 연결성 계산 (Flood Fill)
  const computeOuterBackground = (alphaData: Uint8ClampedArray, width: number, height: number) => {
    const total = width * height;
    const isOuter = new Uint8Array(total);
    const stack: number[] = [];
    const threshold = 128; // 배경으로 간주할 최소 투명도 지점

    // 테두리 픽셀을 시작점으로 추가
    for (let x = 0; x < width; x++) {
      if (alphaData[x * 4 + 3] < threshold) stack.push(x);
      if (alphaData[((height - 1) * width + x) * 4 + 3] < threshold) stack.push((height - 1) * width + x);
    }
    for (let y = 1; y < height - 1; y++) {
      if (alphaData[(y * width) * 4 + 3] < threshold) stack.push(y * width);
      if (alphaData[(y * width + width - 1) * 4 + 3] < threshold) stack.push(y * width + width - 1);
    }

    while (stack.length > 0) {
      const idx = stack.pop()!;
      if (isOuter[idx]) continue;
      isOuter[idx] = 1;

      const x = idx % width;
      const y = (idx / width) | 0;

      // 상하좌우 탐색
      if (y > 0 && !isOuter[idx - width] && alphaData[(idx - width) * 4 + 3] < threshold) stack.push(idx - width);
      if (y < height - 1 && !isOuter[idx + width] && alphaData[(idx + width) * 4 + 3] < threshold) stack.push(idx + width);
      if (x > 0 && !isOuter[idx - 1] && alphaData[(idx - 1) * 4 + 3] < threshold) stack.push(idx - 1);
      if (x < width - 1 && !isOuter[idx + 1] && alphaData[(idx + 1) * 4 + 3] < threshold) stack.push(idx + 1);
    }
    return isOuter;
  };

  const runAI = useCallback(async () => {
    if (!originalRef.current || !maskRef.current || !aiResultRef.current) return;
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

        // 1. 외부 배경 마스크 미리 계산 (Flood fill)
        outerMaskRef.current = computeOuterBackground(aiData.data, aiData.width, aiData.height);

        // 2. 현재 설정된 조절값 적용
        applyAiThreshold(aiAdjust);

        URL.revokeObjectURL(resultUrl);
        saveMaskSnapshot('AI Removal');
        setIsProcessing(false);
        setAiDone(true);
      };
      resultImg.src = resultUrl;
    } catch (err) {
      console.error('배경제거 실패:', err);
      setIsProcessing(false);
    }
  }, [compositeAndRender, saveMaskSnapshot, aiAdjust, applyAiThreshold]);

  // 임계값 변경 시 즉시 반영
  useEffect(() => {
    if (aiDone && !isProcessing) {
      applyAiThreshold(aiAdjust);
    }
  }, [aiAdjust, aiDone, isProcessing, applyAiThreshold]);

  const getCanvasPos = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!;
    const rect = containerRectRef.current || canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0]!.clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0]!.clientY : e.clientY;
    return {
      x: Math.round(((clientX - rect.left) / rect.width) * canvas.width),
      y: Math.round(((clientY - rect.top) / rect.height) * canvas.height),
    };
  }, []);

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
    [drawMarching, setWandExpand]
  );

  const fillSelectionWithColor = useCallback(() => {
    const sel = selectionRef.current;
    if (!sel || !originalRef.current || !maskRef.current) return;

    const w = originalRef.current.width;
    const h = originalRef.current.height;

    const oCtx = originalRef.current.getContext('2d')!;
    const mCtx = maskRef.current.getContext('2d')!;

    const oData = oCtx.getImageData(0, 0, w, h);
    const mData = mCtx.getImageData(0, 0, w, h);

    // RGB 값 준비
    const r = parseInt(brushColor.slice(1, 3), 16);
    const g = parseInt(brushColor.slice(3, 5), 16);
    const b = parseInt(brushColor.slice(5, 7), 16);

    for (let i = 0; i < sel.length; i++) {
      if (sel[i]) {
        const idx = i * 4;
        oData.data[idx] = r;
        oData.data[idx + 1] = g;
        oData.data[idx + 2] = b;
        oData.data[idx + 3] = 255;

        // 마스크 도색 (해당 영역 보이기)
        mData.data[idx] = 0;
        mData.data[idx + 1] = 0;
        mData.data[idx + 2] = 0;
        mData.data[idx + 3] = 255;
      }
    }

    oCtx.putImageData(oData, 0, 0);
    mCtx.putImageData(mData, 0, 0);
    compositeAndRender();
    stopMarching();
    saveMaskSnapshot('Selection Fill');
  }, [brushColor, compositeAndRender, saveMaskSnapshot, stopMarching]);

  const handleBucket = useCallback(
    (pos: { x: number; y: number }) => {
      if (!originalRef.current || !maskRef.current || !canvasRef.current) return;
      const w = originalRef.current.width;
      const h = originalRef.current.height;

      if (pos.x < 0 || pos.x >= w || pos.y < 0 || pos.y >= h) return;

      const oCtx = originalRef.current.getContext('2d')!;
      const mCtx = maskRef.current.getContext('2d')!;
      const compositeCtx = canvasRef.current.getContext('2d', { willReadFrequently: true })!;

      // 현재 보이는 상태(composite)를 기준으로 영역 계산 (투명 영역도 색칠 가능하게 함)
      const visibleData = compositeCtx.getImageData(0, 0, w, h);
      const sel = floodFillSelect(visibleData, pos.x, pos.y, tolerance);

      const oData = oCtx.getImageData(0, 0, w, h);
      const mData = mCtx.getImageData(0, 0, w, h);

      // 브러시 컬러 적용
      const r = parseInt(brushColor.slice(1, 3), 16);
      const g = parseInt(brushColor.slice(3, 5), 16);
      const b = parseInt(brushColor.slice(5, 7), 16);

      for (let i = 0; i < sel.length; i++) {
        if (sel[i]) {
          const idx = i * 4;
          oData.data[idx] = r;
          oData.data[idx + 1] = g;
          oData.data[idx + 2] = b;
          oData.data[idx + 3] = 255;

          // 마스트도 해당 부분을 불투명하게 채움
          mData.data[idx] = 0;
          mData.data[idx + 1] = 0;
          mData.data[idx + 2] = 0;
          mData.data[idx + 3] = 255;
        }
      }

      oCtx.putImageData(oData, 0, 0);
      mCtx.putImageData(mData, 0, 0);
      compositeAndRender();
      saveMaskSnapshot('Bucket Fill');
    },
    [brushColor, tolerance, compositeAndRender, saveMaskSnapshot]
  );

  const handleEyedropper = useCallback((pos: { x: number; y: number }) => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d', { willReadFrequently: true })!;
    const pixel = ctx.getImageData(pos.x, pos.y, 1, 1).data;
    const r = pixel[0]!.toString(16).padStart(2, '0');
    const g = pixel[1]!.toString(16).padStart(2, '0');
    const b = pixel[2]!.toString(16).padStart(2, '0');
    const hex = `#${r}${g}${b}`;
    setBrushColor(hex);
    // [수정] 강제로 'paint'로 바꾸는 로직을 제거하여 현재 도구(Bucket 등)를 유지합니다.
  }, []);

  const drawShape = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number, shape: BrushShape) => {
    const r = size / 2;
    ctx.beginPath();
    if (shape === 'circle') {
      ctx.arc(x, y, r, 0, Math.PI * 2);
    } else if (shape === 'square') {
      ctx.rect(x - r, y - r, size, size);
    } else if (shape === 'rect-h') {
      ctx.rect(x - r, y - r / 2, size, size / 2);
    } else if (shape === 'rect-v') {
      ctx.rect(x - r / 2, y - r, size / 2, size);
    } else if (shape === 'rect-h-thin') {
      ctx.rect(x - r, y - r / 4, size, size / 4);
    } else if (shape === 'rect-v-thin') {
      ctx.rect(x - r / 4, y - r, size / 4, size);
    } else if (shape === 'diamond') {
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r, y);
      ctx.lineTo(x, y + r);
      ctx.lineTo(x - r, y);
      ctx.closePath();
    }
    ctx.fill();
  };

  const applySoftMask = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number, hardness: number) => {
    const r = size / 2;
    const grad = ctx.createRadialGradient(x, y, r * (hardness / 100), x, y, r);
    grad.addColorStop(0, 'rgba(0,0,0,1)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.globalCompositeOperation = 'destination-in';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  };

  // ── 성능 최적화용 캐시 및 Ref ──────────────────────────────────
  const brushTipRef = useRef<HTMLCanvasElement | null>(null);

  // 브러시 팁 캐시 생성 (모양/크기/색상이 바뀔 때만 업데이트)
  const updateBrushTip = useCallback(() => {
    if (!brushTipRef.current) brushTipRef.current = document.createElement('canvas');
    const tip = brushTipRef.current;

    // 브러시 크기에 여유 공간을 조금 더 줌 (안티앨리어싱 대비)
    const size = Math.ceil(brushSize);
    const padding = 2;
    tip.width = size + padding * 2;
    tip.height = size + padding * 2;

    const tCtx = tip.getContext('2d')!;
    tCtx.clearRect(0, 0, tip.width, tip.height);

    const center = tip.width / 2;
    const r = size / 2;

    const shape = brushShape;
    const hardness = brushHardness / 100;

    tCtx.save();

    // 기본 스타일 설정
    if (tool === 'paint') {
      tCtx.fillStyle = brushColor;
    } else {
      tCtx.fillStyle = 'black';
    }

    if (['paint', 'clone', 'heal', 'blur-brush', 'erase', 'restore'].includes(tool)) {
      if (shape === 'circle') {
        const grad = tCtx.createRadialGradient(center, center, r * hardness, center, center, r);
        grad.addColorStop(0, 'rgba(0,0,0,1)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');

        if (tool === 'paint') {
          tCtx.globalCompositeOperation = 'source-over';
          tCtx.fillStyle = brushColor;
          tCtx.beginPath();
          tCtx.arc(center, center, r, 0, Math.PI * 2);
          tCtx.fill();
          tCtx.globalCompositeOperation = 'destination-in';
          tCtx.fillStyle = grad;
          tCtx.beginPath();
          tCtx.arc(center, center, r, 0, Math.PI * 2);
          tCtx.fill();
        } else {
          tCtx.fillStyle = grad;
          tCtx.beginPath();
          tCtx.arc(center, center, r, 0, Math.PI * 2);
          tCtx.fill();
        }
      } else if (shape === 'square') {
        if (hardness < 1) {
          // 사각형 페더링(Hardness) 시뮬레이션
          const feather = (1 - hardness) * r;
          tCtx.filter = `blur(${feather}px)`;
        }
        tCtx.fillRect(center - r, center - r, size, size);
      } else if (shape === 'diamond') {
        if (hardness < 1) {
          const feather = (1 - hardness) * r;
          tCtx.filter = `blur(${feather}px)`;
        }
        tCtx.beginPath();
        tCtx.moveTo(center, center - r);
        tCtx.lineTo(center + r, center);
        tCtx.lineTo(center, center + r);
        tCtx.lineTo(center - r, center);
        tCtx.closePath();
        tCtx.fill();
      }
    }
    tCtx.restore();
  }, [brushSize, brushHardness, brushColor, tool, brushShape]);

  // 브러시 설정 변경 시 팁 업데이트
  useEffect(() => {
    updateBrushTip();
  }, [updateBrushTip]);

  const paint = useCallback(
    (pos: { x: number; y: number }) => {
      if (!maskRef.current || !originalRef.current || !brushTipRef.current) return;

      const imgW = originalRef.current.width;
      const imgH = originalRef.current.height;

      const maskCtx = maskRef.current.getContext('2d')!;
      const origCtx = originalRef.current.getContext('2d')!;
      const from = lastPos.current || pos;

      const alpha = brushOpacity / 100;
      const dx = pos.x - from.x;
      const dy = pos.y - from.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // 간격을 브러시 크기의 1/10 정도로 설정 (더 부드럽게)
      const stepSize = Math.max(1, brushSize / 10);
      const steps = Math.ceil(distance / stepSize);

      let startOffset = { x: 0, y: 0 };
      if ((tool === 'clone' || tool === 'heal') && cloneSourceRef.current && initialMousePos.current) {
        startOffset = {
          x: cloneSourceRef.current.x - initialMousePos.current.x,
          y: cloneSourceRef.current.y - initialMousePos.current.y
        };
      }

      const tipCanvas = brushTipRef.current;
      const tipW = tipCanvas.width;
      const tipH = tipCanvas.height;
      const offset = tipW / 2;

      // 루프 내부에서 컨텍스트 상태 변경 최소화
      maskCtx.save();
      origCtx.save();

      // 도구별 공통 설정
      if (tool === 'erase') {
        maskCtx.globalCompositeOperation = 'destination-out';
      } else if (tool === 'restore') {
        maskCtx.globalCompositeOperation = 'source-over';
      }

      for (let i = 0; i <= steps; i++) {
        const t = steps === 0 ? 0 : i / steps;
        const px = from.x + dx * t;
        const py = from.y + dy * t;

        if (tool === 'paint') {
          origCtx.globalAlpha = alpha;
          origCtx.drawImage(tipCanvas, px - offset, py - offset);
          maskCtx.globalAlpha = 1;
          maskCtx.drawImage(tipCanvas, px - offset, py - offset);
        } else if (tool === 'erase' || tool === 'restore') {
          maskCtx.globalAlpha = alpha;
          maskCtx.drawImage(tipCanvas, px - offset, py - offset);
        } else if (tool === 'blur-brush' && blurCacheRef.current) {
          const tCanvas = tempCanvasRef.current!;
          tCanvas.width = tipW;
          tCanvas.height = tipH;
          const tCtx = tCanvas.getContext('2d')!;
          tCtx.clearRect(0, 0, tipW, tipH);
          tCtx.drawImage(
            blurCacheRef.current,
            px - offset, py - offset, tipW, tipH,
            0, 0, tipW, tipH
          );
          tCtx.globalCompositeOperation = 'destination-in';
          tCtx.drawImage(tipCanvas, 0, 0);
          origCtx.globalAlpha = alpha;
          origCtx.drawImage(tCanvas, px - offset, py - offset);
        } else if ((tool === 'clone' || tool === 'heal') && originalSnapshotRef.current) {
          const tCanvas = tempCanvasRef.current!;
          tCanvas.width = tipW;
          tCanvas.height = tipH;
          const tCtx = tCanvas.getContext('2d')!;
          tCtx.clearRect(0, 0, tipW, tipH);
          tCtx.drawImage(
            originalSnapshotRef.current,
            px + startOffset.x - offset, py + startOffset.y - offset, tipW, tipH,
            0, 0, tipW, tipH
          );
          tCtx.globalCompositeOperation = 'destination-in';
          tCtx.drawImage(tipCanvas, 0, 0);
          origCtx.globalAlpha = tool === 'heal' ? alpha * 0.7 : alpha;
          origCtx.drawImage(tCanvas, px - offset, py - offset);

          // 투명 배경일 경우 그려진 위치가 보여야 하므로 마스크에도 그려 줌 (불투명하게)
          maskCtx.globalCompositeOperation = 'source-over';
          maskCtx.globalAlpha = 1;
          maskCtx.drawImage(tipCanvas, px - offset, py - offset);
        }
      }

      maskCtx.restore();
      origCtx.restore();
      lastPos.current = pos;
      hasStrokeRef.current = true;
      compositeAndRender();
    },
    [tool, brushSize, brushOpacity, brushHardness, brushColor, compositeAndRender, originalSnapshotRef, blurCacheRef]
  );


  const initialMousePos = useRef({ x: 0, y: 0 });

  const handleMouseDown = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      if (canvasRef.current) containerRectRef.current = canvasRef.current.getBoundingClientRect();
      const pos = getCanvasPos(e);
      const isAlt = (e as any).altKey;

      if ((tool === 'clone' || tool === 'heal') && isAlt) {
        cloneSourceRef.current = pos;
        setHasCloneSource(true);
        return;
      }

      // [추가] Paint/Bucket 도구에서 Alt 클릭 시 색상 추출
      if ((tool === 'paint' || tool === 'bucket') && isAlt) {
        handleEyedropper(pos);
        return;
      }

      if (tool === 'wand') {
        const isCtrl = 'ctrlKey' in e ? (e as any).ctrlKey || (e as any).shiftKey : false;
        handleWand(pos, isCtrl);
      } else if (tool === 'bucket') {
        handleBucket(pos);
      } else if (tool === 'eyedropper') {
        handleEyedropper(pos);
      } else if (tool === 'crop') {
        // 핸들 체크
        if (cropRect) {
          const hs = 20; // 클릭 인식 범위 확대
          const zoomHs = hs / zoom;
          const { x, y, w, h } = cropRect;
          const handles = [
            { id: 'tl', x: x, y: y }, { id: 'tr', x: x + w, y: y },
            { id: 'bl', x: x, y: y + h }, { id: 'br', x: x + w, y: y + h },
            { id: 't', x: x + w / 2, y: y }, { id: 'b', x: x + w / 2, y: y + h },
            { id: 'l', x: x, y: y + h / 2 }, { id: 'r', x: x + w, y: y + h / 2 }
          ];

          for (const hnd of handles) {
            if (Math.abs(pos.x - hnd.x) < zoomHs && Math.abs(pos.y - hnd.y) < zoomHs) {
              setIsDraggingHandle(hnd.id);
              isPainting.current = true;
              return;
            }
          }
        }

        cropStartRef.current = pos;
        cropRectRef.current = { x: pos.x, y: pos.y, w: 0, h: 0 };
        setCropRect({ x: pos.x, y: pos.y, w: 0, h: 0 });
        drawCropOverlay({ x: pos.x, y: pos.y, w: 0, h: 0 });
        isPainting.current = true;
      } else if (tool === 'marquee-rect' || tool === 'marquee-circle') {
        cropStartRef.current = pos;
        cropRectRef.current = { x: pos.x, y: pos.y, w: 0, h: 0 };
        setCropRect({ x: pos.x, y: pos.y, w: 0, h: 0 });
        isPainting.current = true;
      } else {
        // 도구별 작업 시작 시 스냅샷/캐시 생성 (성능 및 품질 핵심)
        if (originalRef.current) {
          const w = originalRef.current.width;
          const h = originalRef.current.height;

          // 1. 원본 스냅샷 (Clone/Heal용)
          if (!originalSnapshotRef.current) originalSnapshotRef.current = document.createElement('canvas');
          originalSnapshotRef.current.width = w;
          originalSnapshotRef.current.height = h;
          originalSnapshotRef.current.getContext('2d')!.drawImage(originalRef.current, 0, 0);

          // 2. 전체 블러 캐시 (Blur Tool용 - 미리 한 번만 연산)
          if (tool === 'blur-brush') {
            if (!blurCacheRef.current) blurCacheRef.current = document.createElement('canvas');
            blurCacheRef.current.width = w;
            blurCacheRef.current.height = h;
            const bCtx = blurCacheRef.current.getContext('2d')!;
            bCtx.filter = `blur(${Math.max(1, brushSize / 5)}px)`;
            bCtx.drawImage(originalRef.current, 0, 0);
          }
        }

        isPainting.current = true;
        hasStrokeRef.current = false;
        lastPos.current = pos;
        initialMousePos.current = pos;
        paint(pos);
      }
    },
    [tool, getCanvasPos, handleWand, handleBucket, handleEyedropper, paint, saveMaskSnapshot, drawCropOverlay, cropRect, zoom, brushSize, originalSnapshotRef, blurCacheRef]
  );


  const applyMarqueeSelection = useCallback(() => {
    const rect = cropRectRef.current;
    if (!rect || rect.w < 2 || rect.h < 2) return;
    if (!originalRef.current) return;

    const w = originalRef.current.width;
    const h = originalRef.current.height;
    const sel = new Uint8Array(w * h);

    const x1 = Math.round(rect.x);
    const y1 = Math.round(rect.y);
    const x2 = Math.round(rect.x + rect.w);
    const y2 = Math.round(rect.y + rect.h);

    if (tool === 'marquee-rect') {
      for (let y = Math.max(0, y1); y < Math.min(h, y2); y++) {
        for (let x = Math.max(0, x1); x < Math.min(w, x2); x++) {
          sel[y * w + x] = 1;
        }
      }
    } else {
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2;
      const rx = Math.abs(x2 - x1) / 2;
      const ry = Math.abs(y2 - y1) / 2;
      for (let y = Math.max(0, y1); y < Math.min(h, y2); y++) {
        for (let x = Math.max(0, x1); x < Math.min(w, x2); x++) {
          const dx = (x - cx) / rx;
          const dy = (y - cy) / ry;
          if (dx * dx + dy * dy <= 1) sel[y * w + x] = 1;
        }
      }
    }

    selectionRef.current = sel;
    setHasSelection(true);
    cropRectRef.current = null;
    setCropRect(null);
    drawMarching();
    startMarching();
  }, [tool, drawMarching, startMarching]);

  const handleMouseUp = useCallback(() => {
    if (toolRef.current === 'marquee-rect' || toolRef.current === 'marquee-circle') {
      applyMarqueeSelection();
    }
    if (isPainting.current && hasStrokeRef.current) {
      let label = 'Edit';
      const t = toolRef.current;
      if (t === 'erase') label = 'Eraser';
      else if (t === 'restore') label = 'Restore';
      else if (t === 'paint') label = 'Brush';
      else if (t === 'clone') label = 'Clone Stamp';
      else if (t === 'heal') label = 'Healing';
      else if (t === 'blur-brush') label = 'Blur';

      saveMaskSnapshot(label);
    }
    isPainting.current = false;
    hasStrokeRef.current = false;
    lastPos.current = null;
    setIsDraggingHandle(null);
  }, [applyMarqueeSelection, saveMaskSnapshot]);

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
    updateCanvasSize(sw, sh);

    originalRef.current.getContext('2d')!.drawImage(origCropped, 0, 0);
    maskRef.current.getContext('2d')!.drawImage(maskCropped, 0, 0);
    aiResultRef.current!.getContext('2d')!.drawImage(origCropped, 0, 0);

    cropRectRef.current = null;
    setCropRect(null);
    overlayRef.current?.getContext('2d')?.clearRect(0, 0, sw, sh);
    setTool('wand');
    compositeAndRender();
    saveMaskSnapshot('Crop');
  }, [compositeAndRender, saveMaskSnapshot, updateCanvasSize]);

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

    updateCanvasSize(w, h);

    originalRef.current.getContext('2d')!.drawImage(origCropped, 0, 0);
    maskRef.current.getContext('2d')!.drawImage(maskCropped, 0, 0);
    aiResultRef.current!.getContext('2d')!.drawImage(origCropped, 0, 0);

    stopMarching();
    compositeAndRender();
    saveMaskSnapshot('Auto Crop');
  }, [compositeAndRender, stopMarching, cropMargin, saveMaskSnapshot, updateCanvasSize]);

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

    // 원본은 flat으로 교체 (배경이 채워진 상태)
    originalRef.current.getContext('2d')!.clearRect(0, 0, w, h);
    originalRef.current.getContext('2d')!.drawImage(flat, 0, 0);

    // 마스크는 전체 불투명으로 전면 교체
    const maskCtx = maskRef.current.getContext('2d')!;
    maskCtx.fillStyle = 'black';
    maskCtx.fillRect(0, 0, w, h);

    setShowFillPanel(false);
    compositeAndRender();
    saveMaskSnapshot('Fill Bg');
  }, [fillColor, compositeAndRender, saveMaskSnapshot]);

  // 투명한 영역 전체만 현재 선택한 배경색으로 채우는 기능
  const applyBackgroundToTransparency = useCallback(() => {
    if (!canvasRef.current || !originalRef.current || !maskRef.current) return;
    const w = canvasRef.current.width;
    const h = canvasRef.current.height;


    const flat = document.createElement('canvas');
    flat.width = w;
    flat.height = h;
    const fctx = flat.getContext('2d')!;

    // 현재 설정된 fillColor로 배경 생성
    fctx.fillStyle = fillColor;
    fctx.fillRect(0, 0, w, h);

    // 현재의 결과물(피사체 + 투명도)을 위에 덮음
    fctx.drawImage(canvasRef.current, 0, 0);

    // 원본 데이터를 배경이 채워진 최종본으로 교체
    const oCtx = originalRef.current.getContext('2d')!;
    oCtx.clearRect(0, 0, w, h);
    oCtx.drawImage(flat, 0, 0);

    // 배경이 채워졌으므로 마스크는 전체 불투명(검정)으로 설정
    const mCtx = maskRef.current.getContext('2d')!;
    mCtx.fillStyle = 'black';
    mCtx.fillRect(0, 0, w, h);

    setShowFillPanel(false);
    compositeAndRender();
    saveMaskSnapshot('Fill Transp.');
  }, [fillColor, compositeAndRender, saveMaskSnapshot]);

  // 투명 영역 전체를 현재 브러시 색상으로 채우는 기능
  const fillAllTransparency = useCallback(() => {
    if (!originalRef.current || !maskRef.current || !canvasRef.current) return;
    const w = originalRef.current.width;
    const h = originalRef.current.height;

    const flat = document.createElement('canvas');
    flat.width = w;
    flat.height = h;
    const fctx = flat.getContext('2d')!;

    fctx.fillStyle = brushColor;
    fctx.fillRect(0, 0, w, h);
    fctx.drawImage(canvasRef.current, 0, 0);

    const oCtx = originalRef.current.getContext('2d')!;
    oCtx.clearRect(0, 0, w, h);
    oCtx.drawImage(flat, 0, 0);

    const maskCtx = maskRef.current.getContext('2d')!;
    maskCtx.fillStyle = 'black';
    maskCtx.fillRect(0, 0, w, h);

    compositeAndRender();
    saveMaskSnapshot('Brush Fill');
  }, [brushColor, compositeAndRender, saveMaskSnapshot]);



  const resetMask = useCallback(() => {
    if (!maskRef.current) return;
    const ctx = maskRef.current.getContext('2d')!;
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, maskRef.current.width, maskRef.current.height);
    compositeAndRender();
    stopMarching();
    setAiDone(false);
    saveMaskSnapshot('Reset');
  }, [compositeAndRender, stopMarching, saveMaskSnapshot]);

  // ── 다운로드 ──────────────────────────────────────────────
  const download = useCallback(() => {
    if (!canvasRef.current) return;
    const format = downloadFormat;
    const quality = downloadQuality / 100;

    canvasRef.current.toBlob(async (blob) => {
      if (!blob) return;
      const filename = getDownloadFilename(originalName, blob.type);
      await performDownload(blob, filename);
      setShowDownloadPanel(false);
    }, `image/${format}`, quality);
  }, [downloadFormat, downloadQuality, originalName, performDownload]);

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

      // Photoshop shortcuts
      const key = e.key.toLowerCase();
      if (key === 'v' || key === 'w') { setTool('wand'); cancelCrop(); }
      if (key === 'b') { setTool('paint'); stopMarching(); cancelCrop(); }
      if (key === 'e') { setTool('erase'); stopMarching(); cancelCrop(); }
      if (key === 'g') { setTool('bucket'); stopMarching(); cancelCrop(); }
      if (key === 'c') { setTool('crop'); stopMarching(); startMarching(); }
      if (key === 'r') { setTool('restore'); stopMarching(); cancelCrop(); }
      if (key === 'i') { setTool('eyedropper'); stopMarching(); cancelCrop(); }

      if (e.key === 'Escape') {
        if (tool === 'crop') cancelCrop();
        if (hasSelection) stopMarching();
      }
      if (e.key === 'Enter') {
        if (tool === 'crop' && cropRect && cropRect.w > 2) applyCrop();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hasSelection, applySelectionToMask, undo, redo, tool, cancelCrop, applyCrop, cropRect, startMarching, stopMarching, setTool]);

  // ── 전역 마우스/터치 이동 리스너 (캔버스 밖에서도 작업 유지) ─────────────────
  const handleMouseMove = useCallback((e: MouseEvent | TouchEvent) => {
    const overlay = overlayRef.current;
    const brushCursor = brushCursorRef.current;
    if (!overlay) return;

    const rect = overlay.getBoundingClientRect();
    const clientX = 'touches' in e ? (e as TouchEvent).touches[0]!.clientX : (e as MouseEvent).clientX;
    const clientY = 'touches' in e ? (e as TouchEvent).touches[0]!.clientY : (e as MouseEvent).clientY;

    const lx = clientX - rect.left;
    const ly = clientY - rect.top;

    if (brushCursor) {
      brushCursor.style.left = `${lx}px`;
      brushCursor.style.top = `${ly}px`;
      const needsBrush = (toolRef.current === 'erase' || toolRef.current === 'restore' || toolRef.current === 'paint' || toolRef.current === 'clone' || toolRef.current === 'heal' || toolRef.current === 'blur-brush');
      brushCursor.style.display = needsBrush ? 'block' : 'none';
    }

    const canvasPos = getCanvasPos(e as any);
    if (statusBarXRef.current) statusBarXRef.current.innerText = Math.round(canvasPos.x).toString();
    if (statusBarYRef.current) statusBarYRef.current.innerText = Math.round(canvasPos.y).toString();

    // 크롭 도구 커서 처리
    if (toolRef.current === 'crop' && cropRectRef.current && !isPainting.current) {
      const hs = 25;
      const zoomHs = hs / zoomRef.current;
      const { x, y, w, h } = cropRectRef.current;
      const handles = [
        { id: 'tl', x: x, y: y, cur: 'nwse-resize' },
        { id: 'tr', x: x + w, y: y, cur: 'nesw-resize' },
        { id: 'bl', x: x, y: y + h, cur: 'nesw-resize' },
        { id: 'br', x: x + w, y: y + h, cur: 'nwse-resize' },
        { id: 't', x: x + w / 2, y: y, cur: 'ns-resize' },
        { id: 'b', x: x + w / 2, y: y + h, cur: 'ns-resize' },
        { id: 'l', x: x, y: y + h / 2, cur: 'ew-resize' },
        { id: 'r', x: x + w, y: y + h / 2, cur: 'ew-resize' }
      ];
      let found = '';
      for (const hnd of handles) {
        if (Math.abs(canvasPos.x - hnd.x) < zoomHs && Math.abs(canvasPos.y - hnd.y) < zoomHs) {
          found = hnd.cur; break;
        }
      }
      overlay.style.cursor = found || 'crosshair';
    } else if (toolRef.current === 'text') {
      overlay.style.cursor = 'text';
    } else if (!isPainting.current) {
      const isAltHeld = (e as any).altKey;
      const isEyedropperTool = toolRef.current === 'eyedropper';
      const isDropperHover = (toolRef.current === 'paint' || toolRef.current === 'bucket') && isAltHeld;

      if (isEyedropperTool || isDropperHover) {
        overlay.style.cursor = EYEDROPPER_CURSOR;
        if (brushCursor) brushCursor.style.display = 'none';
      } else {
        const showBrush = (toolRef.current === 'erase' || toolRef.current === 'restore' || toolRef.current === 'paint' || toolRef.current === 'clone' || toolRef.current === 'heal' || toolRef.current === 'blur-brush');
        overlay.style.cursor = (toolRef.current === 'wand' || toolRef.current === 'crop' || toolRef.current === 'bucket' || toolRef.current.startsWith('marquee')) ? 'crosshair' : 'none';
        if (brushCursor) brushCursor.style.display = showBrush ? 'block' : 'none';
      }
    }

    if (isPainting.current) {
      if ('touches' in e) e.preventDefault();

      if (rafId.current) cancelAnimationFrame(rafId.current);
      rafId.current = requestAnimationFrame(() => {
        const currentTool = toolRef.current;
        const pos = canvasPos;

        // Aligned Source Preview for Clone/Heal
        if ((currentTool === 'clone' || currentTool === 'heal') && cloneSourceRef.current && initialMousePos.current) {
          const ctx = overlay.getContext('2d')!;
          ctx.clearRect(0, 0, overlay.width, overlay.height);
          const mouseOffset = { x: pos.x - initialMousePos.current.x, y: pos.y - initialMousePos.current.y };
          const srcX = cloneSourceRef.current.x + mouseOffset.x;
          const srcY = cloneSourceRef.current.y + mouseOffset.y;

          ctx.strokeStyle = 'white';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(srcX - 5, srcY); ctx.lineTo(srcX + 5, srcY);
          ctx.moveTo(srcX, srcY - 5); ctx.lineTo(srcX, srcY + 5);
          ctx.stroke();
        }

        const draggingHnd = isDraggingHandleRef.current;
        const curCropRect = cropRectRef.current;

        if (currentTool === 'crop' || currentTool === 'marquee-rect' || currentTool === 'marquee-circle') {
          if (draggingHnd && curCropRect) {
            const newRect = { ...curCropRect };
            if (draggingHnd.includes('t')) {
              const bottom = newRect.y + newRect.h;
              newRect.y = Math.min(pos.y, bottom - 1);
              newRect.h = bottom - newRect.y;
            }
            if (draggingHnd.includes('b')) newRect.h = Math.max(1, pos.y - newRect.y);
            if (draggingHnd.includes('l')) {
              const right = newRect.x + newRect.w;
              newRect.x = Math.min(pos.x, right - 1);
              newRect.w = right - newRect.x;
            }
            if (draggingHnd.includes('r')) newRect.w = Math.max(1, pos.x - newRect.x);
            cropRectRef.current = newRect;
            drawCropOverlay(newRect);
          } else if (cropStartRef.current) {
            const start = cropStartRef.current;
            const newRect = {
              x: Math.min(start.x, pos.x),
              y: Math.min(start.y, pos.y),
              w: Math.abs(pos.x - start.x),
              h: Math.abs(pos.y - start.y)
            };
            cropRectRef.current = newRect;
            drawCropOverlay(newRect);
          }
        } else if (currentTool === 'erase' || currentTool === 'restore' || currentTool === 'paint' || currentTool === 'clone' || currentTool === 'heal' || currentTool === 'blur-brush') {
          paint(pos);
        } else if (currentTool === 'eyedropper') {
          handleEyedropper(pos);
        }
      });
    }
  }, [getCanvasPos, paint, drawCropOverlay, handleEyedropper]);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove, { passive: false });
    window.addEventListener('touchmove', handleMouseMove, { passive: false });
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('touchmove', handleMouseMove);
      if (rafId.current) cancelAnimationFrame(rafId.current);
    };
  }, [handleMouseMove]);

  // Global mouseup/touchend listener to stop painting if mouse leaves canvas
  useEffect(() => {
    const handleGlobalUp = () => {
      if (isPainting.current) {
        // 드래그 종료 시 최종 상태 동기화
        if (toolRef.current === 'crop' || toolRef.current === 'marquee-rect' || toolRef.current === 'marquee-circle') {
          if (cropRectRef.current) setCropRect({ ...cropRectRef.current });
        }
        handleMouseUp();
      }

      // 메모리 해제
      if (originalSnapshotRef.current) {
        originalSnapshotRef.current.width = 0; originalSnapshotRef.current.height = 0;
        originalSnapshotRef.current = null;
      }
      if (blurCacheRef.current) {
        blurCacheRef.current.width = 0; blurCacheRef.current.height = 0;
        blurCacheRef.current = null;
      }
    };
    window.addEventListener('mouseup', handleGlobalUp);
    window.addEventListener('touchend', handleGlobalUp);
    return () => {
      window.removeEventListener('mouseup', handleGlobalUp);
      window.removeEventListener('touchend', handleGlobalUp);
    };
  }, [handleMouseUp, setCropRect]);

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

  // ── 스크롤 시 눈금자 동기화 ──────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handleScroll = () => {
      setHistoryVersion(v => v + 1); // 리렌더링 트리거하여 눈금자 배경 갱신
    };
    el.addEventListener('scroll', handleScroll);
    return () => el.removeEventListener('scroll', handleScroll);
  }, []);

  const displayWidth = imageSize.w * zoom;
  const displayHeight = imageSize.h * zoom;
  // ── 보정 실행 ──────────────────────────────────────────
  const applyAdjustments = useCallback(() => {
    if (!originalRef.current || !maskRef.current) return;
    const w = originalRef.current.width;
    const h = originalRef.current.height;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;

    // 필터 문자열 생성
    ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%) blur(${blur}px)`;
    ctx.drawImage(originalRef.current, 0, 0);

    const oCtx = originalRef.current.getContext('2d')!;
    oCtx.clearRect(0, 0, w, h);
    oCtx.drawImage(canvas, 0, 0);

    compositeAndRender();
    saveMaskSnapshot('Adjustments');
    setShowAdjustPanel(false);

    // 필터 리셋
    setBrightness(100); setContrast(100); setSaturation(100); setBlur(0);
  }, [brightness, contrast, saturation, blur, compositeAndRender, saveMaskSnapshot]);

  const isBrushTool = tool === 'erase' || tool === 'restore' || tool === 'paint';
  const BG_PRESETS = [
    { label: '어두운 체크', swatch: 'bg-swatch-dark-check', style: { backgroundImage: 'linear-gradient(45deg,#1a1a1b 25%,transparent 25%),linear-gradient(-45deg,#1a1a1b 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#1a1a1b 75%),linear-gradient(-45deg,transparent 75%,#1a1a1b 75%)', backgroundSize: '16px 16px', backgroundPosition: '0 0,0 8px,8px -8px,-8px 0', backgroundColor: '#111' } },
    { label: '밝은 체크', swatch: 'bg-swatch-light-check', style: { backgroundImage: 'linear-gradient(45deg,#ccc 25%,transparent 25%),linear-gradient(-45deg,#ccc 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#ccc 75%),linear-gradient(-45deg,transparent 75%,#ccc 75%)', backgroundSize: '16px 16px', backgroundPosition: '0 0,0 8px,8px -8px,-8px 0', backgroundColor: '#fff' } },
    { label: '검정', swatch: 'bg-swatch-black', style: { backgroundImage: 'none', backgroundColor: '#000' } },
    { label: '흰색', swatch: 'bg-swatch-white', style: { backgroundImage: 'none', backgroundColor: '#fff' } },
    { label: '회색', swatch: 'bg-swatch-gray', style: { backgroundImage: 'none', backgroundColor: '#808080' } },
  ] as const;

  // 눈금자 렌더링용 SVG 배경
  const horizontalRulerBg = `url("data:image/svg+xml,%3Csvg width='100' height='20' xmlns='http://www.w3.org/2000/svg'%3E%3Cline x1='0' y1='10' x2='0' y2='20' stroke='%23555' stroke-width='1'/%3E%3Cline x1='10' y1='15' x2='10' y2='20' stroke='%23444' stroke-width='1'/%3E%3Cline x1='20' y1='15' x2='20' y2='20' stroke='%23444' stroke-width='1'/%3E%3Cline x1='30' y1='15' x2='30' y2='20' stroke='%23444' stroke-width='1'/%3E%3Cline x1='40' y1='15' x2='40' y2='20' stroke='%23444' stroke-width='1'/%3E%3Cline x1='50' y1='12' x2='50' y2='20' stroke='%23555' stroke-width='1'/%3E%3Cline x1='60' y1='15' x2='60' y2='20' stroke='%23444' stroke-width='1'/%3E%3Cline x1='70' y1='15' x2='70' y2='20' stroke='%23444' stroke-width='1'/%3E%3Cline x1='80' y1='15' x2='80' y2='20' stroke='%23444' stroke-width='1'/%3E%3Cline x1='90' y1='15' x2='90' y2='20' stroke='%23444' stroke-width='1'/%3E%3C/svg%3E")`;
  const verticalRulerBg = `url("data:image/svg+xml,%3Csvg width='20' height='100' xmlns='http://www.w3.org/2000/svg'%3E%3Cline x1='10' y1='0' x2='20' y2='0' stroke='%23555' stroke-width='1'/%3E%3Cline x1='15' y1='10' x2='20' y2='10' stroke='%23444' stroke-width='1'/%3E%3Cline x1='15' y1='20' x2='20' y2='20' stroke='%23444' stroke-width='1'/%3E%3Cline x1='15' y1='30' x2='20' y2='30' stroke='%23444' stroke-width='1'/%3E%3Cline x1='15' y1='40' x2='20' y2='40' stroke='%23444' stroke-width='1'/%3E%3Cline x1='12' y1='50' x2='20' y2='50' stroke='%23555' stroke-width='1'/%3E%3Cline x1='15' y1='60' x2='20' y2='60' stroke='%23444' stroke-width='1'/%3E%3Cline x1='15' y1='70' x2='20' y2='70' stroke='%23444' stroke-width='1'/%3E%3Cline x1='15' y1='80' x2='20' y2='80' stroke='%23444' stroke-width='1'/%3E%3Cline x1='15' y1='90' x2='20' y2='90' stroke='%23444' stroke-width='1'/%3E%3C/svg%3E")`;

  return (
    <div className="brush-editor-wrap">
      {/* ── TOP BAR (Header) ────────────────────────────────── */}
      <div className="brush-top-bar">
        <button onClick={() => setShowExitConfirm(true)} className="brush-tool-btn" title="목록으로">
          <ArrowLeft size={20} />
        </button>
        <div className="brush-top-sep" />

        <div className="flex items-center gap-1">
          <button onClick={undo} disabled={!canUndo} className="brush-tool-btn" title="되돌리기 (Ctrl+Z)">
            <Undo2 size={18} />
          </button>
          <button onClick={redo} disabled={!canRedo} className="brush-tool-btn" title="다시 실행 (Ctrl+Y)">
            <Redo2 size={18} />
          </button>
        </div>

        <div className="brush-top-sep" />

        <button
          onClick={runAI}
          disabled={isProcessing || aiDone}
          className={`brush-btn-action px-4 h-8 flex items-center gap-2 rounded-full text-xs font-bold ${aiDone ? 'opacity-50' : ''}`}
        >
          <Sparkles size={14} className={isProcessing ? "animate-spin" : ""} />
          {isProcessing ? `AI 처리 중... ${progress}%` : aiDone ? 'AI 처리 완료' : 'AI 배경 제거'}
        </button>

        {aiDone && (
          <div className="flex items-center gap-2 ml-4">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-tighter">AI Smart Adjust (Restore/Shrink)</span>
            <input
              type="range"
              min={-100}
              max={100}
              step={1}
              value={aiAdjust}
              onChange={(e) => setAiAdjust(Number(e.target.value))}
              className="w-32 h-1 range-slider"
            />
            <span className="text-[10px] font-mono text-indigo-400 w-10">
              {aiAdjust === 0 ? 'Original' : aiAdjust > 0 ? `+${aiAdjust}` : aiAdjust}
            </span>
          </div>
        )}

        <div className="flex-1" />

        <div className="relative">
          <button
            onClick={() => setShowDownloadPanel(!showDownloadPanel)}
            className="btn-save-result px-4 h-8 flex items-center gap-2 rounded-full text-xs font-black uppercase tracking-tight"
          >
            <Save size={14} />
            Download
          </button>

          {showDownloadPanel && (
            <div className="brush-fill-panel" style={{ position: 'absolute', left: 'auto', right: '0', top: '2.5rem', zIndex: 1000 }}>
              <div className="brush-panel-title">Export Format</div>
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
                Export Now
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── MAIN WORKSPACE (Layout) ─────────────────────────── */}
      <div className="brush-editor-layout">
        {/* Left Toolbar */}
        <div className="brush-editor-sidebar-left bg-[#252526] border-r border-[#111] py-2 flex flex-col items-center gap-1">
          <div className="flex flex-col gap-1 mb-2">
            <button onClick={() => { cancelCrop(); setTool('move'); }} className={`brush-tool-btn ${tool === 'move' ? 'brush-tool-btn-active' : ''}`} title="Move (V)"><Move size={18} /></button>
            <button onClick={() => { cancelCrop(); setTool('marquee-rect'); }} className={`brush-tool-btn ${tool === 'marquee-rect' ? 'brush-tool-btn-active' : ''}`} title="Marquee Rect (M)"><SquareIcon size={18} /></button>
            <button onClick={() => { cancelCrop(); setTool('marquee-circle'); }} className={`brush-tool-btn ${tool === 'marquee-circle' ? 'brush-tool-btn-active' : ''}`} title="Marquee Circle (Shift+M)"><CircleIcon size={18} /></button>
            <button onClick={() => { cancelCrop(); setTool('wand'); }} className={`brush-tool-btn ${tool === 'wand' ? 'brush-tool-btn-active' : ''}`} title="Magic Wand (W)"><Wand2 size={18} /></button>
          </div>
          <div className="w-8 h-[1px] bg-[#333] mb-2" />
          <div className="flex flex-col gap-1 mb-2">
            <button onClick={() => { stopMarching(); cancelCrop(); setTool('crop'); setCropRect(null); cropRectRef.current = null; startMarching(); }} className={`brush-tool-btn ${tool === 'crop' ? 'brush-tool-btn-active' : ''}`} title="Crop (C)"><Crop size={18} /></button>
            <button onClick={() => { stopMarching(); cancelCrop(); setTool('eyedropper'); }} className={`brush-tool-btn ${tool === 'eyedropper' ? 'brush-tool-btn-active' : ''}`} title="Eyedropper (I)"><Pipette size={18} /></button>
          </div>
          <div className="w-8 h-[1px] bg-[#333] mb-2" />
          <div className="flex flex-col gap-1 mb-2">
            <button onClick={() => { stopMarching(); cancelCrop(); setTool('paint'); }} className={`brush-tool-btn ${tool === 'paint' ? 'brush-tool-btn-active' : ''}`} title="Brush (B)"><Brush size={18} /></button>
            <button onClick={() => { stopMarching(); cancelCrop(); setTool('erase'); }} className={`brush-tool-btn ${tool === 'erase' ? 'brush-tool-btn-active' : ''}`} title="Eraser (E)"><Eraser size={18} /></button>
            <button onClick={() => { stopMarching(); cancelCrop(); setTool('restore'); }} className={`brush-tool-btn ${tool === 'restore' ? 'brush-tool-btn-active' : ''}`} title="Restore (R)"><RefreshCcw size={18} /></button>
            <button onClick={() => { stopMarching(); cancelCrop(); setTool('bucket'); }} className={`brush-tool-btn ${tool === 'bucket' ? 'brush-tool-btn-active' : ''}`} title="Fill (G)"><PaintBucket size={18} /></button>
          </div>
          <div className="w-8 h-[1px] bg-[#333] mb-2" />
          <div className="flex flex-col gap-1 mb-2">
            <button onClick={() => { stopMarching(); cancelCrop(); setTool('clone'); }} className={`brush-tool-btn ${tool === 'clone' ? 'brush-tool-btn-active' : ''}`} title="Clone Stamp (S, Alt+Click to set source)"><Stamp size={18} /></button>
            <button onClick={() => { stopMarching(); cancelCrop(); setTool('heal'); }} className={`brush-tool-btn ${tool === 'heal' ? 'brush-tool-btn-active' : ''}`} title="Healing Brush (H, Alt+Click to set source)"><LifeBuoy size={18} /></button>
            <button onClick={() => { stopMarching(); cancelCrop(); setTool('blur-brush'); }} className={`brush-tool-btn ${tool === 'blur-brush' ? 'brush-tool-btn-active' : ''}`} title="Blur Tool"><Droplets size={18} /></button>
          </div>
          <div className="w-8 h-[1px] bg-[#333] mb-2" />
          <div className="flex flex-col gap-1 mb-2">
            <button onClick={() => { stopMarching(); cancelCrop(); setTool('text'); }} className={`brush-tool-btn ${tool === 'text' ? 'brush-tool-btn-active' : ''}`} title="Horizontal Type Tool (T)"><Type size={18} /></button>
          </div>

          <div className="flex-1" />

          {/* Color Picker Section (Photoshop Style) */}
          <div className="flex flex-col items-center gap-2 mb-4 relative">
            <div className="relative w-8 h-8">
              {/* Background Color Square (Decorative for now to match PS look) */}
              <div
                className="absolute bottom-0 right-0 w-5 h-5 border border-[#111] bg-white z-0 rounded-sm shadow-lg"
                title="Background Color (Fixed White for UI)"
              />
              {/* Foreground Color Square (Active) */}
              <div
                className="absolute top-0 left-0 w-6 h-6 border border-[#111] z-10 rounded-sm shadow-md cursor-pointer transition-transform hover:scale-110 active:scale-95"
                style={{ backgroundColor: brushColor }}
                title="Click to change foreground color"
                onClick={() => document.getElementById('global-color-picker')?.click()}
              />
              <input
                id="global-color-picker"
                type="color"
                value={brushColor}
                onChange={(e) => setBrushColor(e.target.value)}
                className="absolute inset-0 opacity-0 pointer-events-none"
              />
            </div>
          </div>

          <div className="w-8 h-[1px] bg-[#333] mb-2" />
          <button onClick={() => setZoom(z => Math.min(8, z + 0.2))} className="brush-tool-btn" title="확대">
            <PlusCircle size={18} />
          </button>
          <button onClick={() => setZoom(z => Math.max(0.1, z - 0.2))} className="brush-tool-btn" title="축소">
            <MinusCircle size={18} />
          </button>
          <button onClick={() => {
            const containerW = containerRef.current?.clientWidth ?? 800;
            const containerH = containerRef.current?.clientHeight ?? 600;
            setZoom(Math.min((containerW - 40) / imageSize.w, (containerH - 40) / imageSize.h, 1));
          }} className="brush-tool-btn" title="맞춤"><Maximize2 size={18} /></button>
        </div>

        {/* Center Canvas Area */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#1e1e1e] relative">
          {/* Options Bar */}
          <div className="h-10 border-b border-[#111] bg-[#2d2d2d] flex items-center px-4 gap-4 overflow-hidden flex-shrink-0">
            <div className="flex items-center gap-2 pr-4 border-r border-[#444]">
              {tool === 'move' && <Move size={16} className="text-gray-400" />}
              {tool === 'marquee-rect' && <SquareIcon size={16} className="text-gray-400" />}
              {tool === 'marquee-circle' && <CircleIcon size={16} className="text-gray-400" />}
              {tool === 'wand' && <Wand2 size={16} className="text-gray-400" />}
              {tool === 'erase' && <Eraser size={16} className="text-gray-400" />}
              {tool === 'restore' && <RefreshCcw size={16} className="text-gray-400" />}
              {tool === 'paint' && <Brush size={16} className="text-gray-400" />}
              {tool === 'bucket' && <PaintBucket size={16} className="text-gray-400" />}
              {tool === 'crop' && <Crop size={16} className="text-gray-400" />}
              {tool === 'clone' && <Stamp size={16} className="text-gray-400" />}
              {tool === 'heal' && <LifeBuoy size={16} className="text-gray-400" />}
              {tool === 'blur-brush' && <Droplets size={16} className="text-gray-400" />}
              {tool === 'text' && <Type size={16} className="text-gray-400" />}
              <span className="text-[10px] font-bold text-gray-500 uppercase">{tool.replace('-', ' ')}</span>
            </div>
            {/* Tool Options */}
            <div className="flex items-center gap-6 overflow-x-auto no-scrollbar">
              {tool === 'wand' && (
                <>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-gray-400">TOLERANCE</span>
                    <input type="range" min={5} max={120} value={tolerance} onChange={(e) => setTolerance(Number(e.target.value))} className="w-24 h-1 range-slider" />
                    <span className="text-[11px] font-mono text-indigo-400 w-8">{tolerance}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-gray-400">SMOOTH</span>
                    <input type="range" min={0} max={20} value={wandSmooth} onChange={(e) => setWandSmooth(Number(e.target.value))} className="w-24 h-1 range-slider" />
                    <span className="text-[11px] font-mono text-indigo-400 w-8">{wandSmooth}</span>
                  </div>
                </>
              )}

              {(tool === 'erase' || tool === 'restore' || tool === 'paint' || tool === 'heal' || tool === 'clone' || tool === 'blur-brush') && (
                <>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-gray-400">SIZE</span>
                    <input type="range" min={5} max={300} value={brushSize} onChange={(e) => setBrushSize(Number(e.target.value))} className="w-24 h-1 range-slider" />
                    <span className="text-[11px] font-mono text-indigo-400 w-10">{brushSize}px</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-gray-400">HARDNESS</span>
                    <input type="range" min={0} max={100} value={brushHardness} onChange={(e) => setBrushHardness(Number(e.target.value))} className="w-20 h-1 range-slider" />
                    <span className="text-[11px] font-mono text-indigo-400 w-10">{brushHardness}%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-gray-400">OPACITY</span>
                    <input type="range" min={10} max={100} value={brushOpacity} onChange={(e) => setBrushOpacity(Number(e.target.value))} className="w-20 h-1 range-slider" />
                    <span className="text-[11px] font-mono text-indigo-400 w-10">{brushOpacity}%</span>
                  </div>
                  {(tool === 'clone' || tool === 'heal') && (
                    <div className="flex items-center gap-2 border-l border-[#444] pl-4">
                      <span className={`text-[9px] font-bold ${hasCloneSource ? 'text-green-400' : 'text-amber-500 animate-pulse'}`}>
                        {hasCloneSource ? 'SOURCE SET' : 'ALT+CLICK SOURCE'}
                      </span>
                    </div>
                  )}
                  <div className="flex gap-1">
                    {['circle', 'square', 'diamond'].map(s => (
                      <button key={s} onClick={() => setBrushShape(s as BrushShape)} className={`w-6 h-6 rounded flex items-center justify-center ${brushShape === s ? 'bg-[#555] text-white' : 'text-gray-500 hover:text-gray-300'}`}>
                        {s === 'circle' && <CircleIcon size={12} />}
                        {s === 'square' && <SquareIcon size={12} />}
                        {s === 'diamond' && <Diamond size={12} />}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {(tool === 'paint' || tool === 'bucket') && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-gray-400">COLOR</span>
                  <input type="color" value={brushColor} onChange={(e) => setBrushColor(e.target.value)} className="w-5 h-5 rounded overflow-hidden border-0 p-0 bg-transparent cursor-pointer" />
                  <span className="text-[11px] font-mono text-gray-400">{brushColor.toUpperCase()}</span>
                </div>
              )}

              {tool === 'bucket' && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-gray-400">TOLERANCE</span>
                  <input type="range" min={5} max={120} value={tolerance} onChange={(e) => setTolerance(Number(e.target.value))} className="w-28 h-1 range-slider" />
                  <span className="text-[11px] font-mono text-indigo-400">{tolerance}</span>
                </div>
              )}

              {tool === 'crop' && (
                <div className="flex items-center gap-4">
                  <span className="text-[10px] font-bold text-gray-400">CROP MODE</span>
                  {cropRect && (
                    <span className="text-[11px] font-mono text-amber-500">{Math.round(cropRect.w)} × {Math.round(cropRect.h)}</span>
                  )}
                  <div className="flex gap-1 text-[10px] font-bold">
                    <button onClick={applyCrop} disabled={!cropRect || cropRect.w < 2} className="px-3 h-6 rounded bg-amber-600 text-white disabled:opacity-30">Commit</button>
                    <button onClick={cancelCrop} className="px-3 h-6 rounded bg-[#444] text-gray-300">Cancel</button>
                  </div>
                </div>
              )}

              {(tool === 'marquee-rect' || tool === 'marquee-circle') && (
                <div className="flex items-center gap-4">
                  <span className="text-[10px] font-bold text-gray-400">SELECTION</span>
                  {cropRect && (
                    <span className="text-[11px] font-mono text-indigo-400">{Math.round(cropRect.w)} × {Math.round(cropRect.h)}</span>
                  )}
                  <div className="flex gap-2">
                    <button onClick={() => setTool('wand')} className="text-[10px] font-bold text-gray-400 hover:text-white underline">Clear Selection</button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Canvas with Rulers */}
          <div className="flex-1 relative overflow-hidden flex flex-col">
            <div className="ruler-corner" />
            <div className="editor-ruler-h" style={{ backgroundImage: horizontalRulerBg, backgroundPositionX: `${-100 - (containerRef.current?.scrollLeft ?? 0)}px` }} />
            <div className="editor-ruler-v" style={{ backgroundImage: verticalRulerBg, backgroundPositionY: `${-100 - (containerRef.current?.scrollTop ?? 0)}px` }} />

            <div
              ref={containerRef}
              className="flex-1 overflow-auto brush-canvas-area p-[100px] no-scrollbar relative"
              style={{ paddingTop: '120px', paddingLeft: '120px' }} // 눈금자 공간 확보
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
                    cursor: (tool === 'wand' || tool === 'crop' || tool === 'bucket' || tool === 'eyedropper' || tool.startsWith('marquee')) ? 'crosshair' : 'none',
                    touchAction: 'none',
                  }}
                />
                <div
                  ref={brushCursorRef}
                  className={`brush-cursor-preview brush-cursor-${brushShape}`}
                  style={{
                    width: (brushShape === 'rect-v' || brushShape === 'rect-v-thin') ? (brushSize / (brushShape === 'rect-v' ? 2 : 4)) * zoom : brushSize * zoom,
                    height: (brushShape === 'rect-h' || brushShape === 'rect-h-thin') ? (brushSize / (brushShape === 'rect-h' ? 2 : 4)) * zoom : brushSize * zoom,
                    display: (tool === 'erase' || tool === 'restore' || tool === 'paint' || tool === 'clone' || tool === 'heal' || tool === 'blur-brush') ? 'block' : 'none',
                    borderColor: tool === 'erase' ? '#ef4444' : tool === 'paint' ? brushColor : (tool === 'blur-brush' || tool === 'heal') ? '#38bdf8' : '#22c55e',
                    backgroundColor: tool === 'erase' ? 'rgba(239,68,68,0.15)' : tool === 'paint' ? `${brushColor}33` : 'rgba(56,189,248,0.15)',
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right Sidebar Panels */}
        <div className="brush-editor-sidebar-right flex flex-col min-w-[240px]">
          {/* History */}
          <div className="h-[250px] flex-shrink-0 flex flex-col border-b border-[#111]">
            <div className="brush-panel-title px-3 py-2 bg-[#333] text-white font-black italic flex justify-between items-center">
              <span>HISTORY</span><Activity size={12} className="text-gray-500" />
            </div>
            <div ref={historyListRef} className="flex-1 overflow-y-auto no-scrollbar p-0 bg-[#222]">
              {historyStack.current.map((item, i) => (
                <button key={i} onClick={() => jumpToHistory(i)} className={`w-full px-4 py-2 text-[11px] flex justify-between items-center border-b border-[#333] transition-colors ${i === historyIndex ? 'bg-[#4f46e5] text-white' : 'text-gray-400 hover:bg-white/5'}`}>
                  <div className="flex items-center gap-2">
                    {item.label === 'Open' ? <Palette size={12} /> : item.label === 'Brush' || item.label === 'Paint' ? <Brush size={12} /> : item.label === 'Crop' ? <Crop size={12} /> : item.label === 'Adjustments' ? <Sliders size={12} /> : <Scissors size={12} />}
                    <span className="font-bold uppercase tracking-tighter">{item.label}</span>
                  </div>
                  <span className="text-[9px] opacity-40 font-mono">{item.time}</span>
                </button>
              ))}
            </div>
          </div>
          {/* Adjustments */}
          <div className="flex-1 flex flex-col border-b border-[#111]">
            <div className="brush-panel-title px-3 py-2 bg-[#333] text-white font-black italic flex justify-between items-center">
              <span>ADJUSTMENTS</span><Sliders size={12} className="text-gray-500" />
            </div>
            <div className="flex-1 overflow-y-auto no-scrollbar p-3 space-y-3 bg-[#282828]">
              <div className="space-y-3">
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between items-center text-[10px] font-bold text-gray-400">
                    <span>BRIGHTNESS</span>
                    <span className="text-indigo-400">{brightness}%</span>
                  </div>
                  <input type="range" min={0} max={200} value={brightness} onChange={(e) => setBrightness(Number(e.target.value))} className="w-full h-1 range-slider" />
                </div>
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between items-center text-[10px] font-bold text-gray-400">
                    <span>CONTRAST</span>
                    <span className="text-indigo-400">{contrast}%</span>
                  </div>
                  <input type="range" min={0} max={200} value={contrast} onChange={(e) => setContrast(Number(e.target.value))} className="w-full h-1 range-slider" />
                </div>
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between items-center text-[10px] font-bold text-gray-400">
                    <span>SATURATION</span>
                    <span className="text-indigo-400">{saturation}%</span>
                  </div>
                  <input type="range" min={0} max={200} value={saturation} onChange={(e) => setSaturation(Number(e.target.value))} className="w-full h-1 range-slider" />
                </div>
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between items-center text-[10px] font-bold text-gray-400">
                    <span>BLUR</span>
                    <span className="text-indigo-400">{blur}px</span>
                  </div>
                  <input type="range" min={0} max={20} value={blur} onChange={(e) => setBlur(Number(e.target.value))} className="w-full h-1 range-slider" />
                </div>
              </div>
              <button
                onClick={applyAdjustments}
                className="w-full h-8 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-black uppercase rounded transition-colors"
              >
                Apply Changes
              </button>
            </div>
          </div>
          {/* Layers */}
          <div className="flex-1 flex flex-col border-b border-[#111]">
            <div className="brush-panel-title px-3 py-2 bg-[#333] text-white font-black italic flex justify-between items-center">
              <span>LAYERS</span><Layers size={12} className="text-gray-500" />
            </div>
            <div className="flex-1 overflow-y-auto no-scrollbar p-3 space-y-6 bg-[#222]">
              {/* 레이어 영역 */}
              <div>
                <span className="text-[10px] font-bold text-gray-500 uppercase mb-2 block">Composite Layers</span>
                <div className="space-y-1">
                  <div className="bg-[#3d3d3d] p-1 rounded flex items-center gap-3 border border-indigo-500/50">
                    <div className="w-10 h-10 bg-black rounded overflow-hidden flex items-center justify-center border border-[#111]">
                      <canvas className="max-w-full max-h-full opacity-70" ref={(el) => {
                        if (el && canvasRef.current) {
                          const ctx = el.getContext('2d');
                          if (ctx) {
                            el.width = canvasRef.current.width;
                            el.height = canvasRef.current.height;
                            ctx.drawImage(canvasRef.current, 0, 0);
                          }
                        }
                      }} />
                    </div>
                    <span className="text-[11px] font-bold text-white uppercase tracking-tighter">Composite view</span>
                  </div>
                </div>
              </div>

              {/* 여백 제거 */}
              <div className="pt-4 border-t border-[#333]">
                <div className="flex justify-between items-center mb-1">
                  <span className="brush-label">AUTO BOUNDS MARGIN</span>
                  <span className="brush-value text-indigo-400">{cropMargin}px</span>
                </div>
                <input type="range" min={0} max={40} value={cropMargin} onChange={(e) => setCropMargin(Number(e.target.value))} className="w-full h-1 range-slider mb-3" />
                <button onClick={autoCrop} className="brush-btn-ghost w-full h-8 text-[10px] font-black italic border border-[#444] rounded uppercase tracking-widest hover:bg-white hover:text-black transition-all">
                  Auto Crop Bounds
                </button>
              </div>

              {/* 배경 프리셋 */}
              <div className="pt-4 border-t border-[#333]">
                <span className="brush-label mb-2 block">Viewport Bg</span>
                <div className="flex flex-wrap gap-2">
                  {BG_PRESETS.map((p, i) => (
                    <button
                      key={i}
                      onClick={() => setBgPreset(i)}
                      className={`w-6 h-6 rounded border transition-all ${bgPreset === i ? 'border-indigo-500 ring-1 ring-indigo-500' : 'border-transparent'} ${p.swatch}`}
                    />
                  ))}
                </div>
              </div>

              <button
                onClick={resetMask}
                className="brush-btn-erase w-full h-8 mt-auto text-[10px] font-black uppercase italic rounded-none border-t border-[#333]"
              >
                Reset All Changes
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Status Bar */}
      <div className="editor-status-bar flex-shrink-0">
        <div className="status-item">
          <span className="text-white/60">X:</span> <span ref={statusBarXRef}>0</span>px
          <span className="text-white/60 ml-2">Y:</span> <span ref={statusBarYRef}>0</span>px
        </div>
        <div className="status-divider" />
        <div className="status-item">
          <span className="text-white/60">DOC:</span> {imageSize.w} × {imageSize.h} px
        </div>
        <div className="status-divider" />
        <div className="status-item">
          <span className="text-white/60">ZOOM:</span> {Math.round(zoom * 100)}%
        </div>
        <div className="flex-1" />
        <div className="status-item text-white/40 italic">
          Photoshop Style Editor v2.0
        </div>
      </div>

      {/* Modals & Hidden Canvases */}
      {showExitConfirm && (
        <div className="brush-modal-overlay">
          <div className="brush-modal-content">
            <div className="brush-modal-header text-orange-400">
              <AlertCircle size={24} />
              <h3 className="text-lg font-bold">작업 취소 확인</h3>
            </div>
            <div className="brush-modal-body text-gray-300">
              <p>현재까지 작업한 모든 내용이 사라집니다.</p>
              <p>정말로 목록으로 돌아가시겠습니까?</p>
            </div>
            <div className="brush-modal-footer">
              <button onClick={() => setShowExitConfirm(false)} className="brush-modal-btn brush-modal-btn-cancel">취소</button>
              <button onClick={onReset} className="brush-modal-btn brush-modal-btn-confirm">돌아가기</button>
            </div>
          </div>
        </div>
      )}

      <div className="hidden">
        <canvas ref={maskSnapshotRef} />
        <canvas ref={tempCanvasRef} />
        <canvas ref={originalRef} />
        <canvas ref={maskRef} />
        <canvas ref={aiResultRef} />
      </div>
    </div>
  );
}
