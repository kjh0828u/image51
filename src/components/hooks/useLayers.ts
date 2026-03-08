import { useCallback, useEffect, useRef, useState } from 'react';

// ── 타입 정의 ─────────────────────────────────────────────────────────────

export type LayerType = 'image' | 'paint' | 'text';
export type BlendMode = 'source-over'; // Phase 1은 Normal만

export interface TextStyle {
  fontFamily: string;
  fontSize: number;
  fontWeight: 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';
  color: string;
  align: 'left' | 'center' | 'right';
  letterSpacing: number; // px (canvas image space)
  lineHeight: number;    // 배수 (1.0 = fontSize, 1.3 = default)
}

export interface Layer {
  id: string;
  name: string;
  type: LayerType;
  visible: boolean;
  opacity: number;       // 0–100
  blendMode: BlendMode;
  locked: boolean;
  // 픽셀 레이어 (image / paint) 전용
  originalCanvas: HTMLCanvasElement | null;
  maskCanvas: HTMLCanvasElement | null;
  // 위치 오프셋 (move 툴용)
  x: number;
  y: number;
  // 텍스트 레이어 전용
  textContent: string;
  textStyle: TextStyle;
}

// 히스토리 엔트리: 레이어 배열 전체의 직렬화
export interface LayerHistoryEntry {
  layers: LayerSnapshot[];
  activeLayerId: string;
  label: string;
  time: string;
}

// 직렬화 가능한 레이어 스냅샷
// ImageBitmap: GPU 텍스처 저장 — drawImage보다 빠르고, 생성은 비동기 (메인 스레드 블로킹 없음)
export interface LayerSnapshot {
  id: string;
  name: string;
  type: LayerType;
  visible: boolean;
  opacity: number;
  blendMode: BlendMode;
  locked: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
  // 픽셀 데이터 — ImageBitmap (비동기 GPU 복사)
  originalBitmap: ImageBitmap | null;
  maskBitmap: ImageBitmap | null;
  // 텍스트
  textContent: string;
  textStyle: TextStyle;
}

// ── 유틸 ──────────────────────────────────────────────────────────────────

function makeId(): string {
  return Math.random().toString(36).substring(2, 9);
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

const DEFAULT_TEXT_STYLE: TextStyle = {
  fontFamily: 'sans-serif',
  fontSize: 48,
  fontWeight: 'bold',
  fontStyle: 'normal',
  color: '#ffffff',
  align: 'left',
  letterSpacing: 0,
  lineHeight: 1.3,
};

// 레이어 → 비동기 스냅샷 (ImageBitmap: GPU 비동기 복사, 메인 스레드 블로킹 없음)
async function layerToSnapshotAsync(layer: Layer): Promise<LayerSnapshot> {
  const w = layer.originalCanvas?.width ?? 0;
  const h = layer.originalCanvas?.height ?? 0;

  const [originalBitmap, maskBitmap] = await Promise.all([
    layer.originalCanvas && w > 0
      ? createImageBitmap(layer.originalCanvas)
      : Promise.resolve(null),
    layer.maskCanvas && w > 0
      ? createImageBitmap(layer.maskCanvas)
      : Promise.resolve(null),
  ]);

  return {
    id: layer.id,
    name: layer.name,
    type: layer.type,
    visible: layer.visible,
    opacity: layer.opacity,
    blendMode: layer.blendMode,
    locked: layer.locked,
    x: layer.x,
    y: layer.y,
    w,
    h,
    originalBitmap,
    maskBitmap,
    textContent: layer.textContent,
    textStyle: { ...layer.textStyle },
  };
}

// 스냅샷 → 레이어 복원 (ImageBitmap → canvas drawImage)
function snapshotToLayer(snap: LayerSnapshot, docW: number, docH: number): Layer {
  const w = snap.w || docW;
  const h = snap.h || docH;

  const originalCanvas = makeCanvas(w, h);
  const maskCanvas = makeCanvas(w, h);

  if (snap.originalBitmap) {
    originalCanvas.getContext('2d')!.drawImage(snap.originalBitmap, 0, 0);
  }
  if (snap.maskBitmap) {
    maskCanvas.getContext('2d')!.drawImage(snap.maskBitmap, 0, 0);
  }

  return {
    id: snap.id,
    name: snap.name,
    type: snap.type,
    visible: snap.visible,
    opacity: snap.opacity,
    blendMode: snap.blendMode,
    locked: snap.locked,
    x: snap.x,
    y: snap.y,
    originalCanvas,
    maskCanvas,
    textContent: snap.textContent,
    textStyle: { ...snap.textStyle },
  };
}

// ── 훅 ────────────────────────────────────────────────────────────────────

export function useLayers(docW: number, docH: number) {
  const [layers, setLayers] = useState<Layer[]>([]);
  const [activeLayerId, setActiveLayerId] = useState<string>('');
  const [historyVersion, setHistoryVersion] = useState(0);

  const historyStack = useRef<LayerHistoryEntry[]>([]);
  const historyIndexRef = useRef(-1);

  // undo/redo 버튼 DOM ref — setState 없이 직접 disabled 토글 (리렌더 0)
  const undoBtnRef = useRef<HTMLButtonElement | null>(null);
  const redoBtnRef = useRef<HTMLButtonElement | null>(null);

  const syncUndoRedoBtns = useCallback(() => {
    const idx = historyIndexRef.current;
    const len = historyStack.current.length;
    if (undoBtnRef.current) undoBtnRef.current.disabled = idx <= 0;
    if (redoBtnRef.current) redoBtnRef.current.disabled = idx >= len - 1;
  }, []);

  // ── Pre-snapshot: mousedown 시점에 미리 찍어두는 Promise ──────────────
  const pendingSnapshotRef = useRef<Promise<LayerSnapshot> | null>(null);
  const pendingSnapshotLayerIdRef = useRef<string | null>(null);

  // ── 히스토리 저장 ──────────────────────────────────────────────────────

  /** mousedown 시 즉시 호출 — 활성 레이어를 백그라운드에서 스냅샷 시작 */
  const prepareSnapshot = useCallback((layerId: string, layer: Layer) => {
    pendingSnapshotLayerIdRef.current = layerId;
    pendingSnapshotRef.current = layerToSnapshotAsync(layer);
  }, []);

  const saveSnapshot = useCallback(async (
    currentLayers: Layer[],
    currentActiveId: string,
    label: string,
    changedLayerId?: string
  ) => {
    const now = new Date();
    const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

    const prevEntry = historyStack.current[historyIndexRef.current];
    let snapshots: LayerSnapshot[];

    if (changedLayerId && prevEntry) {
      const usePending = pendingSnapshotRef.current
        && pendingSnapshotLayerIdRef.current === changedLayerId;
      const newSnap = usePending
        ? await pendingSnapshotRef.current!
        : await layerToSnapshotAsync(currentLayers.find(l => l.id === changedLayerId)!);
      pendingSnapshotRef.current = null;
      pendingSnapshotLayerIdRef.current = null;

      snapshots = currentLayers.map(layer => {
        if (layer.id === changedLayerId) return { ...newSnap, x: layer.x, y: layer.y };
        return prevEntry.layers.find(s => s.id === layer.id)
          ?? {
          id: layer.id, name: layer.name, type: layer.type, visible: layer.visible,
          opacity: layer.opacity, blendMode: layer.blendMode, locked: layer.locked,
          x: layer.x, y: layer.y, w: 0, h: 0,
          originalBitmap: null, maskBitmap: null,
          textContent: layer.textContent, textStyle: { ...layer.textStyle }
        };
      });
    } else {
      snapshots = await Promise.all(currentLayers.map(layerToSnapshotAsync));
    }

    const newIdx = historyIndexRef.current + 1;
    let oldStack = historyStack.current.slice(newIdx);

    // 덮어씌워지는(Redo 불가능해지는) 히스토리의 이미지 메모리 해제
    for (const entry of oldStack) {
      for (const snap of entry.layers) {
        snap.originalBitmap?.close();
        snap.maskBitmap?.close();
      }
    }

    let newStack = historyStack.current.slice(0, newIdx);
    newStack.push({ layers: snapshots, activeLayerId: currentActiveId, label, time });

    historyStack.current = newStack;
    historyIndexRef.current = historyStack.current.length - 1;

    // UI 업데이트를 지연시켜 메인 스레드 블로킹 분산 (렉 방지 핵심)
    setTimeout(() => {
      setHistoryVersion(v => v + 1);
      syncUndoRedoBtns();
    }, 0);
  }, [syncUndoRedoBtns]);

  // ── 히스토리 복원 ──────────────────────────────────────────────────────

  const jumpToHistory = useCallback((index: number) => {
    if (index < 0 || index >= historyStack.current.length) return;
    const entry = historyStack.current[index]!;
    const restored = entry.layers.map(snap => snapshotToLayer(snap, docW, docH));
    historyIndexRef.current = index;
    setHistoryVersion(v => v + 1);
    syncUndoRedoBtns();
    setActiveLayerId(entry.activeLayerId);
    setLayers(restored);
  }, [docW, docH, syncUndoRedoBtns]);

  const undo = useCallback(() => {
    const prev = historyIndexRef.current;
    if (prev <= 0) return;
    const newIdx = prev - 1;
    const entry = historyStack.current[newIdx]!;
    const restored = entry.layers.map(snap => snapshotToLayer(snap, docW, docH));
    historyIndexRef.current = newIdx;
    setHistoryVersion(v => v + 1);
    syncUndoRedoBtns();
    setActiveLayerId(entry.activeLayerId);
    setLayers(restored);
  }, [docW, docH, syncUndoRedoBtns]);

  const redo = useCallback(() => {
    const prev = historyIndexRef.current;
    if (prev >= historyStack.current.length - 1) return;
    const newIdx = prev + 1;
    const entry = historyStack.current[newIdx]!;
    const restored = entry.layers.map(snap => snapshotToLayer(snap, docW, docH));
    historyIndexRef.current = newIdx;
    setHistoryVersion(v => v + 1);
    syncUndoRedoBtns();
    setActiveLayerId(entry.activeLayerId);
    setLayers(restored);
  }, [docW, docH, syncUndoRedoBtns]);

  // canUndo/canRedo는 ref 기반 (렌더타임 계산용, 버튼 초기 disabled 세팅용)
  const canUndo = historyIndexRef.current > 0;
  const canRedo = historyIndexRef.current < historyStack.current.length - 1;

  // ── 레이어 작업 헬퍼 (히스토리 자동 저장 버전) ──────────────────────

  /** 레이어 배열 + activeId를 함께 변경하고 히스토리 저장 */
  const commitLayers = useCallback((
    nextLayers: Layer[],
    nextActiveId: string,
    label: string,
    changedLayerId?: string
  ) => {
    setLayers(nextLayers);
    setActiveLayerId(nextActiveId);
    // saveSnapshot은 이제 비동기로 처리되며, changedLayerId 전달 시 비약적으로 빠름
    saveSnapshot(nextLayers, nextActiveId, label, changedLayerId);
  }, [saveSnapshot]);

  // ── 레이어 생성 ────────────────────────────────────────────────────────

  /** 이미지(HTMLImageElement / HTMLCanvasElement)로부터 image 레이어 생성 */
  const addImageLayer = useCallback((
    source: HTMLImageElement | HTMLCanvasElement,
    name: string,
    currentLayers: Layer[],
    currentActiveId: string
  ) => {
    const w = source instanceof HTMLImageElement ? source.naturalWidth : source.width;
    const h = source instanceof HTMLImageElement ? source.naturalHeight : source.height;

    const originalCanvas = makeCanvas(w, h);
    originalCanvas.getContext('2d')!.drawImage(source, 0, 0);

    // 마스크: 원본 알파 채널 기반으로 초기화
    const maskCanvas = makeCanvas(w, h);
    const oCtx = originalCanvas.getContext('2d', { willReadFrequently: true })!;
    const imgData = oCtx.getImageData(0, 0, w, h);
    const mCtx = maskCanvas.getContext('2d')!;
    const mData = mCtx.createImageData(w, h);
    for (let i = 0; i < imgData.data.length; i += 4) {
      mData.data[i + 3] = imgData.data[i + 3]!;
    }
    mCtx.putImageData(mData, 0, 0);

    const newLayer: Layer = {
      id: makeId(),
      name,
      type: 'image',
      visible: true,
      opacity: 100,
      blendMode: 'source-over',
      locked: false,
      originalCanvas,
      maskCanvas,
      x: 0,
      y: 0,
      textContent: '',
      textStyle: { ...DEFAULT_TEXT_STYLE },
    };

    const nextLayers = [...currentLayers, newLayer];
    commitLayers(nextLayers, newLayer.id, `Add Layer: ${name}`);
    return newLayer;
  }, [commitLayers]);

  /** 빈 페인트 레이어 추가 */
  const addPaintLayer = useCallback((
    name: string,
    currentLayers: Layer[],
    currentActiveId: string
  ) => {
    const w = docW || 800;
    const h = docH || 600;

    const originalCanvas = makeCanvas(w, h);
    const maskCanvas = makeCanvas(w, h);
    // 빈 페인트 레이어: 마스크 완전 불투명
    const mCtx = maskCanvas.getContext('2d')!;
    const mData = mCtx.createImageData(w, h);
    for (let i = 0; i < mData.data.length; i += 4) {
      mData.data[i + 3] = 255;
    }
    mCtx.putImageData(mData, 0, 0);

    const newLayer: Layer = {
      id: makeId(),
      name,
      type: 'paint',
      visible: true,
      opacity: 100,
      blendMode: 'source-over',
      locked: false,
      originalCanvas,
      maskCanvas,
      x: 0,
      y: 0,
      textContent: '',
      textStyle: { ...DEFAULT_TEXT_STYLE },
    };

    const nextLayers = [...currentLayers, newLayer];
    commitLayers(nextLayers, newLayer.id, `Add Layer: ${name}`);
    return newLayer;
  }, [docW, docH, commitLayers]);

  /** 텍스트 레이어 추가 */
  const addTextLayer = useCallback((
    textContent: string,
    textStyle: Partial<TextStyle>,
    x: number,
    y: number,
    currentLayers: Layer[],
    currentActiveId: string
  ) => {
    const newLayer: Layer = {
      id: makeId(),
      name: `Text: "${textContent.substring(0, 12)}"`,
      type: 'text',
      visible: true,
      opacity: 100,
      blendMode: 'source-over',
      locked: false,
      originalCanvas: null,
      maskCanvas: null,
      x,
      y,
      textContent,
      textStyle: { ...DEFAULT_TEXT_STYLE, ...textStyle },
    };

    const nextLayers = [...currentLayers, newLayer];
    commitLayers(nextLayers, newLayer.id, `Add Text`);
    return newLayer;
  }, [commitLayers]);

  // ── 레이어 속성 변경 ───────────────────────────────────────────────────

  const removeLayer = useCallback((
    id: string,
    currentLayers: Layer[],
    currentActiveId: string
  ) => {
    const nextLayers = currentLayers.filter(l => l.id !== id);
    let nextActiveId = currentActiveId;
    if (currentActiveId === id) {
      nextActiveId = nextLayers.length > 0 ? nextLayers[nextLayers.length - 1]!.id : '';
    }
    commitLayers(nextLayers, nextActiveId, 'Delete Layer');
  }, [commitLayers]);

  const reorderLayer = useCallback((
    id: string,
    newIndex: number,
    currentLayers: Layer[],
    currentActiveId: string
  ) => {
    const idx = currentLayers.findIndex(l => l.id === id);
    if (idx < 0) return;
    const nextLayers = [...currentLayers];
    const [moved] = nextLayers.splice(idx, 1);
    nextLayers.splice(newIndex, 0, moved!);
    commitLayers(nextLayers, currentActiveId, 'Reorder Layers');
  }, [commitLayers]);

  const setLayerVisible = useCallback((
    id: string,
    visible: boolean,
    currentLayers: Layer[]
  ) => {
    const nextLayers = currentLayers.map(l => l.id === id ? { ...l, visible } : l);
    setLayers(nextLayers);
  }, []);

  const setLayerOpacity = useCallback((
    id: string,
    opacity: number,
    currentLayers: Layer[],
    currentActiveId: string
  ) => {
    const nextLayers = currentLayers.map(l => l.id === id ? { ...l, opacity } : l);
    commitLayers(nextLayers, currentActiveId, 'Layer Opacity');
  }, [commitLayers]);

  const renameLayer = useCallback((
    id: string,
    name: string,
    currentLayers: Layer[],
    currentActiveId: string
  ) => {
    const nextLayers = currentLayers.map(l => l.id === id ? { ...l, name } : l);
    commitLayers(nextLayers, currentActiveId, 'Rename Layer');
  }, [commitLayers]);

  /** 텍스트 레이어 내용/스타일 업데이트 */
  const updateTextLayer = useCallback((
    id: string,
    textContent: string,
    textStyle: TextStyle,
    x: number,
    y: number,
    currentLayers: Layer[],
    currentActiveId: string
  ) => {
    const nextLayers = currentLayers.map(l =>
      l.id === id
        ? { ...l, textContent, textStyle: { ...textStyle }, x, y, name: `Text: "${textContent.substring(0, 12)}"` }
        : l
    );
    commitLayers(nextLayers, currentActiveId, 'Edit Text', id);
  }, [commitLayers]);

  /** 레이어 이동 (x, y 오프셋) - 드래그 중에는 히스토리 저장 없이 실시간 */
  const moveLayerPosition = useCallback((
    id: string,
    x: number,
    y: number,
    currentLayers: Layer[]
  ) => {
    const nextLayers = currentLayers.map(l => l.id === id ? { ...l, x, y } : l);
    setLayers(nextLayers);
    return nextLayers;
  }, []);

  /** 레이어 이동 완료 시 히스토리 저장 */
  const commitLayerMove = useCallback((
    currentLayers: Layer[],
    currentActiveId: string
  ) => {
    // changedLayerId 추가 (성능 최적화: 이동한 레이어 하나만 스냅샷)
    saveSnapshot(currentLayers, currentActiveId, 'Move Layer', currentActiveId);
  }, [saveSnapshot]);

  // ── 병합 ──────────────────────────────────────────────────────────────

  /** 아래 레이어에 병합 (Merge Down) */
  const mergeDown = useCallback((
    id: string,
    currentLayers: Layer[],
    currentActiveId: string,
    compositeTemp: (layers: Layer[]) => ImageData | null
  ) => {
    const idx = currentLayers.findIndex(l => l.id === id);
    if (idx <= 0) return; // 맨 아래 레이어는 병합 불가

    const upper = currentLayers[idx]!;
    const lower = currentLayers[idx - 1]!;

    if (!lower.originalCanvas || !upper.originalCanvas) return;

    const w = Math.max(lower.originalCanvas.width, upper.originalCanvas.width);
    const h = Math.max(lower.originalCanvas.height, upper.originalCanvas.height);

    const mergedOriginal = makeCanvas(w, h);
    const mergedMask = makeCanvas(w, h);
    const mCtx = mergedMask.getContext('2d')!;

    // 마스크: 완전 불투명
    const mData = mCtx.createImageData(w, h);
    for (let i = 0; i < mData.data.length; i += 4) mData.data[i + 3] = 255;
    mCtx.putImageData(mData, 0, 0);

    // 픽셀: lower → upper 순으로 그리기
    const ctx = mergedOriginal.getContext('2d')!;

    // lower composite
    const tempL = makeCanvas(lower.originalCanvas.width, lower.originalCanvas.height);
    const tCtxL = tempL.getContext('2d')!;
    tCtxL.drawImage(lower.originalCanvas, 0, 0);
    tCtxL.globalCompositeOperation = 'destination-in';
    if (lower.maskCanvas) tCtxL.drawImage(lower.maskCanvas, 0, 0);
    ctx.globalAlpha = lower.opacity / 100;
    ctx.drawImage(tempL, lower.x, lower.y);

    // upper composite
    const tempU = makeCanvas(upper.originalCanvas.width, upper.originalCanvas.height);
    const tCtxU = tempU.getContext('2d')!;
    tCtxU.drawImage(upper.originalCanvas, 0, 0);
    tCtxU.globalCompositeOperation = 'destination-in';
    if (upper.maskCanvas) tCtxU.drawImage(upper.maskCanvas, 0, 0);
    ctx.globalAlpha = upper.opacity / 100;
    ctx.drawImage(tempU, upper.x, upper.y);
    ctx.globalAlpha = 1;

    const mergedLayer: Layer = {
      ...lower,
      id: makeId(),
      name: `${lower.name} (merged)`,
      type: 'image',
      originalCanvas: mergedOriginal,
      maskCanvas: mergedMask,
      x: 0,
      y: 0,
      opacity: 100,
    };

    const nextLayers = [
      ...currentLayers.slice(0, idx - 1),
      mergedLayer,
      ...currentLayers.slice(idx + 1),
    ];
    commitLayers(nextLayers, mergedLayer.id, 'Merge Down');
  }, [commitLayers]);

  /** 전체 평탄화 (Flatten) */
  const flattenAll = useCallback((
    currentLayers: Layer[],
    currentActiveId: string,
    docWidth: number,
    docHeight: number
  ) => {
    const w = docWidth || docW;
    const h = docHeight || docH;

    const mergedOriginal = makeCanvas(w, h);
    const mergedMask = makeCanvas(w, h);

    const ctx = mergedOriginal.getContext('2d')!;
    const mCtx = mergedMask.getContext('2d')!;

    for (const layer of currentLayers) {
      if (!layer.visible || !layer.originalCanvas) continue;
      const temp = makeCanvas(layer.originalCanvas.width, layer.originalCanvas.height);
      const tCtx = temp.getContext('2d')!;
      tCtx.drawImage(layer.originalCanvas, 0, 0);
      if (layer.maskCanvas) {
        tCtx.globalCompositeOperation = 'destination-in';
        tCtx.drawImage(layer.maskCanvas, 0, 0);
      }
      ctx.globalAlpha = layer.opacity / 100;
      ctx.drawImage(temp, layer.x, layer.y);
    }
    ctx.globalAlpha = 1;

    // 마스크: 완전 불투명
    const mData = mCtx.createImageData(w, h);
    for (let i = 0; i < mData.data.length; i += 4) mData.data[i + 3] = 255;
    mCtx.putImageData(mData, 0, 0);

    const flattened: Layer = {
      id: makeId(),
      name: 'Background',
      type: 'image',
      visible: true,
      opacity: 100,
      blendMode: 'source-over',
      locked: false,
      originalCanvas: mergedOriginal,
      maskCanvas: mergedMask,
      x: 0,
      y: 0,
      textContent: '',
      textStyle: { ...DEFAULT_TEXT_STYLE },
    };

    commitLayers([flattened], flattened.id, 'Flatten Image');
  }, [docW, docH, commitLayers]);

  // ── 픽셀 작업용 - 활성 레이어 캔버스 getter ──────────────────────────

  const getActiveLayer = useCallback((): Layer | null => {
    return layers.find(l => l.id === activeLayerId) ?? null;
  }, [layers, activeLayerId]);

  /** 활성 레이어의 original/mask ref를 얻음 (기존 도구들이 ref처럼 사용) */
  const getActiveLayerCanvases = useCallback((): {
    original: HTMLCanvasElement | null;
    mask: HTMLCanvasElement | null;
  } => {
    const active = layers.find(l => l.id === activeLayerId);
    return {
      original: active?.originalCanvas ?? null,
      mask: active?.maskCanvas ?? null,
    };
  }, [layers, activeLayerId]);

  /** 픽셀 작업 완료 후 강제 히스토리 저장 (erase/paint/wand 등 툴에서 호출)
   * - React state의 최신값을 참조하기 위해 functional update 패턴 사용
   */
  const layersRef = useRef<Layer[]>([]);
  const activeLayerIdRef = useRef<string>('');
  useEffect(() => { layersRef.current = layers; }, [layers]);
  useEffect(() => { activeLayerIdRef.current = activeLayerId; }, [activeLayerId]);

  const savePixelSnapshot = useCallback((label: string) => {
    // changedLayerId 전달 → 활성 레이어 하나만 스냅샷, 나머지 재사용 → 매우 빠름
    saveSnapshot(layersRef.current, activeLayerIdRef.current, label, activeLayerIdRef.current);
  }, [saveSnapshot]);

  // ── 초기화 ────────────────────────────────────────────────────────────

  const resetLayers = useCallback(() => {
    setLayers([]);
    setActiveLayerId('');
    historyStack.current = [];
    historyIndexRef.current = -1;
    setHistoryVersion(0);
    syncUndoRedoBtns();
  }, [syncUndoRedoBtns]);

  return {
    // 상태
    layers,
    setLayers,
    activeLayerId,
    setActiveLayerId,
    historyVersion,
    historyStack,
    historyIndexRef,
    canUndo,
    canRedo,
    undoBtnRef,
    redoBtnRef,

    // 히스토리
    saveSnapshot,
    jumpToHistory,
    undo,
    redo,

    // 레이어 CRUD
    addImageLayer,
    addPaintLayer,
    addTextLayer,
    removeLayer,
    reorderLayer,
    setLayerVisible,
    setLayerOpacity,
    renameLayer,
    updateTextLayer,

    // 이동
    moveLayerPosition,
    commitLayerMove,

    // 병합
    mergeDown,
    flattenAll,

    // 현재 레이어 접근
    getActiveLayer,
    getActiveLayerCanvases,
    prepareSnapshot,
    savePixelSnapshot,

    // 초기화
    resetLayers,
    commitLayers,
  };
}
