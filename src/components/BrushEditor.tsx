import { useCallback, useEffect, useRef, useState, memo } from 'react';
import { cn } from '@/lib/utils';
import {
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
  Droplets,
  ImagePlus,
  Plus,
  X,
  Eye,
  EyeOff,
  ChevronUp,
  ChevronDown,
  Merge,
  AlignLeft,
  AlignCenter,
  AlignRight,
  ArrowLeftRight,
} from 'lucide-react';
import { Glass } from './Glass';
import {
  blurAndThresholdBinary,
  expandSelection,
  floodFillSelect,
  getAutoCropBounds,
  hasTransparency
} from '../lib/canvasUtils';
import { useBrushConfig, Tool, BrushShape } from './hooks/useBrushConfig';
import { useCanvasCore, renderTextLayerToCtx } from './hooks/useCanvasCore';
import { useLayers, type Layer, type TextStyle, type LayerHistoryEntry } from './hooks/useLayers';
import { useSelectionTools } from './hooks/useSelectionTools';
import { useImageProcessing } from '@/hooks/useImageProcessing';
import { getDownloadFilename } from '@/lib/fileUtils';
import { useTranslation } from 'react-i18next';

interface BrushEditorProps {
  imageUrl: string;
  originalName: string;
  onImageChange: (file: File) => void;
  onReset: () => void;
  // Tab Props
  tabs?: { id: string; name: string; url: string }[];
  activeTabId?: string | null;
  setActiveTabId?: (id: string) => void;
  onCloseTab?: (id: string, e: React.MouseEvent) => void;
  onAddNewTab?: () => void;
  tabId?: string;
}

// 드롭 다이얼로그 상태
interface DropDialogState {
  file: File;
  visible: boolean;
}

const EYEDROPPER_CURSOR = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m2 22 1-1h3l9-9'/%3E%3Cpath d='M3 21v-3l9-9'/%3E%3Cpath d='m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l-3-3Z'/%3E%3C/svg%3E") 0 22, url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m2 22 1-1h3l9-9'/%3E%3Cpath d='M3 21v-3l9-9'/%3E%3Cpath d='m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l-3-3Z'/%3E%3C/svg%3E") 0 22, crosshair`;

// ── 컬러 피커 팝업 컴포넌트 (직접 구현) ───────────────────────────────────────────────
interface ColorPickerPopupProps {
  color: string;
  onChange: (hex: string) => void;
  size?: number;
  className?: string;
  title?: string;
}

// hex to hsv 변환
function hexToHsv(hex: string): { h: number; s: number; v: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;
  if (d !== 0) {
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return { h: h * 360, s: s * 100, v: v * 100 };
}

// hsv to hex 변환
function hsvToHex(h: number, s: number, v: number): string {
  s /= 100; v /= 100;
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  const toHex = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

const ColorPickerPopup = memo(({ color, onChange, size = 24, className = '', title }: ColorPickerPopupProps) => {
  const { t } = useTranslation();
  const displayTitle = title || t('common.color_picker');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [hexInput, setHexInput] = useState(color);

  // HSV 상태 (ref로 관리하여 드래그 중 리렌더 방지)
  const hsvRef = useRef(hexToHsv(color));
  const [hue, setHue] = useState(hsvRef.current.h);
  const [sat, setSat] = useState(hsvRef.current.s);
  const [val, setVal] = useState(hsvRef.current.v);
  const isDraggingRef = useRef(false);

  // 외부 색상 변경 동기화 (팝업 닫혀있을 때만)
  useEffect(() => {
    if (!isOpen) {
      const newHsv = hexToHsv(color);
      hsvRef.current = newHsv;
      setHue(newHsv.h);
      setSat(newHsv.s);
      setVal(newHsv.v);
      setHexInput(color);
    }
  }, [color, isOpen]);

  // 외부 클릭 시 닫기
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node) &&
        popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  // 팝업 위치 계산
  const [popupPosition, setPopupPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!isOpen || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const popupWidth = 280;
    const popupHeight = 165;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceRight = window.innerWidth - rect.left;
    const showAbove = spaceBelow < popupHeight;
    const showLeft = spaceRight < popupWidth;

    setPopupPosition({
      top: showAbove ? rect.top - popupHeight - 8 : rect.bottom + 8,
      left: showLeft ? rect.right - popupWidth : rect.left
    });
  }, [isOpen]);

  // 드래그 종료 시 onChange 호출
  const commitColor = useCallback(() => {
    const hex = hsvToHex(hsvRef.current.h, hsvRef.current.s, hsvRef.current.v);
    setHexInput(hex);
    onChange(hex);
  }, [onChange]);

  // 채도/명도 영역 클릭/드래그
  const svRef = useRef<HTMLDivElement>(null);

  const handleSvInteraction = useCallback((clientX: number, clientY: number) => {
    if (!svRef.current) return;
    const rect = svRef.current.getBoundingClientRect();
    const newSat = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    const newVal = Math.max(0, Math.min(100, 100 - ((clientY - rect.top) / rect.height) * 100));
    hsvRef.current.s = newSat;
    hsvRef.current.v = newVal;
    setSat(newSat);
    setVal(newVal);
  }, []);

  // Hue 슬라이더 (세로)
  const hueRef = useRef<HTMLDivElement>(null);

  const handleHueInteraction = useCallback((clientY: number) => {
    if (!hueRef.current) return;
    const rect = hueRef.current.getBoundingClientRect();
    const newHue = Math.max(0, Math.min(360, ((clientY - rect.top) / rect.height) * 360));
    hsvRef.current.h = newHue;
    setHue(newHue);
  }, []);

  // HEX 입력 변경
  const handleHexChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value;
    if (!val.startsWith('#')) val = '#' + val;
    setHexInput(val);
    if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
      const newHsv = hexToHsv(val);
      hsvRef.current = newHsv;
      setHue(newHsv.h);
      setSat(newHsv.s);
      setVal(newHsv.v);
      onChange(val);
    }
  }, [onChange]);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div
        className="rounded border border-[#555] cursor-pointer transition-transform hover:scale-110 active:scale-95 shadow-md"
        style={{ width: size, height: size, backgroundColor: color }}
        title={displayTitle}
        onClick={() => setIsOpen(v => !v)}
      />
      {isOpen && (
        <div ref={popupRef} className="fixed z-[9999] color-picker-popup" style={{ top: popupPosition.top, left: popupPosition.left }}>
          <div className="color-picker-content">
            {/* 채도/명도 영역 */}
            <div
              ref={svRef}
              className="color-picker-sv"
              style={{
                backgroundColor: `hsl(${hue}, 100%, 50%)`
              }}
              onMouseDown={(e) => {
                isDraggingRef.current = true;
                handleSvInteraction(e.clientX, e.clientY);
              }}
              onMouseMove={(e) => {
                if (isDraggingRef.current) handleSvInteraction(e.clientX, e.clientY);
              }}
              onMouseUp={() => {
                isDraggingRef.current = false;
                commitColor();
              }}
              onMouseLeave={() => {
                if (isDraggingRef.current) {
                  isDraggingRef.current = false;
                  commitColor();
                }
              }}
            >
              <div className="color-picker-sv-white" />
              <div className="color-picker-sv-black" />
              <div className="color-picker-cursor" style={{ left: `${sat}%`, top: `${100 - val}%` }} />
            </div>

            {/* Hue 슬라이더 (세로) */}
            <div
              ref={hueRef}
              className="color-picker-hue"
              onMouseDown={(e) => {
                isDraggingRef.current = true;
                handleHueInteraction(e.clientY);
              }}
              onMouseMove={(e) => {
                if (isDraggingRef.current) handleHueInteraction(e.clientY);
              }}
              onMouseUp={() => {
                isDraggingRef.current = false;
                commitColor();
              }}
              onMouseLeave={() => {
                if (isDraggingRef.current) {
                  isDraggingRef.current = false;
                  commitColor();
                }
              }}
            >
              <div className="color-picker-hue-cursor" style={{ top: `${(hue / 360) * 100}%` }} />
            </div>

            {/* HEX 입력 */}
            <div className="color-picker-input-row">
              <label htmlFor="hex-input" className="color-picker-label">HEX</label>
              <input
                id="hex-input"
                type="text"
                value={hexInput}
                onChange={handleHexChange}
                className="color-picker-hex-input"
                maxLength={7}
              />
              <div className="color-picker-preview" style={{ backgroundColor: color }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

// ── 최적화된 레이어 썸네일 컴포넌트 ──────────────────────────────────
const LayerThumbnail = memo(({ layer, subscribeHistory }: { layer: Layer, subscribeHistory: (fn: () => void) => () => void }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tick, setTick] = useState(0);

  // 히스토리 변경(픽셀 작업 완료 등) 시에만 썸네일 리렌더 트리거
  useEffect(() => {
    return subscribeHistory(() => setTick(t => t + 1));
  }, [subscribeHistory]);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el || !layer.originalCanvas || !layer.maskCanvas) return;

    const ctx = el.getContext('2d', { alpha: true })!;
    const w = layer.originalCanvas.width;
    const h = layer.originalCanvas.height;
    if (w === 0 || h === 0) return;

    ctx.clearRect(0, 0, 36, 36);
    const scale = Math.min(36 / w, 36 / h);
    const dw = w * scale;
    const dh = h * scale;
    const dx = (36 - dw) / 2;
    const dy = (36 - dh) / 2;

    ctx.save();
    ctx.drawImage(layer.originalCanvas, dx, dy, dw, dh);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(layer.maskCanvas, dx, dy, dw, dh);
    ctx.restore();
  }, [layer.id, layer.originalCanvas, layer.maskCanvas, tick]);

  return <canvas ref={canvasRef} width={36} height={36} className="pointer-events-none" />;
});
LayerThumbnail.displayName = 'LayerThumbnail';

// 레이어 개별 아이템 (분리됨)
const LayerItem = memo(({ layer, active, onSelect, onSetVisible, layerDragOver, layerDragIdRef, setLayerDragOver, reorderLayer, subscribeHistory }: any) => {
  const { t } = useTranslation();
  const isDragTarget = layerDragOver === layer.id && layerDragIdRef.current !== layer.id;
  return (
    <div
      draggable
      className={cn('layer-item', active && 'layer-item-active', isDragTarget && 'layer-item-drag-over')}
      onClick={() => onSelect(layer.id)}
      onDragStart={() => { layerDragIdRef.current = layer.id; }}
      onDragOver={(e) => { e.preventDefault(); setLayerDragOver(layer.id); }}
      onDragLeave={() => setLayerDragOver(null)}
      onDrop={(e) => {
        e.preventDefault();
        setLayerDragOver(null);
        const fromId = layerDragIdRef.current;
        layerDragIdRef.current = null;
        reorderLayer(fromId, 0);
      }}
      onDragEnd={() => { layerDragIdRef.current = null; setLayerDragOver(null); }}
    >
      <button className={cn('layer-vis-btn', !layer.visible && 'layer-vis-btn-hidden')} onClick={(e) => { e.stopPropagation(); onSetVisible(layer.id, !layer.visible); }}>
        {layer.visible ? <Eye size={12} /> : <EyeOff size={12} />}
      </button>
      <div className="layer-thumb">
        {layer.type === 'text' ? <Type size={16} className="text-gray-400" /> : <LayerThumbnail layer={layer} subscribeHistory={subscribeHistory} />}
      </div>
      <div className="layer-info">
        <span className={cn('layer-name', active && 'layer-name-active')}>{layer.name}</span>
      </div>
    </div >
  );
});
LayerItem.displayName = 'LayerItem';

// 2. 레이어 패널 (분리됨)
const LayerPanel = memo(({
  layers, activeLayerId, setActiveLayerId, setLayerVisible, setLayerOpacity,
  removeLayer, reorderLayer, addPaintLayer, mergeDown, flattenAll, imageSize, subscribeHistory
}: any) => {
  const { t } = useTranslation();
  const [layerDragOver, setLayerDragOver] = useState<string | null>(null);
  const layerDragIdRef = useRef<string | null>(null);
  const activeLayer = layers.find((l: any) => l.id === activeLayerId);

  return (
    <div className="flex-1 flex flex-col border-b border-[#111] min-h-[200px]">
      <div className="layer-panel-header">
        <span className="layer-panel-title">{t('editor.layers')}</span>
        <div className="layer-panel-actions">
          <button className="layer-panel-btn" onClick={() => addPaintLayer(`${t('editor.layer')} ${layers.length + 1}`, layers, activeLayerId)} aria-label={t('editor.add_layer')} title={t('editor.add_layer')}><Plus size={13} aria-hidden="true" /></button>
          <button className="layer-panel-btn" disabled={layers.findIndex((l: any) => l.id === activeLayerId) >= layers.length - 1} onClick={() => {
            const idx = layers.findIndex((l: any) => l.id === activeLayerId);
            if (idx < layers.length - 1) reorderLayer(activeLayerId, idx + 1, layers, activeLayerId);
          }} aria-label={t('editor.move_up')} title={t('editor.move_up')}><ChevronUp size={13} aria-hidden="true" /></button>
          <button className="layer-panel-btn" disabled={layers.findIndex((l: any) => l.id === activeLayerId) <= 0} onClick={() => {
            const idx = layers.findIndex((l: any) => l.id === activeLayerId);
            if (idx > 0) reorderLayer(activeLayerId, idx - 1, layers, activeLayerId);
          }} aria-label={t('editor.move_down')} title={t('editor.move_down')}><ChevronDown size={13} aria-hidden="true" /></button>
          <button className="layer-panel-btn" disabled={layers.length <= 1} onClick={() => removeLayer(activeLayerId, layers, activeLayerId)} aria-label={t('editor.delete_layer')} title={t('editor.delete_layer')}><Trash2 size={13} aria-hidden="true" /></button>
        </div>
      </div>
      <div className="layer-list custom-scrollbar">
        {[...layers].reverse().map((layer) => (
          <LayerItem
            key={layer.id}
            layer={layer}
            active={layer.id === activeLayerId}
            layerDragOver={layerDragOver}
            onSelect={setActiveLayerId}
            onSetVisible={setLayerVisible}
            layerDragIdRef={layerDragIdRef}
            setLayerDragOver={setLayerDragOver}
            reorderLayer={(id: string, idx: number) => reorderLayer(id, idx, layers, activeLayerId)}
            subscribeHistory={subscribeHistory}
          />
        ))}
      </div>
      {activeLayer && (
        <div className="p-2 border-t border-[#111] bg-[#252526] flex flex-col gap-2 flex-shrink-0">
          <div className="flex items-center gap-2">
            <label htmlFor="layer-opacity" className="text-[9px] font-bold text-gray-500 uppercase w-14">{t('editor.opacity')}</label>
            <input id="layer-opacity" type="range" min={0} max={100} value={activeLayer.opacity} onChange={(e) => setLayerOpacity(activeLayerId, Number(e.target.value), layers, activeLayerId)} className="flex-1 h-1 range-slider" />
            <span className="text-[9px] font-mono text-indigo-400 w-8">{activeLayer.opacity}%</span>
          </div>
          <div className="flex gap-1">
            <button className="layer-panel-footer-btn flex-1" disabled={layers.findIndex((l: any) => l.id === activeLayerId) === 0} onClick={() => mergeDown(activeLayerId, layers, activeLayerId, () => null)}><Merge size={10} /> {t('editor.merge_down')}</button>
            <button className="layer-panel-footer-btn flex-1" onClick={() => flattenAll(layers, activeLayerId, imageSize.w, imageSize.h)}>{t('editor.flatten')}</button>
          </div>
        </div>
      )}
    </div>
  );
});
LayerPanel.displayName = 'LayerPanel';

// 히스토리 항목 메모이제이션
const HistoryItem = memo(({ item, index, active, onClick }: { item: any, index: number, active: boolean, onClick: (i: number) => void }) => {
  const { t } = useTranslation();
  return (
    <button onClick={() => onClick(index)} className={`w-full px-4 py-2 text-[11px] flex justify-between items-center border-b border-[#333] transition-colors ${active ? 'bg-[#4f46e5] text-white' : 'text-gray-400 hover:bg-white/5'}`}>
      <div className="flex items-center gap-2">
        {item.label === 'Open' ? <Palette size={12} /> : (item.label === 'Brush' || item.label === 'Brush Tool' || item.label === t('tools.brush')) ? <Brush size={12} /> : item.label === 'Crop' ? <Crop size={12} /> : item.label === 'Adjustments' ? <Sliders size={12} /> : <Scissors size={12} />}
        <span className="font-bold uppercase tracking-tighter">{item.label}</span>
      </div>
      <span className="text-[9px] opacity-40 font-mono">{item.time}</span>
    </button>
  );
});
HistoryItem.displayName = 'HistoryItem';

// 1. 히스토리 패널 (구독 모델 적용 - 전체 리렌더 방지)
const HistoryPanel = memo(({ historyStack, historyIndexRef, jumpToHistory, subscribeHistory }: {
  historyStack: LayerHistoryEntry[],
  historyIndexRef: React.MutableRefObject<number>,
  jumpToHistory: (i: number) => void,
  subscribeHistory: (fn: () => void) => () => void
}) => {
  const [tick, setTick] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return subscribeHistory(() => setTick(t => t + 1));
  }, [subscribeHistory]);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [historyStack.length]);

  return (
    <div ref={listRef} className="h-[250px] overflow-y-auto no-scrollbar p-0 bg-[#222]">
      {historyStack.map((item, i) => (
        <HistoryItem
          key={i}
          item={item}
          index={i}
          active={i === historyIndexRef.current}
          onClick={jumpToHistory}
        />
      ))}
    </div>
  );
});
HistoryPanel.displayName = 'HistoryPanel';

export function BrushEditor({
  imageUrl,
  originalName,
  onImageChange,
  onReset,
  tabs = [],
  activeTabId = null,
  setActiveTabId = () => { },
  onCloseTab = () => { },
  onAddNewTab = () => { },
  tabId = ""
}: BrushEditorProps) {
  const { t } = useTranslation();

  const getToolName = (tool: Tool) => {
    switch (tool) {
      case 'paint': return t('tools.brush');
      case 'erase': return t('tools.eraser');
      case 'restore': return t('tools.restore');
      case 'wand': return t('tools.wand');
      case 'marquee-rect': return t('tools.marquee_rect');
      case 'marquee-ellipse': return t('tools.marquee_ellipse');
      case 'crop': return t('tools.crop');
      case 'eyedropper': return t('tools.eyedropper');
      case 'bucket': return t('tools.bucket');
      case 'clone': return t('tools.clone');
      case 'heal': return t('tools.heal');
      case 'blur-brush': return t('tools.blur');
      case 'move': return t('tools.move');
      case 'text': return t('tools.text');
      default: return tool.replace('-', ' ');
    }
  }

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
  const cloneOffsetRef = useRef<{ x: number; y: number } | null>(null); // Aligned clone offset
  const [hasCloneSource, setHasCloneSource] = useState(false);
  const isAltPressedRef = useRef(false);

  // 성능 최적화용 Ref (고빈도 이벤트 처리용)
  const isDraggingHandleRef = useRef<string | null>(null);
  const rafId = useRef<number | null>(null);

  useEffect(() => { isDraggingHandleRef.current = isDraggingHandle; }, [isDraggingHandle]);

  // ── 최적화된 하위 컴포넌트들 ──────────────────────────────────



  // 배경 채우기 관련
  const [fillColor, setFillColor] = useState('#ffffff');
  const [showFillPanel, setShowFillPanel] = useState(false);

  const [downloadQuality, setDownloadQuality] = useState(90);
  const [showDownloadPanel, setShowDownloadPanel] = useState(false);
  const [downloadFormat, setDownloadFormat] = useState<'png' | 'jpeg' | 'webp' | 'svg'>('png');
  const [isTransparent, setIsTransparent] = useState(false);
  const [showSaveToast, setShowSaveToast] = useState(false);

  const [cropMargin, setCropMargin] = useState(4);

  // 보정(Adjustments) 관리
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100);
  const [exposure, setExposure] = useState(0);
  const [blur, setBlur] = useState(0);
  const [showAdjustPanel, setShowAdjustPanel] = useState(false);
  const [adjOpen, setAdjOpen] = useState(false); // Adjustments 패널 접힘 (기본 닫힘)
  const [historyOpen, setHistoryOpen] = useState(false); // 히스토리 패널 접힘 (기본 닫힘)
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false); // 모바일 우측 패널 토글
  const [layerDragOver, setLayerDragOver] = useState<string | null>(null); // 드래그 오버 중인 레이어 ID
  const layerDragIdRef = useRef<string | null>(null); // 드래그 중인 레이어 ID

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  const brushCursorRef = useRef<HTMLDivElement>(null);
  const [bgPreset, setBgPreset] = useState(0);
  const expandRafRef = useRef<number | null>(null);

  // 상태바 및 눈금자 정보
  // 상태바 정보 전용 Ref (리렌더링 방지)
  const statusBarXRef = useRef<HTMLSpanElement>(null);
  const statusBarYRef = useRef<HTMLSpanElement>(null);
  // 1. 도구(Tool) 및 브러시 설정 가져오기
  const {
    tool, setTool, toolRef,
    brushSize, setBrushSize,
    brushOpacity, setBrushOpacity,
    brushColor, setBrushColor,
    brushBgColor, setBrushBgColor,
    swapColors,
    resetColors,
    brushShape, setBrushShape,
    brushHardness, setBrushHardness,
    brushBlur, setBrushBlur,
    tolerance, setTolerance,
    wandExpand, setWandExpand,
    wandSmooth, setWandSmooth
  } = useBrushConfig();

  // 이미지 로드 콜백을 ref로 저장 (순환 참조 방지)
  const onImageLoadedCallbackRef = useRef<(() => void) | null>(null);

  // 2. 캔버스 상태 가져오기
  const core = useCanvasCore(imageUrl, () => {
    onImageLoadedCallbackRef.current?.();
  });

  const {
    canvasRef, overlayRef, originalRef, maskRef, aiResultRef,
    maskSnapshotRef, tempCanvasRef, originalSnapshotRef, blurCacheRef,
    containerRef, containerRectRef, imageSize, zoom, setZoom, zoomRef,
    updateCanvasSize, compositeAndRender, compositeLayersAndRender
  } = core;

  const { performDownload } = useImageProcessing();

  // 3. 레이어 훅
  const layersHook = useLayers(imageSize.w, imageSize.h);
  const {
    layers, setLayers, activeLayerId, setActiveLayerId,
    historyStack, historyIndexRef,
    canUndo, canRedo,
    undoBtnRef, redoBtnRef,
    saveSnapshot, jumpToHistory, undo: layerUndo, redo: layerRedo,
    addImageLayer, addPaintLayer, addTextLayer,
    removeLayer, reorderLayer,
    setLayerVisible, setLayerOpacity, renameLayer,
    updateTextLayer,
    moveLayerPosition, commitLayerMove,
    mergeDown, flattenAll,
    getActiveLayer, getActiveLayerCanvases,
    savePixelSnapshot, prepareSnapshot, resetLayers, commitLayers,
    subscribeHistory,
  } = layersHook;

  // imageUrl 변경 시 레이어 초기화 (새 이미지 로드 준비)
  useEffect(() => {
    resetLayers();
  }, [imageUrl, resetLayers]);

  // ── 폰트로딩 완료 시 재렌더링 ──────────────────────────────
  useEffect(() => {
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        // 모든 폰트가 로드되었을 때 현재 레이어 기준으로 캔버스 재렌더링
        compositeLayersAndRender(layersHook.layers);
      });
    }
  }, [layersHook.layers, compositeLayersAndRender]);

  // 이미지 로드 완료 콜백 등록 (addImageLayer가 선언된 이후)
  useEffect(() => {
    onImageLoadedCallbackRef.current = () => {
      if (originalRef.current) {
        addImageLayer(originalRef.current, originalName, [], '');
      }
    };
  }, [addImageLayer, originalName]);

  // 레이어 변경 시 화면 재합성 (historyVersion은 ref → dep 불필요)
  useEffect(() => {
    if (layers.length > 0) {
      compositeLayersAndRender(layers);
    }
  }, [layers, compositeLayersAndRender]);

  // activeLayerIdRef: activeLayerId를 항상 최신 상태로 유지 (stale closure 방지)
  const activeLayerIdRef = useRef(activeLayerId);
  useEffect(() => { activeLayerIdRef.current = activeLayerId; }, [activeLayerId]);

  // activeLayerRef: 기존 originalRef/maskRef 대신 활성 레이어 캔버스를 가리키는 동적 ref
  // layersRef + activeLayerIdRef 사용으로 stale closure 완전 제거
  const getActiveOriginal = useCallback((): HTMLCanvasElement | null => {
    const active = layersRef.current.find(l => l.id === activeLayerIdRef.current);
    return active?.originalCanvas ?? originalRef.current;
  }, []);

  const getActiveMask = useCallback((): HTMLCanvasElement | null => {
    const active = layersRef.current.find(l => l.id === activeLayerIdRef.current);
    return active?.maskCanvas ?? maskRef.current;
  }, []);

  // 레이어 시스템의 undo/redo + 기존 히스토리 겸용
  const undo = useCallback(() => {
    layerUndo();
    stopMarching?.();
    setHasSelection?.(false);
  }, [layerUndo]);

  const redo = useCallback(() => {
    layerRedo();
    stopMarching?.();
    setHasSelection?.(false);
  }, [layerRedo]);

  // 픽셀 작업 완료 후 레이어 스냅샷 저장 (기존 saveMaskSnapshot 역할)
  const saveMaskSnapshot = useCallback((label: string) => {
    savePixelSnapshot(label);
  }, [savePixelSnapshot]);

  // 드롭 다이얼로그 상태
  const [dropDialog, setDropDialog] = useState<DropDialogState | null>(null);

  // ── 텍스트 툴 — 모든 상태를 ref로 관리 (렉/stale closure 방지) ──────────
  // textarea는 uncontrolled. 리렌더 없이 값 읽기.
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const textInputRef = useRef('');                           // textarea 현재 내용
  const textPosRef = useRef<{ x: number; y: number } | null>(null);  // 텍스트 위치
  const textStyleRef = useRef<TextStyle>({                   // 텍스트 스타일
    fontFamily: 'sans-serif',
    fontSize: 48,
    fontWeight: 'bold',
    fontStyle: 'normal',
    letterSpacing: 0,
    lineHeight: 1.3,
    color: brushColor,
    align: 'left',
  });
  const isEditingTextRef = useRef(false);                    // 편집 중 여부
  const editingTextLayerIdRef = useRef<string | null>(null); // 편집 중인 레이어 ID
  // UI 리렌더링 트리거 (ref 변경 후 수동으로 호출)
  const [textUIVersion, setTextUIVersion] = useState(0);
  const bumpTextUI = useCallback(() => setTextUIVersion(v => v + 1), []);

  // 텍스트 스타일 옵션바 동기화용 (옵션바만 controlled)
  const [textStyle, setTextStyle] = useState<TextStyle>(textStyleRef.current);

  // Text 툴 interaction state machine refs
  const hoveredTextLayerIdRef = useRef<string | null>(null);
  const selectedTextLayerIdRef = useRef<string | null>(null);

  // commitTextLayer forward-ref (선언 전 호출 가능하도록)
  const commitTextLayerRef = useRef<(() => void) | null>(null);

  // Text drag / scale
  const textDragRef = useRef<{ mx: number; my: number; lx: number; ly: number; layerId: string } | null>(null);
  const textLivePosRef = useRef<{ x: number; y: number } | null>(null);
  const textScaleDragRef = useRef<{ mx: number; my: number; baseFontSize: number; baseX: number; baseY: number; corner: string; layerId: string } | null>(null);
  const textScaleLiveSizeRef = useRef<number | null>(null);
  // 드래그/스케일 중 DOM 오버레이에서 숨길 레이어 ID (잔상 방지)
  const [domHiddenTextId, setDomHiddenTextId] = useState<string | null>(null);

  // Marching animation — layerId/mode도 ref로 관리 (interval에서 최신값 사용)
  const textMarchOffsetRef = useRef(0);
  const textMarchTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const textMarchLayerIdRef = useRef<string | null>(null);
  const textMarchModeRef = useRef<'hover' | 'selected'>('hover');
  // drawTextOutline을 ref로 관리 → zoom 변경 시 interval이 최신 함수를 참조
  const drawTextOutlineRef = useRef<((layerId: string | null, mode: 'hover' | 'selected') => void) | null>(null);

  // 측정 전용 캔버스 (재사용 — 매 호출마다 생성 방지)
  const measureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const getMeasureCtx = () => {
    if (!measureCanvasRef.current) measureCanvasRef.current = document.createElement('canvas');
    return measureCanvasRef.current.getContext('2d')!;
  };

  // 드래그/스케일 중 live 오버라이드 (interval이 항상 최신 위치/크기로 아웃라인 그림)
  const textLiveOverrideRef = useRef<{ x?: number; y?: number; fontSize?: number } | null>(null);

  // layers ref (interval 콜백에서 최신 레이어 접근)
  const layersRef = useRef<Layer[]>(layers);
  useEffect(() => { layersRef.current = layers; }, [layers]);

  // brushColor/brushSize ref (paint 콜백 dep 제거 → 변경 시 paint 재생성 안함 → 렉 없음)
  const brushColorRef = useRef(brushColor);
  const brushSizeRef = useRef(brushSize);
  const brushOpacityRef = useRef(brushOpacity);
  const brushHardnessRef = useRef(brushHardness);
  const brushShapeRef = useRef(brushShape);
  const brushBlurRef = useRef(brushBlur);
  const updateBrushTipRef = useRef<() => void>(() => { });
  useEffect(() => {
    brushColorRef.current = brushColor;
    updateBrushTipRef.current(); // 색 변경 시 tip 즉시 갱신
  }, [brushColor]);
  useEffect(() => {
    brushSizeRef.current = brushSize;
  }, [brushSize]);
  useEffect(() => {
    brushOpacityRef.current = brushOpacity;
  }, [brushOpacity]);
  useEffect(() => {
    brushHardnessRef.current = brushHardness;
  }, [brushHardness]);
  useEffect(() => {
    brushShapeRef.current = brushShape;
  }, [brushShape]);
  useEffect(() => {
    brushBlurRef.current = brushBlur;
  }, [brushBlur]);

  // ── 브러시 크기 상태 업데이트 스로틀링 (연속 키 입력 대응) ──
  const updateSizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Move 툴 드래그 상태
  const moveDragStart = useRef<{ mx: number; my: number; lx: number; ly: number } | null>(null);
  // Move live position ref (avoids history accumulation during drag)
  const moveLivePosRef = useRef<{ x: number; y: number } | null>(null);

  // 4. Selection Tools — originalRef/maskRef 대신 getter로 래핑
  // 기존 selectionTools는 ref를 직접 받으므로 호환 유지
  const activeOriginalProxy = useRef<HTMLCanvasElement | null>(null);
  const activeMaskProxy = useRef<HTMLCanvasElement | null>(null);

  // proxy ref를 항상 활성 레이어로 동기화
  useEffect(() => {
    activeOriginalProxy.current = getActiveOriginal();
    activeMaskProxy.current = getActiveMask();
  }, [layers, activeLayerId, getActiveOriginal, getActiveMask]);

  const selectionTools = useSelectionTools({
    originalRef: activeOriginalProxy as React.RefObject<HTMLCanvasElement | null>,
    maskRef: activeMaskProxy as React.RefObject<HTMLCanvasElement | null>,
    overlayRef,
    overlayCache, selectionRef, baseSelectionRef,
    cachedSelKey, marchingSegs, marchingOffset, isSliding,
    tolerance, wandSmooth, wandExpand,
    compositeAndRender: () => compositeLayersAndRender(layers),
    toolRef, cropRectRef,
    saveMaskSnapshot: (label) => saveMaskSnapshot(label),
    drawCropOverlay: (rect) => drawCropOverlay(rect),
    zoom
  });

  const {
    hasSelection, setHasSelection,
    drawMarching, startMarching, stopMarching,
    handleWand, handleSelectAll, applySelectionToMask
  } = selectionTools;

  // 투명도 감지하여 포맷 자동 설정
  useEffect(() => {
    if (!canvasRef.current) return;
    const trans = hasTransparency(canvasRef.current);
    setIsTransparent(trans);
    if (trans) {
      setDownloadFormat('png');
    } else {
      // 투명도 없으면 원본 확장자 기반으로 설정
      const ext = originalName.split('.').pop()?.toLowerCase();
      if (ext === 'jpg' || ext === 'jpeg') setDownloadFormat('jpeg');
      else if (ext === 'webp') setDownloadFormat('webp');
      else if (ext === 'png') setDownloadFormat('png');
      else setDownloadFormat('png');
    }
  }, [layers, originalName]);

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
  }, [historyStack.current.length]);






  // ── 크롭 오버레이 그리기 (Zoom-Aware) ──────────────────
  const drawCropOverlay = useCallback((rect: { x: number; y: number; w: number; h: number } | null) => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext('2d')!;
    const bufferW = overlay.width;
    const bufferH = overlay.height;
    ctx.clearRect(0, 0, bufferW, bufferH);
    if (!rect || rect.w <= 0 || rect.h <= 0) return;

    // 실제 스케일은 상태값 zoom보다 캔버스 버퍼/이미지 너비 비율이 더 정확함
    const s = bufferW / imageSize.w;

    ctx.save();
    ctx.scale(s, s);

    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, imageSize.w, imageSize.h);
    ctx.clearRect(rect.x, rect.y, rect.w, rect.h);

    const t = (marchingOffset.current * 20);
    ctx.setLineDash([6 / s, 4 / s]);
    ctx.lineDashOffset = -t / s;

    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 3 / s;
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);

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
    ctx.lineWidth = 1.5 / s;
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;

    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1 / s;
    for (let i = 1; i < 3; i++) {
      const gx = rect.x + (rect.w / 3) * i;
      const gy = rect.y + (rect.h / 3) * i;
      ctx.beginPath(); ctx.moveTo(gx, rect.y); ctx.lineTo(gx, rect.y + rect.h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(rect.x, gy); ctx.lineTo(rect.x + rect.w, gy); ctx.stroke();
    }

    const hs = 10 / s;
    const corners = [
      { id: 'tl', x: rect.x - hs / 2, y: rect.y - hs / 2 },
      { id: 'tr', x: rect.x + rect.w - hs / 2, y: rect.y - hs / 2 },
      { id: 'bl', x: rect.x - hs / 2, y: rect.y + rect.h - hs / 2 },
      { id: 'br', x: rect.x + rect.w - hs / 2, y: rect.y + rect.h - hs / 2 },
      { id: 't', x: rect.x + rect.w / 2 - hs / 2, y: rect.y - hs / 2 },
      { id: 'b', x: rect.x + rect.w / 2 - hs / 2, y: rect.y + rect.h - hs / 2 },
      { id: 'l', x: rect.x - hs / 2, y: rect.y + rect.h / 2 - hs / 2 },
      { id: 'r', x: rect.x + rect.w - hs / 2, y: rect.y + rect.h / 2 - hs / 2 },
    ];
    ctx.fillStyle = 'white';
    ctx.strokeStyle = '#4f46e5';
    ctx.lineWidth = 1.5 / s;
    for (const c of corners) {
      ctx.fillRect(c.x, c.y, hs, hs);
      ctx.strokeRect(c.x, c.y, hs, hs);
    }
    ctx.restore();
  }, [imageSize, zoom]);
  // ── 텍스트 레이어 바운드 계산 (측정 캔버스 재사용) ─────────
  const getTextLayerBounds = useCallback((layer: Layer, override?: { x?: number; y?: number; fontSize?: number }) => {
    const { textContent, textStyle: ts } = layer;
    if (!textContent) return null;
    const x = override?.x ?? layer.x;
    const y = override?.y ?? layer.y;
    const fontSize = override?.fontSize ?? ts.fontSize;
    const letterSpacing = ts.letterSpacing ?? 0;
    const lineHeight = ts.lineHeight ?? 1.3;
    const lines = textContent.split('\n');
    const lineH = fontSize * lineHeight;
    if (!measureCanvasRef.current) measureCanvasRef.current = document.createElement('canvas');
    const ctx = measureCanvasRef.current.getContext('2d')!;
    ctx.font = `${ts.fontStyle} ${ts.fontWeight} ${fontSize}px ${ts.fontFamily}`;
    let maxW = 0;
    for (const line of lines) {
      let w = 0;
      if (letterSpacing === 0) {
        w = ctx.measureText(line).width;
      } else {
        for (const ch of line) w += ctx.measureText(ch).width + letterSpacing;
        if (line.length > 0) w -= letterSpacing;
      }
      if (w > maxW) maxW = w;
    }
    const h = lines.length * lineH;

    let boxX = x;
    if (ts.align === 'center') {
      boxX = x - maxW / 2;
    } else if (ts.align === 'right') {
      boxX = x - maxW;
    }

    return { x: boxX, y, w: maxW, h, anchorX: x };
  }, []);

  // ── 텍스트 아웃라인 오버레이 그리기 (마칭 앤츠 스타일) ──
  const drawTextOutline = useCallback((layerId: string | null, mode: 'hover' | 'selected') => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext('2d')!;
    if (!layerId) {
      ctx.clearRect(0, 0, overlay.width, overlay.height);
      return;
    }
    // layersRef로 최신 레이어 접근, live override 적용 (드래그/스케일 중 즉시 반영)
    const layer = layersRef.current.find(l => l.id === layerId);
    if (!layer) return;
    const override = textLiveOverrideRef.current ?? undefined;
    const bounds = getTextLayerBounds(layer, override);
    if (!bounds) return;

    ctx.clearRect(0, 0, overlay.width, overlay.height);
    ctx.save();
    ctx.scale(zoom, zoom);

    const pad = 6; // padding around text bounds
    const rx = bounds.x - pad;
    const ry = bounds.y - pad;
    const rw = bounds.w + pad * 2;
    const rh = bounds.h + pad * 2;

    const t = textMarchOffsetRef.current * 20;
    ctx.setLineDash([6 / zoom, 4 / zoom]);
    ctx.lineDashOffset = -t / zoom;

    // shadow for contrast
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 3 / zoom;
    ctx.strokeRect(rx, ry, rw, rh);

    // animated gradient color
    const colors = mode === 'selected'
      ? [[168, 85, 247], [255, 255, 255], [56, 189, 248], [236, 72, 153], [255, 255, 255]] as number[][]
      : [[120, 120, 255], [200, 200, 255], [120, 120, 255]] as number[][];
    const steps = colors.length - 1;
    const colorPos = textMarchOffsetRef.current * steps;
    const idx = Math.floor(colorPos) % steps;
    const frac = colorPos - Math.floor(colorPos);
    const [r1, g1, b1] = colors[idx]!;
    const [r2, g2, b2] = colors[(idx + 1) % colors.length]!;
    const r = Math.round(r1 + (r2 - r1) * frac);
    const g = Math.round(g1 + (g2 - g1) * frac);
    const b = Math.round(b1 + (b2 - b1) * frac);

    ctx.strokeStyle = `rgb(${r},${g},${b})`;
    ctx.lineWidth = 1.5 / zoom;
    ctx.strokeRect(rx, ry, rw, rh);
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;

    // corner handles (only when selected)
    if (mode === 'selected') {
      const hs = 8 / zoom;
      const corners = [
        { x: rx - hs / 2, y: ry - hs / 2 },
        { x: rx + rw - hs / 2, y: ry - hs / 2 },
        { x: rx - hs / 2, y: ry + rh - hs / 2 },
        { x: rx + rw - hs / 2, y: ry + rh - hs / 2 },
      ];
      ctx.fillStyle = 'white';
      ctx.strokeStyle = '#7c3aed';
      ctx.lineWidth = 1.5 / zoom;
      ctx.setLineDash([]);
      for (const c of corners) {
        ctx.fillRect(c.x, c.y, hs, hs);
        ctx.strokeRect(c.x, c.y, hs, hs);
      }
    }
    ctx.restore();
  }, [getTextLayerBounds, zoom]);

  // drawTextOutline ref 항상 최신으로 유지 (interval이 zoom 변경 후 최신 함수 참조)
  useEffect(() => {
    drawTextOutlineRef.current = drawTextOutline;
  }, [drawTextOutline]);

  // ── 오버레이 캔버스 해상도 최적화 및 자동 리드로우 ──
  // 줌 시에도 UI(크롭 가이드 등)가 흐릿해지지 않도록 내부 버퍼 크기를 디스플레이 크기에 맞춤
  useEffect(() => {
    const ov = overlayRef.current;
    if (ov && imageSize.w > 0) {
      ov.width = Math.round(imageSize.w * zoom);
      ov.height = Math.round(imageSize.h * zoom);

      // 줌/사이즈 변경 시 캔버스가 초기화되므로 즉시 다시 그림
      const currentCrop = cropRectRef.current;
      if (tool === 'crop' && currentCrop) {
        drawCropOverlay(currentCrop);
      }
      if (selectedTextLayerIdRef.current) {
        drawTextOutline(selectedTextLayerIdRef.current, 'selected');
      }
    }
  }, [zoom, imageSize, tool, drawCropOverlay, drawTextOutline]);

  // ── 텍스트 마칭 타이머 ────────────────────────────────────
  // layerId/mode를 ref로 관리 → interval 콜백이 항상 최신 값으로 그림
  const startTextMarching = useCallback((layerId: string, mode: 'hover' | 'selected') => {
    textMarchLayerIdRef.current = layerId;
    textMarchModeRef.current = mode;
    if (textMarchTimerRef.current) return; // 이미 실행 중이면 ref만 갱신
    textMarchTimerRef.current = setInterval(() => {
      textMarchOffsetRef.current = (textMarchOffsetRef.current + 0.02) % 1;
      // ref를 통해 항상 최신 drawTextOutline 참조 (zoom 변경 후에도 올바른 함수 사용)
      if (textMarchLayerIdRef.current && drawTextOutlineRef.current) {
        drawTextOutlineRef.current(textMarchLayerIdRef.current, textMarchModeRef.current);
      }
    }, 50);
  }, []);

  const stopTextMarching = useCallback(() => {
    if (textMarchTimerRef.current) {
      clearInterval(textMarchTimerRef.current);
      textMarchTimerRef.current = null;
    }
    textMarchLayerIdRef.current = null;
    const overlay = overlayRef.current;
    if (overlay) {
      overlay.getContext('2d')!.clearRect(0, 0, overlay.width, overlay.height);
    }
  }, []);

  // ── 텍스트 레이어 코너 핸들 히트 테스트 (4방향) ──────────
  const hitTestTextCorner = useCallback((layerId: string, canvasPos: { x: number; y: number }) => {
    const layer = layersRef.current.find(l => l.id === layerId);
    if (!layer) return null;
    const override = textLiveOverrideRef.current ?? undefined;
    const bounds = getTextLayerBounds(layer, override);
    if (!bounds) return null;
    const pad = 6;
    const rx = bounds.x - pad;
    const ry = bounds.y - pad;
    const rw = bounds.w + pad * 2;
    const rh = bounds.h + pad * 2;
    const hitZone = 12;
    const corners = [
      { id: 'tl', x: rx, y: ry },
      { id: 'tr', x: rx + rw, y: ry },
      { id: 'bl', x: rx, y: ry + rh },
      { id: 'br', x: rx + rw, y: ry + rh },
    ];
    for (const c of corners) {
      if (Math.abs(canvasPos.x - c.x) < hitZone && Math.abs(canvasPos.y - c.y) < hitZone) {
        return c.id;
      }
    }
    return null;
  }, [getTextLayerBounds]);

  // ── 텍스트 레이어 바운드 히트 테스트 ─────────────────────
  const hitTestTextLayer = useCallback((canvasPos: { x: number; y: number }): string | null => {
    // Search in reverse (top layer first), always use latest layers via ref
    const currentLayers = layersRef.current;
    for (let i = currentLayers.length - 1; i >= 0; i--) {
      const layer = currentLayers[i]!;
      if (layer.type !== 'text' || !layer.visible) continue;
      const bounds = getTextLayerBounds(layer);
      if (!bounds) continue;
      const pad = 6;
      if (
        canvasPos.x >= bounds.x - pad &&
        canvasPos.x <= bounds.x + bounds.w + pad &&
        canvasPos.y >= bounds.y - pad &&
        canvasPos.y <= bounds.y + bounds.h + pad
      ) {
        return layer.id;
      }
    }
    return null;
  }, [getTextLayerBounds]);

  // ── 텍스트 아웃라인 cleanup ───────────────────────────────
  useEffect(() => {
    if (tool !== 'text') {
      stopTextMarching();
      hoveredTextLayerIdRef.current = null;
      selectedTextLayerIdRef.current = null;
      // 편집 중이면 취소
      if (isEditingTextRef.current) {
        isEditingTextRef.current = false;
        textPosRef.current = null;
        textInputRef.current = '';
        editingTextLayerIdRef.current = null;
        bumpTextUI();
      }
    }
  }, [tool, stopTextMarching, bumpTextUI]);

  // ── 편집 중 레이어 숨김 렌더링 ───────────────────────────
  // textUIVersion 변화 시: 편집 중이면 해당 레이어 숨기고 렌더, 아니면 전체 렌더
  useEffect(() => {
    const editId = editingTextLayerIdRef.current;
    if (editId) {
      // 편집 중 레이어를 캔버스에서 숨김 (textarea와 겹침 방지)
      const hiddenLayers = layersRef.current.map(l => l.id === editId ? { ...l, visible: false } : l);
      compositeLayersAndRender(hiddenLayers);
    } else {
      compositeLayersAndRender(layersRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textUIVersion]);

  const applyAiThreshold = useCallback((offset: number) => {
    const activeMask = getActiveMask();
    if (!aiResultRef.current || !activeMask) return;
    const aiCtx = aiResultRef.current.getContext('2d')!;
    const aiData = aiCtx.getImageData(0, 0, aiResultRef.current.width, aiResultRef.current.height);
    const maskCtx = activeMask.getContext('2d')!;
    const maskData = maskCtx.getImageData(0, 0, activeMask.width, activeMask.height);

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
    compositeLayersAndRender(layers);
  }, [compositeLayersAndRender, layers, getActiveMask]);

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
    const activeOriginal = getActiveOriginal();
    if (!activeOriginal || !aiResultRef.current) return;
    // originalRef.current 호환을 위해 activeOriginal 사용
    setIsProcessing(true);
    setProgress(0);

    try {
      const { removeBackground } = await import('@imgly/background-removal');
      const blob = await new Promise<Blob>((resolve) =>
        activeOriginal.toBlob((b) => resolve(b!), 'image/png')
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
  }, [compositeLayersAndRender, layers, saveMaskSnapshot, aiAdjust, applyAiThreshold, getActiveOriginal]);

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
    const activeOriginal = getActiveOriginal();
    const activeMask = getActiveMask();
    if (!sel || !activeOriginal || !activeMask) return;

    const w = activeOriginal.width;
    const h = activeOriginal.height;

    const oCtx = activeOriginal.getContext('2d')!;
    const mCtx = activeMask.getContext('2d')!;

    const oData = oCtx.getImageData(0, 0, w, h);
    const mData = mCtx.getImageData(0, 0, w, h);

    // RGB 값 준비
    const r = parseInt(brushColorRef.current.slice(1, 3), 16);
    const g = parseInt(brushColorRef.current.slice(3, 5), 16);
    const b = parseInt(brushColorRef.current.slice(5, 7), 16);

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
    compositeLayersAndRender(layersRef.current);
    stopMarching();
    saveMaskSnapshot('Fill');
  }, [compositeLayersAndRender, saveMaskSnapshot, stopMarching, getActiveOriginal, getActiveMask]);

  const handleBucket = useCallback(
    (pos: { x: number; y: number }) => {
      const activeOriginal = getActiveOriginal();
      const activeMask = getActiveMask();
      if (!activeOriginal || !activeMask || !canvasRef.current) return;
      const w = activeOriginal.width;
      const h = activeOriginal.height;

      if (pos.x < 0 || pos.x >= w || pos.y < 0 || pos.y >= h) return;

      const oCtx = activeOriginal.getContext('2d')!;
      const mCtx = activeMask.getContext('2d')!;
      const compositeCtx = canvasRef.current.getContext('2d', { willReadFrequently: true })!;

      // 현재 보이는 상태(composite)를 기준으로 영역 계산 (투명 영역도 색칠 가능하게 함)
      const visibleData = compositeCtx.getImageData(0, 0, w, h);
      const sel = floodFillSelect(visibleData, pos.x, pos.y, tolerance);

      const oData = oCtx.getImageData(0, 0, w, h);
      const mData = mCtx.getImageData(0, 0, w, h);

      // 브러시 컬러 적용
      const r = parseInt(brushColorRef.current.slice(1, 3), 16);
      const g = parseInt(brushColorRef.current.slice(3, 5), 16);
      const b = parseInt(brushColorRef.current.slice(5, 7), 16);

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
      compositeLayersAndRender(layersRef.current);
      saveMaskSnapshot('Paint Bucket');
    },
    [tolerance, compositeLayersAndRender, saveMaskSnapshot, getActiveOriginal, getActiveMask]
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
      tCtx.fillStyle = brushColorRef.current;
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
          tCtx.fillStyle = brushColorRef.current;
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
  }, [brushSize, brushHardness, tool, brushShape]);

  // updateBrushTip을 ref에 등록 (brushColor effect에서 forward 호출용)
  useEffect(() => { updateBrushTipRef.current = updateBrushTip; }, [updateBrushTip]);

  // 브러시 설정 변경 시 팁 업데이트
  useEffect(() => {
    updateBrushTip();
  }, [updateBrushTip]);

  const paint = useCallback(
    (pos: { x: number; y: number }) => {
      const activeOriginal = getActiveOriginal();
      const activeMask = getActiveMask();
      if (!activeMask || !activeOriginal || !brushTipRef.current) return;

      // 레이어 오프셋 보정: 레이어가 이동된 경우 캔버스 좌표 → 레이어 로컬 좌표
      const activeLayer = layersRef.current.find(l => l.id === activeLayerIdRef.current);
      const layerOffsetX = activeLayer?.x ?? 0;
      const layerOffsetY = activeLayer?.y ?? 0;
      const localPos = { x: pos.x - layerOffsetX, y: pos.y - layerOffsetY };

      const imgW = activeOriginal.width;
      const imgH = activeOriginal.height;

      const maskCtx = activeMask.getContext('2d')!;
      const origCtx = activeOriginal.getContext('2d')!;
      const rawFrom = lastPos.current || pos;
      const from = { x: rawFrom.x - layerOffsetX, y: rawFrom.y - layerOffsetY };
      const pos2 = localPos;

      const alpha = brushOpacityRef.current / 100;
      const dx = pos2.x - from.x;
      const dy = pos2.y - from.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // 간격을 브러시 크기의 1/10 정도로 설정 (더 부드럽게)
      const currentSize = brushSizeRef.current;
      const stepSize = Math.max(1, currentSize / 10);
      const steps = Math.ceil(distance / stepSize);

      let startOffset = { x: 0, y: 0 };
      const currentTool = toolRef.current;
      if ((currentTool === 'clone' || currentTool === 'heal') && cloneSourceRef.current) {
        // Aligned behavior: establish offset for this stroke based on its start point
        // If you want "Non-Aligned" (always start from S on every click), 
        // we should ALWAYS calculate offset at start of stroke.
        if (!cloneOffsetRef.current && initialMousePos.current) {
          cloneOffsetRef.current = {
            x: Math.round(cloneSourceRef.current.x - initialMousePos.current.x),
            y: Math.round(cloneSourceRef.current.y - initialMousePos.current.y)
          };
        }
        startOffset = cloneOffsetRef.current || {
          x: Math.round(cloneSourceRef.current.x - pos.x),
          y: Math.round(cloneSourceRef.current.y - pos.y)
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
      if (currentTool === 'erase') {
        maskCtx.globalCompositeOperation = 'destination-out';
      } else if (currentTool === 'restore') {
        maskCtx.globalCompositeOperation = 'source-over';
      }

      for (let i = 0; i <= steps; i++) {
        const t = steps === 0 ? 0 : i / steps;
        const px = from.x + dx * t;
        const py = from.y + dy * t;

        if (currentTool === 'paint') {
          origCtx.globalAlpha = alpha;
          origCtx.drawImage(tipCanvas, px - offset, py - offset);
          maskCtx.globalAlpha = 1;
          maskCtx.drawImage(tipCanvas, px - offset, py - offset);
        } else if (currentTool === 'erase' || currentTool === 'restore') {
          maskCtx.globalAlpha = alpha;
          maskCtx.drawImage(tipCanvas, px - offset, py - offset);
        } else if (currentTool === 'blur-brush' && blurCacheRef.current) {
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
        } else if ((currentTool === 'clone' || currentTool === 'heal') && originalSnapshotRef.current) {
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
          origCtx.globalAlpha = currentTool === 'heal' ? alpha * 0.7 : alpha;
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
      compositeLayersAndRender(layersRef.current);
    },
    [compositeLayersAndRender, originalSnapshotRef, blurCacheRef, getActiveOriginal, getActiveMask]
  );


  const initialMousePos = useRef({ x: 0, y: 0 });

  // 더블클릭 감지용 (mousedown 내에서 처리)
  const lastClickTimeRef = useRef(0);
  const lastClickLayerIdRef = useRef<string | null>(null);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if (!imageUrl) return;
      e.preventDefault();
      if (canvasRef.current) containerRectRef.current = canvasRef.current.getBoundingClientRect();
      const pos = getCanvasPos(e);
      // isAlt 감지 시 브라우저 기본 altKey 속성을 최우선 참조
      const isAlt = (e as any).altKey ||
        (e.nativeEvent && (e.nativeEvent as any).altKey) ||
        isAltPressedRef.current;
      const clientX = 'touches' in e ? (e as React.TouchEvent).touches[0]!.clientX : (e as React.MouseEvent).clientX;
      const clientY = 'touches' in e ? (e as React.TouchEvent).touches[0]!.clientY : (e as React.MouseEvent).clientY;

      if ((tool === 'clone' || tool === 'heal') && isAlt) {
        cloneSourceRef.current = pos;
        cloneOffsetRef.current = null; // Reset aligned offset when source is picked
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
              isDraggingHandleRef.current = hnd.id; // 즉시 동기화 (disappearing 버그 방지)
              isPainting.current = true;
              return;
            }
          }

          // 영역 내부 클릭 시 이동
          if (pos.x >= x && pos.x <= x + w && pos.y >= y && pos.y <= y + h) {
            setIsDraggingHandle('move');
            isDraggingHandleRef.current = 'move'; // 즉시 동기화
            cropStartRef.current = pos;
            isPainting.current = true;
            return;
          }
        }

        setIsDraggingHandle('new');
        isDraggingHandleRef.current = 'new'; // 새 크롭 상태 명시
        cropStartRef.current = pos;
        cropRectRef.current = { x: pos.x, y: pos.y, w: 0, h: 0 };
        setCropRect({ x: pos.x, y: pos.y, w: 0, h: 0 });
        drawCropOverlay({ x: pos.x, y: pos.y, w: 0, h: 0 });
        isPainting.current = true;
      } else if (tool === 'move') {
        // Move 툴: 활성 레이어 이동 시작
        const activeLayer = getActiveLayer();
        if (activeLayer) {
          moveDragStart.current = {
            mx: clientX,
            my: clientY,
            lx: activeLayer.x,
            ly: activeLayer.y,
          };
          moveLivePosRef.current = null;
          isPainting.current = true;
        }
      } else if (tool === 'text') {
        // ── Text 툴 상태 머신 (모두 ref 기반 — stale closure 없음) ──
        // 캔버스 영역 밖 클릭이면 무시
        const canvas = canvasRef.current;
        if (!canvas || pos.x < 0 || pos.y < 0 || pos.x > canvas.width || pos.y > canvas.height) return;

        // 0. 더블클릭 감지: 300ms 이내 같은 레이어 재클릭 → 즉시 편집 모드
        const now = Date.now();
        const hitIdForDbl = hitTestTextLayer(pos);
        if (hitIdForDbl && now - lastClickTimeRef.current < 300 && lastClickLayerIdRef.current === hitIdForDbl) {
          lastClickTimeRef.current = 0;
          lastClickLayerIdRef.current = null;
          const dblLayer = layersRef.current.find(l => l.id === hitIdForDbl)!;
          editingTextLayerIdRef.current = hitIdForDbl;
          textInputRef.current = dblLayer.textContent;
          textStyleRef.current = { ...dblLayer.textStyle };
          textPosRef.current = { x: dblLayer.x, y: dblLayer.y };
          isEditingTextRef.current = true;
          selectedTextLayerIdRef.current = hitIdForDbl;
          setTextStyle({ ...dblLayer.textStyle });
          stopTextMarching();
          bumpTextUI();
          setTimeout(() => {
            if (textareaRef.current) {
              textareaRef.current.value = dblLayer.textContent;
              textareaRef.current.style.height = 'auto';
              textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
              textareaRef.current.focus();
              textareaRef.current.select();
            }
          }, 0);
          return;
        }
        lastClickTimeRef.current = now;
        lastClickLayerIdRef.current = hitIdForDbl;

        // 1. 편집 중이면 확정 후 종료
        if (isEditingTextRef.current) {
          commitTextLayerRef.current?.();
          return;
        }

        // 2. 코너 핸들 히트: 크기 조정
        const curSelId = selectedTextLayerIdRef.current;
        if (curSelId) {
          const corner = hitTestTextCorner(curSelId, pos);
          if (corner) {
            const selLayer = layersRef.current.find(l => l.id === curSelId);
            if (selLayer) {
              textScaleDragRef.current = {
                mx: clientX,
                my: clientY,
                baseFontSize: selLayer.textStyle.fontSize,
                baseX: selLayer.x,
                baseY: selLayer.y,
                corner,
                layerId: curSelId,
              };
              isPainting.current = true;
              setDomHiddenTextId(curSelId); // DOM 오버레이에서 즉시 숨김 (잔상 방지)
              return;
            }
          }
        }

        // 3. 텍스트 레이어 히트 테스트
        const hitId = hitTestTextLayer(pos);

        if (hitId) {
          // 선택 여부 관계없이 드래그 준비 (mouseup에서 드래그 거리로 이동 vs 편집 구분)
          const targetLayer = layersRef.current.find(l => l.id === hitId)!;
          if (curSelId !== hitId) {
            // 미선택 → 선택
            selectedTextLayerIdRef.current = hitId;
            hoveredTextLayerIdRef.current = null;
            textMarchLayerIdRef.current = hitId;
            textMarchModeRef.current = 'selected';
            startTextMarching(hitId, 'selected');
            bumpTextUI();
          }
          // 드래그 준비 (이미 선택이든 새 선택이든 항상)
          textDragRef.current = {
            mx: clientX,
            my: clientY,
            lx: targetLayer.x,
            ly: targetLayer.y,
            layerId: hitId,
          };
          textLivePosRef.current = null;
          isPainting.current = true;
          setDomHiddenTextId(hitId); // DOM 오버레이에서 즉시 숨김 (잔상 방지)
        } else {
          // 빈 공간 클릭
          if (curSelId) {
            // 이미 선택된 게 있었다면 선택 해제만 함 (새로 만들지 않음)
            selectedTextLayerIdRef.current = null;
            stopTextMarching();
            bumpTextUI();
          } else {
            // 아무것도 선택되지 않았을 때만 새 텍스트 입력 시작
            textPosRef.current = pos;
            textInputRef.current = '';
            editingTextLayerIdRef.current = null;
            isEditingTextRef.current = true;
            bumpTextUI();
            setTimeout(() => {
              if (textareaRef.current) {
                textareaRef.current.value = '';
                textareaRef.current.style.height = 'auto';
                textareaRef.current.focus();
              }
            }, 50);
          }
        }
        return;
      } else {
        // 도구별 작업 시작 시 스냅샷/캐시 생성 (성능 및 품질 핵심)
        const activeOriginal = getActiveOriginal();
        if (activeOriginal) {
          const w = activeOriginal.width;
          const h = activeOriginal.height;

          // 1. 원본 스냅샷 (Clone/Heal용)
          if (!originalSnapshotRef.current) originalSnapshotRef.current = document.createElement('canvas');
          originalSnapshotRef.current.width = w;
          originalSnapshotRef.current.height = h;
          originalSnapshotRef.current.getContext('2d')!.drawImage(activeOriginal, 0, 0);

          // 2. 전체 블러 캐시 (Blur Tool용 - 미리 한 번만 연산)
          if (tool === 'blur-brush') {
            if (!blurCacheRef.current) blurCacheRef.current = document.createElement('canvas');
            blurCacheRef.current.width = w;
            blurCacheRef.current.height = h;
            const bCtx = blurCacheRef.current.getContext('2d')!;
            bCtx.filter = `blur(${Math.max(1, brushBlurRef.current)}px)`;
            bCtx.drawImage(activeOriginal, 0, 0);
          }
        }

        // 픽셀을 수정하는 도구가 아닐 때만(예: Move) mousedown 시점에 pre-snapshot 시작
        const isPixelModifyingTool = ['paint', 'erase', 'restore', 'clone', 'heal', 'blur-brush', 'bucket'].includes(tool);
        if (!isPixelModifyingTool) {
          const activeLayer = layersRef.current.find(l => l.id === activeLayerIdRef.current);
          if (activeLayer) prepareSnapshot(activeLayerIdRef.current, activeLayer);
        }

        isPainting.current = true;
        hasStrokeRef.current = false;
        lastPos.current = pos;
        initialMousePos.current = pos;
        paint(pos);
      }
    },
    [tool, getCanvasPos, handleWand, handleBucket, handleEyedropper, paint, saveMaskSnapshot, drawCropOverlay, cropRect, zoom, brushSize, originalSnapshotRef, blurCacheRef, getActiveOriginal, getActiveLayer, hitTestTextCorner, hitTestTextLayer, stopTextMarching, startTextMarching, bumpTextUI, prepareSnapshot]
  );


  const applyMarqueeSelection = useCallback(() => {
    const rect = cropRectRef.current;
    if (!rect || rect.w < 2 || rect.h < 2) return;
    const activeOriginal = getActiveOriginal();
    if (!activeOriginal) return;

    const w = activeOriginal.width;
    const h = activeOriginal.height;
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
    if (toolRef.current === 'move' && moveDragStart.current) {
      // Move 드래그 완료 → live 위치를 state에 커밋 (히스토리 1회)
      const livePos = moveLivePosRef.current;
      moveDragStart.current = null;
      moveLivePosRef.current = null;
      if (livePos) {
        const next = layersRef.current.map(l => l.id === activeLayerId ? { ...l, x: livePos.x, y: livePos.y } : l);
        layersRef.current = next;
        setLayers(next);
        commitLayerMove(next, activeLayerId);
      }
    }
    if (toolRef.current === 'text' && textDragRef.current) {
      const livePos = textLivePosRef.current;
      const drag = textDragRef.current;
      const dragLayerId = drag.layerId;
      // livePos가 설정됐으면 실제로 mousemove가 발생한 것 (드래그)
      const didDrag = livePos !== null;
      textDragRef.current = null;
      textLivePosRef.current = null;
      textLiveOverrideRef.current = null; // override 해제
      setDomHiddenTextId(null); // DOM 오버레이 잔상 해제

      if (didDrag && livePos) {
        // 실제 이동 → 커밋 (히스토리 1회)
        const next = layersRef.current.map(l => l.id === dragLayerId ? { ...l, x: livePos.x, y: livePos.y } : l);
        layersRef.current = next;
        setLayers(next);
        commitLayerMove(next, dragLayerId);
        selectedTextLayerIdRef.current = dragLayerId;
        textMarchLayerIdRef.current = dragLayerId;
        textMarchModeRef.current = 'selected';
      } else if (!didDrag && selectedTextLayerIdRef.current === dragLayerId && !isEditingTextRef.current) {
        // 짧은 클릭 + 이미 선택된 레이어 + 편집 중 아님 → 편집 모드 진입
        const layer = layersRef.current.find(l => l.id === dragLayerId);
        if (layer) {
          editingTextLayerIdRef.current = dragLayerId;
          textInputRef.current = layer.textContent;
          textStyleRef.current = { ...layer.textStyle };
          textPosRef.current = { x: layer.x, y: layer.y };
          isEditingTextRef.current = true;
          setTextStyle({ ...layer.textStyle });
          stopTextMarching();
          bumpTextUI();
          setTimeout(() => {
            if (textareaRef.current) {
              textareaRef.current.value = layer.textContent;
              textareaRef.current.style.height = 'auto';
              textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
              textareaRef.current.focus();
              textareaRef.current.select();
            }
          }, 50);
        }
      }
      // else: 처음 선택된 레이어(드래그 없음) → 선택 상태 유지, 아무것도 안 함
    }
    if (toolRef.current === 'text' && textScaleDragRef.current) {
      // Text scale 완료 → state에 커밋 (히스토리 1회)
      const drag = textScaleDragRef.current;
      const liveSize = textScaleLiveSizeRef.current;
      const liveOverride = textLiveOverrideRef.current;
      const scaleLayerId = drag.layerId;
      textScaleDragRef.current = null;
      textScaleLiveSizeRef.current = null;
      textLiveOverrideRef.current = null;
      setDomHiddenTextId(null); // DOM 오버레이 잔상 해제
      if (liveSize !== null) {
        const finalX = liveOverride?.x ?? drag.baseX;
        const finalY = liveOverride?.y ?? drag.baseY;
        const next = layersRef.current.map(l => l.id === scaleLayerId
          ? { ...l, x: finalX, y: finalY, textStyle: { ...l.textStyle, fontSize: liveSize } }
          : l);
        layersRef.current = next;
        setLayers(next);
        commitLayerMove(next, scaleLayerId);
        textStyleRef.current = { ...textStyleRef.current, fontSize: liveSize };
        setTextStyle(s => ({ ...s, fontSize: liveSize }));
      }
      // selected 상태 유지
      selectedTextLayerIdRef.current = scaleLayerId;
      textMarchLayerIdRef.current = scaleLayerId;
      textMarchModeRef.current = 'selected';
    }
    if (isPainting.current && (hasStrokeRef.current || toolRef.current === 'paint' || toolRef.current === 'erase' || toolRef.current === 'restore')) {
      let label = 'Edit';
      const t = toolRef.current;
      if (t === 'erase') label = 'Eraser Tool';
      else if (t === 'restore') label = 'Restore';
      else if (t === 'paint') label = 'Brush Tool';
      else if (t === 'clone') label = 'Clone Stamp Tool';
      else if (t === 'heal') label = 'Healing Brush Tool';
      else if (t === 'blur-brush') label = 'Blur Tool';

      saveMaskSnapshot(label);
      // 픽셀 작업 후 동기식 setLayers 제거 (setTimeout을 통한 비동기 히스토리 업데이트가 UI를 갱신함)
    }
    isPainting.current = false;
    hasStrokeRef.current = false;
    lastPos.current = null;
    setIsDraggingHandle(null);
    isDraggingHandleRef.current = null; // Ref 동시 초기화
  }, [saveMaskSnapshot, commitLayerMove, setLayers, activeLayerId, startTextMarching, stopTextMarching, bumpTextUI]);

  // ── 크롭 실행 ────────────────────────────────────────────
  const applyCrop = useCallback(() => {
    const rect = cropRectRef.current;
    if (!rect || rect.w < 2 || rect.h < 2) return;
    if (!canvasRef.current) return;

    const sx = Math.round(rect.x);
    const sy = Math.round(rect.y);
    const sw = Math.round(rect.w);
    const sh = Math.round(rect.h);

    // 모든 레이어를 크롭
    setLayers(prev => {
      const next = prev.map(layer => {
        if (!layer.originalCanvas || !layer.maskCanvas) return layer;
        const origCropped = document.createElement('canvas');
        origCropped.width = sw; origCropped.height = sh;
        origCropped.getContext('2d')!.drawImage(layer.originalCanvas, sx - layer.x, sy - layer.y, sw, sh, 0, 0, sw, sh);
        const maskCropped = document.createElement('canvas');
        maskCropped.width = sw; maskCropped.height = sh;
        maskCropped.getContext('2d')!.drawImage(layer.maskCanvas, sx - layer.x, sy - layer.y, sw, sh, 0, 0, sw, sh);
        return { ...layer, originalCanvas: origCropped, maskCanvas: maskCropped, x: 0, y: 0 };
      });
      compositeLayersAndRender(next);
      return next;
    });

    updateCanvasSize(sw, sh);
    cropRectRef.current = null;
    setCropRect(null);
    overlayRef.current?.getContext('2d')?.clearRect(0, 0, sw, sh);
    saveMaskSnapshot('Crop');
  }, [compositeLayersAndRender, saveMaskSnapshot, updateCanvasSize, setLayers]);

  const cancelCrop = useCallback(() => {
    cropRectRef.current = null;
    setCropRect(null);
    if (overlayRef.current) {
      overlayRef.current.getContext('2d')!.clearRect(0, 0, overlayRef.current.width, overlayRef.current.height);
    }
  }, []);

  // ── 여백 컷 ──────────────────────────────────────────────
  const autoCrop = useCallback(() => {
    if (!canvasRef.current) return;
    const bounds = getAutoCropBounds(canvasRef.current, cropMargin);
    if (!bounds) return;

    const { x, y, w, h } = bounds;

    setLayers(prev => {
      const next = prev.map(layer => {
        if (!layer.originalCanvas || !layer.maskCanvas) return layer;
        const origCropped = document.createElement('canvas');
        origCropped.width = w; origCropped.height = h;
        origCropped.getContext('2d')!.drawImage(layer.originalCanvas, x - layer.x, y - layer.y, w, h, 0, 0, w, h);
        const maskCropped = document.createElement('canvas');
        maskCropped.width = w; maskCropped.height = h;
        maskCropped.getContext('2d')!.drawImage(layer.maskCanvas, x - layer.x, y - layer.y, w, h, 0, 0, w, h);
        return { ...layer, originalCanvas: origCropped, maskCanvas: maskCropped, x: 0, y: 0 };
      });
      compositeLayersAndRender(next);
      return next;
    });

    updateCanvasSize(w, h);
    stopMarching();
    saveMaskSnapshot('Crop');
  }, [compositeLayersAndRender, stopMarching, cropMargin, saveMaskSnapshot, updateCanvasSize, setLayers]);

  // ── 배경색 채우기 ─────────────────────────────────────────
  const applyFillColor = useCallback(() => {
    if (!canvasRef.current) return;
    const w = canvasRef.current.width;
    const h = canvasRef.current.height;
    const activeOriginal = getActiveOriginal();
    const activeMask = getActiveMask();
    if (!activeOriginal || !activeMask) return;

    const flat = document.createElement('canvas');
    flat.width = w; flat.height = h;
    const fctx = flat.getContext('2d')!;
    fctx.fillStyle = fillColor;
    fctx.fillRect(0, 0, w, h);
    fctx.drawImage(canvasRef.current, 0, 0);

    activeOriginal.getContext('2d')!.clearRect(0, 0, w, h);
    activeOriginal.getContext('2d')!.drawImage(flat, 0, 0);
    const maskCtx = activeMask.getContext('2d')!;
    maskCtx.fillStyle = 'black';
    maskCtx.fillRect(0, 0, w, h);

    setShowFillPanel(false);
    compositeLayersAndRender(layers);
    saveMaskSnapshot('Fill');
  }, [fillColor, compositeLayersAndRender, layers, saveMaskSnapshot, getActiveOriginal, getActiveMask]);

  const applyBackgroundToTransparency = useCallback(() => {
    if (!canvasRef.current) return;
    const w = canvasRef.current.width;
    const h = canvasRef.current.height;
    const activeOriginal = getActiveOriginal();
    const activeMask = getActiveMask();
    if (!activeOriginal || !activeMask) return;

    const flat = document.createElement('canvas');
    flat.width = w; flat.height = h;
    const fctx = flat.getContext('2d')!;
    fctx.fillStyle = fillColor;
    fctx.fillRect(0, 0, w, h);
    fctx.drawImage(canvasRef.current, 0, 0);

    activeOriginal.getContext('2d')!.clearRect(0, 0, w, h);
    activeOriginal.getContext('2d')!.drawImage(flat, 0, 0);
    activeMask.getContext('2d')!.fillStyle = 'black';
    activeMask.getContext('2d')!.fillRect(0, 0, w, h);

    setShowFillPanel(false);
    compositeLayersAndRender(layers);
    saveMaskSnapshot('Fill');
  }, [fillColor, compositeLayersAndRender, layers, saveMaskSnapshot, getActiveOriginal, getActiveMask]);

  const fillAllTransparency = useCallback(() => {
    if (!canvasRef.current) return;
    const w = canvasRef.current.width;
    const h = canvasRef.current.height;
    const activeOriginal = getActiveOriginal();
    const activeMask = getActiveMask();
    if (!activeOriginal || !activeMask) return;

    const flat = document.createElement('canvas');
    flat.width = w; flat.height = h;
    const fctx = flat.getContext('2d')!;
    fctx.fillStyle = brushColorRef.current;
    fctx.fillRect(0, 0, w, h);
    fctx.drawImage(canvasRef.current, 0, 0);

    activeOriginal.getContext('2d')!.clearRect(0, 0, w, h);
    activeOriginal.getContext('2d')!.drawImage(flat, 0, 0);
    activeMask.getContext('2d')!.fillStyle = 'black';
    activeMask.getContext('2d')!.fillRect(0, 0, w, h);

    compositeLayersAndRender(layersRef.current);
    saveMaskSnapshot('Fill');
  }, [compositeLayersAndRender, saveMaskSnapshot, getActiveOriginal, getActiveMask]);



  const resetMask = useCallback(() => {
    const activeMask = getActiveMask();
    if (!activeMask) return;
    const ctx = activeMask.getContext('2d')!;
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, activeMask.width, activeMask.height);
    compositeLayersAndRender(layers);
    stopMarching();
    setAiDone(false);
    saveMaskSnapshot('Reset');
  }, [compositeLayersAndRender, layers, stopMarching, saveMaskSnapshot, getActiveMask]);

  // ── 다운로드 ──────────────────────────────────────────────
  /** 텍스트 레이어를 포함한 내보내기용 캔버스를 생성 */
  const buildExportCanvas = useCallback(() => {
    if (!canvasRef.current) return null;
    const src = canvasRef.current;
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = src.width;
    exportCanvas.height = src.height;
    const ctx = exportCanvas.getContext('2d')!;
    // 현재 합성 결과 복사
    ctx.drawImage(src, 0, 0);
    // 텍스트 레이어를 순서대로 래스터화 (DOM 오버레이는 캔버스에 없으므로 여기서 그림)
    for (const layer of layersRef.current) {
      if (layer.type === 'text' && layer.visible) {
        ctx.globalAlpha = layer.opacity / 100;
        renderTextLayerToCtx(ctx, layer);
        ctx.globalAlpha = 1;
      }
    }
    return exportCanvas;
  }, []);

  const download = useCallback(() => {
    if (!canvasRef.current) return;
    const format = downloadFormat;
    const quality = downloadQuality / 100;
    const exportCanvas = buildExportCanvas() ?? canvasRef.current;

    // SVG 처리
    if (format === 'svg') {
      const dataUrl = exportCanvas.toDataURL('image/png');
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${exportCanvas.width}" height="${exportCanvas.height}"><image href="${dataUrl}" width="${exportCanvas.width}" height="${exportCanvas.height}" /></svg>`;
      const blob = new Blob([svg], { type: 'image/svg+xml' });
      const filename = getDownloadFilename(originalName, 'image/svg+xml');
      performDownload(blob, filename);
      setShowDownloadPanel(false);
      return;
    }

    exportCanvas.toBlob(async (blob) => {
      if (!blob) return;
      const filename = getDownloadFilename(originalName, blob.type);
      await performDownload(blob, filename);
      setShowDownloadPanel(false);
      setShowSaveToast(true);
    }, `image/${format}`, quality);
  }, [downloadFormat, downloadQuality, originalName, performDownload, buildExportCanvas]);

  // Toast Auto-dismiss
  useEffect(() => {
    if (showSaveToast) {
      const timer = setTimeout(() => setShowSaveToast(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [showSaveToast]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 1. 활성 탭이 아니면 키보드 이벤트 무시 (전역 리스너 충돌 방지)
      if (activeTabId && tabId && activeTabId !== tabId) return;

      const isRangeInput = e.target instanceof HTMLInputElement && (e.target as HTMLInputElement).type === 'range';
      const isTextInput = (e.target instanceof HTMLInputElement && !isRangeInput) || e.target instanceof HTMLTextAreaElement;
      if (isTextInput) return;

      const currentTool = toolRef.current;
      const isCtrl = e.ctrlKey || e.metaKey;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (hasSelection) applySelectionToMask('erase');
      }
      if (isCtrl && e.key === 'z') {
        e.preventDefault();
        undo();
      }
      if (isCtrl && (e.key === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
        e.preventDefault();
        redo();
      }
      if (isCtrl && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        stopMarching();
      }
      if (isCtrl && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        handleSelectAll();
      }

      // Zooming Shortcuts
      if (isCtrl) {
        if (e.key === '=' || e.key === '+') {
          e.preventDefault();
          setZoom(z => Math.min(10, z * 1.2));
        } else if (e.key === '-' || e.key === '_') {
          e.preventDefault();
          setZoom(z => Math.max(0.01, z / 1.2));
        } else if (e.key === '0') {
          e.preventDefault();
          const cw = containerRef.current?.clientWidth ?? 800;
          const ch = containerRef.current?.clientHeight ?? 600;
          setZoom(Math.min((cw - 40) / imageSize.w, (ch - 40) / imageSize.h, 1));
        } else if (e.key === '1') {
          e.preventDefault();
          setZoom(1);
        }
      }

      if (isCtrl && e.key.toLowerCase() === 's') {
        e.preventDefault();
        setShowDownloadPanel(prev => !prev);
      }

      if (e.key === 'Alt') {
        isAltPressedRef.current = true;
      }

      // Photoshop shortcuts
      const key = e.key.toLowerCase();
      const code = e.code;

      if (!isCtrl) {
        // Tool Selection
        if (code === 'KeyV' || key === 'v' || key === 'ㅍ') { e.preventDefault(); setTool('move'); stopMarching(); cancelCrop(); }
        else if (code === 'KeyW' || key === 'w' || key === 'ㅈ') { e.preventDefault(); setTool('wand'); cancelCrop(); }
        else if (code === 'KeyT' || key === 't' || key === 'ㅅ') { e.preventDefault(); setTool('text'); stopMarching(); cancelCrop(); }
        else if (code === 'KeyB' || key === 'b' || key === 'ㅠ') { e.preventDefault(); setTool('paint'); stopMarching(); cancelCrop(); }
        else if (code === 'KeyE' || key === 'e' || key === 'ㄷ') { e.preventDefault(); setTool('erase'); stopMarching(); cancelCrop(); }
        else if (code === 'KeyG' || key === 'g' || key === 'ㅎ') { e.preventDefault(); setTool('bucket'); stopMarching(); cancelCrop(); }
        else if (code === 'KeyC' || key === 'c' || key === 'ㅊ') { e.preventDefault(); setTool('crop'); stopMarching(); startMarching(); }
        else if (code === 'KeyR' || key === 'r' || key === 'ㄱ') { e.preventDefault(); setTool('restore'); stopMarching(); cancelCrop(); }
        else if (code === 'KeyI' || key === 'i' || key === 'ㅑ') { e.preventDefault(); setTool('eyedropper'); stopMarching(); cancelCrop(); }
        else if (code === 'KeyS' || key === 's' || key === 'ㄴ') { e.preventDefault(); setTool('clone'); stopMarching(); cancelCrop(); }
        else if (code === 'KeyH' || key === 'h' || key === 'ㅗ') { e.preventDefault(); setTool('heal'); stopMarching(); cancelCrop(); }

        else if (code === 'KeyX' || key === 'x' || key === 'ㅌ') { e.preventDefault(); swapColors(); }
        else if (code === 'KeyD' || key === 'd' || key === 'ㅇ') { e.preventDefault(); resetColors(); }
      }

      // Brush Size shortcuts
      if (['paint', 'erase', 'restore', 'clone', 'heal', 'blur-brush'].includes(currentTool)) {
        const isBracket = e.key === '[' || e.key === ']' || e.key === '{' || e.key === '}';
        const isMath = e.key === '=' || e.key === '+' || e.key === '-' || e.key === '_';

        if (isBracket || isMath) {
          e.preventDefault();
          const isIncr = e.key === '=' || e.key === '+' || e.key === ']' || e.key === '}';
          const isHardness = e.key === '{' || e.key === '}';

          if (isHardness) {
            const hStep = 10;
            const nextHardness = e.key === '}'
              ? Math.min(100, brushHardnessRef.current + hStep)
              : Math.max(0, brushHardnessRef.current - hStep);
            setBrushHardness(nextHardness);
          } else {
            const step = e.shiftKey ? 10 : 2;
            const nextSize = isIncr
              ? Math.min(500, brushSizeRef.current + step)
              : Math.max(1, brushSizeRef.current - step);

            brushSizeRef.current = nextSize;
            if (brushCursorRef.current) {
              const shape = brushShapeRef.current;
              const z = zoomRef.current;
              const finalW = (shape === 'rect-v' || shape === 'rect-v-thin') ? (nextSize / (shape === 'rect-v' ? 2 : 4)) * z : nextSize * z;
              const finalH = (shape === 'rect-h' || shape === 'rect-h-thin') ? (nextSize / (shape === 'rect-h' ? 2 : 4)) * z : nextSize * z;
              brushCursorRef.current.style.width = `${finalW}px`;
              brushCursorRef.current.style.height = `${finalH}px`;
            }
            if (updateSizeTimerRef.current) clearTimeout(updateSizeTimerRef.current);
            updateSizeTimerRef.current = setTimeout(() => {
              setBrushSize(brushSizeRef.current);
            }, 32);
          }
        }
      }

      if (e.key === 'Escape') {
        if (currentTool === 'crop') cancelCrop();
        if (hasSelection) stopMarching();
        if (isEditingTextRef.current) {
          const wasEditingId = editingTextLayerIdRef.current;
          isEditingTextRef.current = false;
          textPosRef.current = null;
          textInputRef.current = '';
          editingTextLayerIdRef.current = null;
          bumpTextUI();
          if (wasEditingId) {
            selectedTextLayerIdRef.current = wasEditingId;
            startTextMarching(wasEditingId, 'selected');
          }
        } else if (selectedTextLayerIdRef.current) {
          selectedTextLayerIdRef.current = null;
          stopTextMarching();
          bumpTextUI();
        }
      }
      if (e.key === 'Enter') {
        if (currentTool === 'crop' && cropRect && cropRect.w > 2) applyCrop();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Alt') {
        isAltPressedRef.current = false;
      }
    };

    const handleBlur = () => {
      isAltPressedRef.current = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [activeTabId, tabId, hasSelection, applySelectionToMask, undo, redo, cancelCrop, applyCrop, cropRect, startMarching, stopMarching, setTool, stopTextMarching, startTextMarching, bumpTextUI, setBrushSize, handleSelectAll, swapColors, resetColors]);

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
    const isAltHeld = (e as any).altKey || isAltPressedRef.current;

    if (brushCursor) {
      brushCursor.style.left = `${lx}px`;
      brushCursor.style.top = `${ly}px`;
      const needsBrush = (toolRef.current === 'erase' || toolRef.current === 'restore' || toolRef.current === 'paint' || toolRef.current === 'clone' || toolRef.current === 'heal' || toolRef.current === 'blur-brush');
      const isPickMode = (toolRef.current === 'clone' || toolRef.current === 'heal' || toolRef.current === 'paint' || toolRef.current === 'bucket' || toolRef.current === 'eyedropper') && isAltHeld;
      brushCursor.style.display = (needsBrush && !isPickMode) ? 'block' : 'none';
      if (isPickMode) overlay.style.cursor = 'crosshair';
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

      if (found) {
        overlay.style.cursor = found;
      } else if (canvasPos.x >= x && canvasPos.x <= x + w && canvasPos.y >= y && canvasPos.y <= y + h) {
        overlay.style.cursor = 'move'; // 영역 내부 커서
      } else {
        overlay.style.cursor = 'crosshair';
      }
    } else if (toolRef.current === 'move') {
      overlay.style.cursor = 'move';
    } else if (toolRef.current === 'text') {
      // Hover detection: find text layer under cursor (ref 기반으로 stale closure 방지)
      if (!isPainting.current && !textDragRef.current && !textScaleDragRef.current) {
        const hitId = hitTestTextLayer(canvasPos);
        const prevHovered = hoveredTextLayerIdRef.current;
        const selId = selectedTextLayerIdRef.current;

        if (hitId !== prevHovered) {
          hoveredTextLayerIdRef.current = hitId;
          if (hitId && hitId !== selId) {
            // hover된 레이어가 선택 중이 아닐 때만 hover 아웃라인
            startTextMarching(hitId, 'hover');
          } else if (!hitId && !selId) {
            stopTextMarching();
          } else if (!hitId && selId) {
            // 마우스가 빠져나갔지만 선택된 레이어가 있으면 selected 아웃라인 유지
            startTextMarching(selId, 'selected');
          }
        }
        // cursor
        const cornerHit = selId ? hitTestTextCorner(selId, canvasPos) : null;
        if (cornerHit) {
          overlay.style.cursor = (cornerHit === 'tl' || cornerHit === 'br') ? 'nwse-resize' : 'nesw-resize';
        } else if (hitId) {
          overlay.style.cursor = 'move';
        } else {
          overlay.style.cursor = 'text';
        }
      }
    } else if (!isPainting.current) {
      const t = toolRef.current as string;
      const needsBrush = (t === 'erase' || t === 'restore' || t === 'paint' || t === 'clone' || t === 'heal' || t === 'blur-brush');
      const isPickMode = (t === 'clone' || t === 'heal' || t === 'paint' || t === 'bucket' || t === 'eyedropper') && isAltHeld;

      overlay.style.cursor = isPickMode ? 'crosshair' : (t === 'wand' || t === 'crop' || t === 'bucket' || t.startsWith('marquee')) ? 'crosshair' : 'none';
      if (brushCursor) brushCursor.style.display = (needsBrush && !isPickMode) ? 'block' : 'none';
    }

    if (isPainting.current) {
      if ('touches' in e) e.preventDefault();

      if (rafId.current) cancelAnimationFrame(rafId.current);
      rafId.current = requestAnimationFrame(() => {
        const currentTool = toolRef.current;
        const pos = canvasPos;
        const draggingHnd = isDraggingHandleRef.current;
        const curCropRect = cropRectRef.current;

        // Clone/Heal Source Preview
        const t = currentTool as string;
        if ((t === 'clone' || t === 'heal') && (cloneSourceRef.current || isAltHeld)) {
          const ctx = overlay.getContext('2d')!;
          // 샘플링 지점 잔상을 방지하기 위해 항상 클리어
          ctx.clearRect(0, 0, overlay.width, overlay.height);

          let srcX, srcY;

          if (isAltHeld) {
            // 소스 지정 중: 마우스 위치가 소스 후보
            srcX = pos.x;
            srcY = pos.y;
          } else if (isPainting.current && cloneOffsetRef.current) {
            // 페인팅 중: 고정된 오프셋 적용
            srcX = pos.x + cloneOffsetRef.current.x;
            srcY = pos.y + cloneOffsetRef.current.y;
          } else if (cloneSourceRef.current) {
            // 대기 중: 마지막 소스 위치 표시 (정렬 모드면 마우스 + 기존 오프셋)
            if (cloneOffsetRef.current) {
              srcX = pos.x + cloneOffsetRef.current.x;
              srcY = pos.y + cloneOffsetRef.current.y;
            } else {
              srcX = cloneSourceRef.current.x;
              srcY = cloneSourceRef.current.y;
            }
          }

          if (srcX !== undefined && srcY !== undefined) {
            ctx.save();
            ctx.strokeStyle = 'white';
            ctx.shadowBlur = 2;
            ctx.shadowColor = 'black';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(srcX - 8, srcY); ctx.lineTo(srcX + 8, srcY);
            ctx.moveTo(srcX, srcY - 8); ctx.lineTo(srcX, srcY + 8);
            ctx.stroke();
            ctx.restore();
          }
        }

        if (currentTool === 'crop') {
          if (draggingHnd === 'move' && curCropRect) {
            // 크롭 영역 이동 로직
            const dx = pos.x - cropStartRef.current!.x;
            const dy = pos.y - cropStartRef.current!.y;
            const newRect = { ...curCropRect, x: curCropRect.x + dx, y: curCropRect.y + dy };
            cropRectRef.current = newRect;
            cropStartRef.current = pos;
            drawCropOverlay(newRect);
          } else if (draggingHnd === 'new') {
            // 새 크롭 영역 그리기
            const start = cropStartRef.current!;
            const newRect = {
              x: Math.min(start.x, pos.x),
              y: Math.min(start.y, pos.y),
              w: Math.abs(pos.x - start.x),
              h: Math.abs(pos.y - start.y)
            };
            cropRectRef.current = newRect;
            drawCropOverlay(newRect);
          } else if (draggingHnd && curCropRect) {
            // 핸들 리사이즈 로직
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
          }
        } else if (currentTool === 'move' && moveDragStart.current) {
          // Move 툴: 활성 레이어 위치 업데이트 (ref에만 저장, setLayers 없음 → 히스토리 미생성)
          const clientX = 'touches' in e ? (e as TouchEvent).touches[0]!.clientX : (e as MouseEvent).clientX;
          const clientY = 'touches' in e ? (e as TouchEvent).touches[0]!.clientY : (e as MouseEvent).clientY;
          const dx = (clientX - moveDragStart.current.mx) / zoomRef.current;
          const dy = (clientY - moveDragStart.current.my) / zoomRef.current;
          const newX = Math.round(moveDragStart.current.lx + dx);
          const newY = Math.round(moveDragStart.current.ly + dy);
          moveLivePosRef.current = { x: newX, y: newY };
          // layersRef로 최신 layers 접근 (stale closure 방지, no setLayers → 히스토리 미생성)
          const liveLayers = layersRef.current.map(l => l.id === activeLayerId ? { ...l, x: newX, y: newY } : l);
          compositeLayersAndRender(liveLayers);
        } else if (currentTool === 'text' && textDragRef.current) {
          // Text drag (move selected text layer) - ref only, no history
          const clientX = 'touches' in e ? (e as TouchEvent).touches[0]!.clientX : (e as MouseEvent).clientX;
          const clientY = 'touches' in e ? (e as TouchEvent).touches[0]!.clientY : (e as MouseEvent).clientY;
          const dx = (clientX - textDragRef.current.mx) / zoomRef.current;
          const dy = (clientY - textDragRef.current.my) / zoomRef.current;
          const newX = Math.round(textDragRef.current.lx + dx);
          const newY = Math.round(textDragRef.current.ly + dy);
          // 3px 이상 이동 시에만 드래그로 인식 (click-to-edit 오발 방지)
          const screenDx = clientX - textDragRef.current.mx;
          const screenDy = clientY - textDragRef.current.my;
          if (Math.abs(screenDx) > 3 || Math.abs(screenDy) > 3) {
            textLivePosRef.current = { x: newX, y: newY };
          }
          // live override → interval이 다음 tick에 정확한 위치로 아웃라인 그림
          textLiveOverrideRef.current = { x: newX, y: newY };
          // Render live using layersRef (no state update → no re-render → no lag)
          const liveLayers = layersRef.current.map(l => l.id === textDragRef.current!.layerId ? { ...l, x: newX, y: newY } : l);
          compositeLayersAndRender(liveLayers, true);
          // 즉시 아웃라인 업데이트 (interval 50ms 기다리지 않음)
          drawTextOutline(textDragRef.current.layerId, 'selected');
        } else if (currentTool === 'text' && textScaleDragRef.current) {
          // Text scale drag: 4개 코너 모두 지원
          const clientX = 'touches' in e ? (e as TouchEvent).touches[0]!.clientX : (e as MouseEvent).clientX;
          const clientY = 'touches' in e ? (e as TouchEvent).touches[0]!.clientY : (e as MouseEvent).clientY;
          const scaleDrag = textScaleDragRef.current;
          const rawDx = (clientX - scaleDrag.mx) / zoomRef.current;
          const rawDy = (clientY - scaleDrag.my) / zoomRef.current;
          // 코너별 크기 증감 방향: tl=-dx-dy, tr=+dx-dy, bl=-dx+dy, br=+dx+dy
          const corner = scaleDrag.corner;
          const signX = (corner === 'tr' || corner === 'br') ? 1 : -1;
          const signY = (corner === 'bl' || corner === 'br') ? 1 : -1;
          const delta = (signX * rawDx + signY * rawDy) * 0.5;
          const newSize = Math.max(8, Math.round(scaleDrag.baseFontSize + delta));
          // tl/tr: 텍스트가 아래로 고정되어야 하므로 y 위치 조정 불필요
          // tl/bl: x 위치도 고정 (텍스트가 오른쪽 앵커)
          // 실제로 텍스트 x,y는 좌상단 기준이므로 우하단 앵커 코너 외엔 위치도 보정
          const sizeDelta = newSize - scaleDrag.baseFontSize;
          let newX = scaleDrag.baseX;
          let newY = scaleDrag.baseY;
          // tl, bl: x 앵커가 우측 → x를 좌로 이동
          if (corner === 'tl' || corner === 'bl') newX = Math.round(scaleDrag.baseX - sizeDelta * 0.6);
          // tl, tr: y 앵커가 하단 → y를 위로 이동
          if (corner === 'tl' || corner === 'tr') newY = Math.round(scaleDrag.baseY - sizeDelta * 1.3);
          textScaleLiveSizeRef.current = newSize;
          const scaleLayerId = scaleDrag.layerId;
          textLiveOverrideRef.current = { fontSize: newSize, x: newX, y: newY };
          const liveLayers = layersRef.current.map(l => l.id === scaleLayerId
            ? { ...l, x: newX, y: newY, textStyle: { ...l.textStyle, fontSize: newSize } }
            : l);
          compositeLayersAndRender(liveLayers, true);
          drawTextOutline(scaleLayerId, 'selected');
        } else if (currentTool === 'erase' || currentTool === 'restore' || currentTool === 'paint' || currentTool === 'clone' || currentTool === 'heal' || currentTool === 'blur-brush') {
          paint(pos);
        } else if (currentTool === 'eyedropper') {
          handleEyedropper(pos);
        }
      });
    }
  }, [getCanvasPos, paint, drawCropOverlay, handleEyedropper, activeLayerId, setLayers, compositeLayersAndRender, hitTestTextLayer, hitTestTextCorner, startTextMarching, stopTextMarching, drawTextOutline]);

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
        if (toolRef.current === 'crop') {
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
      // 리렌더링 트리거하여 눈금자 배경 갱신
    };
    el.addEventListener('scroll', handleScroll);
    return () => el.removeEventListener('scroll', handleScroll);
  }, []);

  const displayWidth = imageSize.w * zoom;
  const displayHeight = imageSize.h * zoom;
  // ── 보정 실행 ──────────────────────────────────────────
  const applyAdjustments = useCallback(() => {
    const activeOriginal = getActiveOriginal();
    if (!activeOriginal) return;
    const w = activeOriginal.width;
    const h = activeOriginal.height;

    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%) blur(${blur}px)`;
    ctx.drawImage(activeOriginal, 0, 0);

    const oCtx = activeOriginal.getContext('2d')!;
    oCtx.clearRect(0, 0, w, h);
    oCtx.drawImage(canvas, 0, 0);

    compositeLayersAndRender(layers);
    saveMaskSnapshot('Adjustments');
    setShowAdjustPanel(false);
    setBrightness(100); setContrast(100); setSaturation(100); setBlur(0);
  }, [brightness, contrast, saturation, blur, compositeLayersAndRender, layers, saveMaskSnapshot, getActiveOriginal]);

  const isBrushTool = tool === 'erase' || tool === 'restore' || tool === 'paint';

  // ── 드롭 다이얼로그 처리 ──────────────────────────────────
  const handleDropFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return;
    if (layers.length === 0) {
      // 레이어가 없으면 새 탭으로 바로
      onImageChange(file);
      return;
    }
    setDropDialog({ file, visible: true });
  }, [layers, onImageChange]);

  const handleDropAddAsLayer = useCallback(() => {
    if (!dropDialog) return;
    const file = dropDialog.file;
    setDropDialog(null);
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      addImageLayer(img, file.name, layers, activeLayerId);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }, [dropDialog, addImageLayer, layers, activeLayerId]);

  const handleDropNewTab = useCallback(() => {
    if (!dropDialog) return;
    const file = dropDialog.file;
    setDropDialog(null);
    onImageChange(file);
  }, [dropDialog, onImageChange]);

  // ── 텍스트 스타일 실시간 반영 (setTextStyle 없이 — 렉 없음) ─────────────
  // 슬라이더 드래그 중 매 onChange마다 호출. React 상태 변경 없음.
  const applyTextStyleLive = useCallback((style: TextStyle) => {
    const editId = editingTextLayerIdRef.current;
    const selId = selectedTextLayerIdRef.current;

    // 선택된 폰트가 구글폰트 등 외부 폰트인 경우 적용 시간을 피하기 위해 명시적 로딩 요청 후 랜더링
    if (style.fontFamily) {
      try {
        // 폰트 로드 완료 시 DOM 오버레이 자동 업데이트 (bumpTextUI로 강제 재렌더)
        document.fonts.load(`${style.fontWeight || 'normal'} ${style.fontSize || 16}px "${style.fontFamily}"`).then(() => {
          bumpTextUI();
        });
      } catch (e) { }
    }

    if (editId) {
      // 편집 중: textarea CSS만 업데이트 (캔버스는 편집 레이어 숨김 상태)
      if (textareaRef.current) {
        textareaRef.current.style.letterSpacing = `${(style.letterSpacing ?? 0) * zoomRef.current}px`;
        textareaRef.current.style.lineHeight = String(style.lineHeight ?? 1.3);
      }
    } else if (selId) {
      // 선택 상태: layersRef + state 모두 업데이트 (DOM 오버레이 즉시 반영)
      const updated = layersRef.current.map(l =>
        l.id === selId ? { ...l, textStyle: { ...l.textStyle, ...style } } : l
      );
      layersRef.current = updated;
      setLayers(updated);
    }
  }, [setLayers]);

  // 슬라이더 드래그 완료: state에 커밋 (히스토리 1회)
  const commitTextStyleChange = useCallback((style: TextStyle) => {
    const selId = selectedTextLayerIdRef.current;
    const editId = editingTextLayerIdRef.current;
    if (selId && !editId) {
      setLayers(prev => {
        const next = prev.map(l =>
          l.id === selId ? { ...l, textStyle: { ...l.textStyle, ...style } } : l
        );
        layersRef.current = next;
        return next;
      });
    }
  }, [setLayers]);

  // ── 텍스트 레이어 확정 (모두 ref에서 읽어 dep 없음 → 렉 없음) ──────────
  const commitTextLayer = useCallback(() => {
    const content = textInputRef.current.trim();
    const pos = textPosRef.current;
    const style = textStyleRef.current;
    const editId = editingTextLayerIdRef.current;

    isEditingTextRef.current = false;
    textPosRef.current = null;
    textInputRef.current = '';
    editingTextLayerIdRef.current = null;
    bumpTextUI();

    if (!content || !pos) return;

    // 확정 후 해당 레이어를 selected 상태로 복귀 (아웃라인 유지)
    if (editId) {
      updateTextLayer(editId, content, style, pos.x, pos.y, layersRef.current, activeLayerId);
      selectedTextLayerIdRef.current = editId;
      startTextMarching(editId, 'selected');
    } else {
      const newLayer = addTextLayer(content, style, pos.x, pos.y, layersRef.current, activeLayerId);
      if (newLayer) {
        selectedTextLayerIdRef.current = newLayer.id;
        startTextMarching(newLayer.id, 'selected');
      }
    }
  }, [updateTextLayer, addTextLayer, activeLayerId, bumpTextUI, startTextMarching]);

  // commitTextLayerRef 동기화 (handleMouseDown에서 선언 전 호출 가능하도록)
  useEffect(() => {
    commitTextLayerRef.current = commitTextLayer;
  }, [commitTextLayer]);

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
    <div
      className="brush-editor-wrap"
      onDragOver={(e) => {
        e.preventDefault();
        if (e.dataTransfer.types.includes('Files')) setIsDraggingFile(true);
      }}
      onDragLeave={() => setIsDraggingFile(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDraggingFile(false);
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) {
          handleDropFile(file);
        }
      }}
    >
      {/* 드롭 다이얼로그 */}
      {dropDialog?.visible && (
        <div className="layer-drop-dialog">
          <div className="layer-drop-dialog-box">
            <div className="layer-drop-dialog-title">{t('editor.drop_question')}</div>
            <div className="layer-drop-dialog-sub">{t('editor.drop_desc')}</div>
            <div className="layer-drop-dialog-filename">{dropDialog.file.name}</div>
            <div className="layer-drop-dialog-btns">
              <button className="layer-drop-btn-primary" onClick={handleDropAddAsLayer}>
                <Layers size={14} />
                {t('editor.add_layer')}
              </button>
              <button className="layer-drop-btn-secondary" onClick={handleDropNewTab}>
                <Plus size={14} />
                {t('editor.open_new_tab')}
              </button>
              <button className="layer-drop-btn-secondary" onClick={() => setDropDialog(null)}>
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {isDraggingFile && (
        <div className="absolute inset-0 z-[2000] flex flex-col items-center justify-center bg-indigo-600/20 backdrop-blur-sm border-2 border-indigo-400 border-dashed rounded-lg">
          <div className="w-16 h-16 bg-indigo-500 rounded-full flex items-center justify-center mb-4 shadow-xl">
            <ImagePlus size={32} className="text-white animate-bounce" />
          </div>
          <p className="text-white font-black text-xl drop-shadow-lg">{t('editor.drop_action_desc')}</p>
          <p className="text-indigo-200 text-sm mt-3">{t('editor.drop_hint')}</p>
        </div>
      )}

      {/* ── TOP BAR (Header) ────────────────────────────────── */}
      <div className="brush-top-bar">
        <div className="flex items-center gap-1">
          <button ref={undoBtnRef} onClick={undo} disabled={!canUndo} className="brush-tool-btn" title={`${t('editor.undo')} (Ctrl+Z)`} aria-label={t('editor.undo')}>
            <Undo2 size={18} aria-hidden="true" />
          </button>
          <button ref={redoBtnRef} onClick={redo} disabled={!canRedo} className="brush-tool-btn" title={`${t('editor.redo')} (Ctrl+Y)`} aria-label={t('editor.redo')}>
            <Redo2 size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="brush-top-sep" />

        <button
          onClick={runAI}
          disabled={isProcessing || aiDone}
          className={`brush-btn-action px-4 h-8 shrink-0 flex items-center gap-2 rounded-full text-xs font-bold ${aiDone ? 'opacity-50' : ''}`}
        >
          <Sparkles size={14} className={isProcessing ? "animate-spin" : ""} />
          {isProcessing ? t('editor.ai_processing') : aiDone ? t('editor.ai_done') : t('editor.ai_bg_removal')}
        </button>

        <div className="brush-top-sep" />

        {/* Integrated Tab Bar */}
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar max-w-2xl px-2">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              onClick={() => setActiveTabId(tab.id)}
              className={cn(
                "flex items-center gap-2 px-3 h-8 rounded-lg cursor-pointer transition-all group shrink-0",
                activeTabId === tab.id
                  ? "bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 shadow-lg shadow-indigo-500/10 font-bold"
                  : "text-gray-500 hover:bg-white/5 hover:text-gray-300"
              )}
            >
              <span className="text-xs truncate max-w-[100px]">{tab.name}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseTab(tab.id, e);
                }}
                className="p-0.5 rounded-full hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label={`${tab.name} ${t('common.close')}`}
              >
                <X size={12} aria-hidden="true" />
              </button>
            </div>
          ))}
          <button
            onClick={() => onAddNewTab()}
            className="p-1.5 rounded-lg text-gray-500 hover:bg-white/5 hover:text-indigo-400 transition-all ml-1 shrink-0"
            title={t('editor.open_new_tab')}
            aria-label={t('editor.open_new_tab')}
          >
            <Plus size={18} aria-hidden="true" />
          </button>
        </div>

        {aiDone && (
          <div className="flex items-center gap-2 ml-4">
            <label htmlFor="ai-adjust-range" className="text-[10px] font-bold text-gray-500 uppercase tracking-tighter">{t('editor.ai_adjust')}</label>
            <input
              id="ai-adjust-range"
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
            {t('common.download')}
          </button>

          {/* Save Success Toast (Positioned near download button) */}
          {showSaveToast && (
            <div className="absolute right-0 top-10 z-[1001] pointer-events-none min-w-[160px]">
              <div className="flex items-center gap-2 px-4 py-2 bg-emerald-500 border border-emerald-400 rounded-xl shadow-[0_8px_24px_rgba(16,185,129,0.4)] animate-in fade-in slide-in-from-bottom-2">
                <div className="w-5 h-5 bg-white/20 rounded-full flex items-center justify-center">
                  <Save size={12} className="text-white" />
                </div>
                <div className="flex flex-col">
                  <span className="text-[12px] font-black text-white leading-tight">{t('editor.save_success')}</span>
                  <span className="text-[8px] text-white/70 font-bold uppercase tracking-wider leading-none">Complete</span>
                </div>
              </div>
            </div>
          )}

          {showDownloadPanel && (
            <div className="brush-fill-panel" style={{ position: 'absolute', left: 'auto', right: '0', top: '2.5rem', zIndex: 1000 }}>
              <div className="brush-panel-title">{t('editor.export_format')}</div>
              <div className="flex gap-1 mb-3">
                {(['png', 'jpeg', 'webp', 'svg'] as const).map(fmt => (
                  <button
                    key={fmt}
                    disabled={!isTransparent && downloadFormat !== fmt}
                    onClick={() => setDownloadFormat(fmt)}
                    className={`flex-1 h-8 rounded text-[10px] uppercase font-bold transition-all ${downloadFormat === fmt
                      ? 'bg-indigo-500 text-white shadow-lg'
                      : 'bg-[#333] text-[#aaa] hover:bg-[#444] disabled:opacity-30 disabled:pointer-events-none'
                      }`}
                  >
                    {fmt === 'jpeg' ? 'JPG' : fmt.toUpperCase()}
                  </button>
                ))}
              </div>
              {!isTransparent && (
                <p className="text-[9px] text-gray-500 mb-2 text-center">{t('editor.transparency_notice')}</p>
              )}
              {downloadFormat !== 'png' && downloadFormat !== 'svg' && (
                <div className="mb-3">
                  <div className="flex justify-between items-center mb-1">
                    <label htmlFor="download-quality" className="text-[10px] text-[#888] font-bold">{t('editor.quality').toUpperCase()}</label>
                    <span className="text-[10px] text-indigo-400 font-bold">{downloadQuality}%</span>
                  </div>
                  <input
                    id="download-quality"
                    type="range" min={10} max={100} step={5} value={downloadQuality}
                    onChange={(e) => setDownloadQuality(Number(e.target.value))}
                    className="w-full range-slider h-1"
                  />
                </div>
              )}
              <button onClick={download} className="brush-btn-action w-full h-8 rounded text-xs font-bold shadow-lg">
                {t('editor.export_now')}
              </button>
            </div>
          )}
        </div>

        {/* 모바일 전용: 패널 토글 버튼 */}
        <button
          className={`mobile-panel-toggle${mobilePanelOpen ? ' active' : ''}`}
          onClick={() => setMobilePanelOpen(v => !v)}
          aria-label={t('editor.layers')}
          title={t('editor.layers')}
        >
          <Layers size={16} aria-hidden="true" />
        </button>
      </div>


      {/* ── MAIN WORKSPACE (Layout) ─────────────────────────── */}
      <div className="brush-editor-layout">
        {/* Left Toolbar */}
        <div className="brush-editor-sidebar-left bg-[#252526] border-r border-[#111] py-2 flex flex-col items-center gap-1">
          <div className="flex flex-col gap-1 mb-2">
            <button onClick={() => { cancelCrop(); setTool('move'); }} className={`brush-tool-btn ${tool === 'move' ? 'brush-tool-btn-active' : ''}`} title={`${t('tools.move')} (V)`} aria-label={t('tools.move')}><Move size={18} aria-hidden="true" /></button>
            <button onClick={() => { cancelCrop(); setTool('wand'); }} className={`brush-tool-btn ${tool === 'wand' ? 'brush-tool-btn-active' : ''}`} title={`${t('tools.wand')} (W)`} aria-label={t('tools.wand')}><Wand2 size={18} aria-hidden="true" /></button>
          </div>
          <div className="toolbar-divider-h w-8 h-[1px] bg-[#333] mb-2" />
          <div className="flex flex-col gap-1 mb-2">
            <button onClick={() => { stopMarching(); cancelCrop(); setTool('crop'); setCropRect(null); cropRectRef.current = null; startMarching(); }} className={`brush-tool-btn ${tool === 'crop' ? 'brush-tool-btn-active' : ''}`} title={`${t('tools.crop')} (C)`} aria-label={t('tools.crop')}><Crop size={18} aria-hidden="true" /></button>
            <button onClick={() => { stopMarching(); cancelCrop(); setTool('eyedropper'); }} className={`brush-tool-btn ${tool === 'eyedropper' ? 'brush-tool-btn-active' : ''}`} title={`${t('tools.eyedropper')} (I)`} aria-label={t('tools.eyedropper')}><Pipette size={18} aria-hidden="true" /></button>
          </div>
          <div className="toolbar-divider-h w-8 h-[1px] bg-[#333] mb-2" />
          <div className="flex flex-col gap-1 mb-2">
            <button onClick={() => { stopMarching(); cancelCrop(); setTool('paint'); }} className={`brush-tool-btn ${tool === 'paint' ? 'brush-tool-btn-active' : ''}`} title={`${t('tools.brush')} (B)`} aria-label={t('tools.brush')}><Brush size={18} aria-hidden="true" /></button>
            <button onClick={() => { stopMarching(); cancelCrop(); setTool('erase'); }} className={`brush-tool-btn ${tool === 'erase' ? 'brush-tool-btn-active' : ''}`} title={`${t('tools.eraser')} (E)`} aria-label={t('tools.eraser')}><Eraser size={18} aria-hidden="true" /></button>
            <button onClick={() => { stopMarching(); cancelCrop(); setTool('restore'); }} className={`brush-tool-btn ${tool === 'restore' ? 'brush-tool-btn-active' : ''}`} title={`${t('tools.restore')} (R)`} aria-label={t('tools.restore')}><RefreshCcw size={18} aria-hidden="true" /></button>
            <button onClick={() => { stopMarching(); cancelCrop(); setTool('bucket'); }} className={`brush-tool-btn ${tool === 'bucket' ? 'brush-tool-btn-active' : ''}`} title={`${t('tools.bucket')} (G)`} aria-label={t('tools.bucket')}><PaintBucket size={18} aria-hidden="true" /></button>
          </div>
          <div className="toolbar-divider-h w-8 h-[1px] bg-[#333] mb-2" />
          <div className="flex flex-col gap-1 mb-2">
            <button onClick={() => { stopMarching(); cancelCrop(); setTool('clone'); }} className={`brush-tool-btn ${tool === 'clone' ? 'brush-tool-btn-active' : ''}`} title={t('tools.clone')} aria-label={t('tools.clone')}><Stamp size={18} aria-hidden="true" /></button>
            <button onClick={() => { stopMarching(); cancelCrop(); setTool('heal'); }} className={`brush-tool-btn ${tool === 'heal' ? 'brush-tool-btn-active' : ''}`} title={t('tools.heal')} aria-label={t('tools.heal')}><LifeBuoy size={18} aria-hidden="true" /></button>
            <button onClick={() => { stopMarching(); cancelCrop(); setTool('blur-brush'); }} className={`brush-tool-btn ${tool === 'blur-brush' ? 'brush-tool-btn-active' : ''}`} title={t('tools.blur')} aria-label={t('tools.blur')}><Droplets size={18} aria-hidden="true" /></button>
          </div>
          <div className="toolbar-divider-h w-8 h-[1px] bg-[#333] mb-2" />
          <div className="flex flex-col gap-1 mb-2">
            <button onClick={() => { stopMarching(); cancelCrop(); setTool('text'); }} className={`brush-tool-btn ${tool === 'text' ? 'brush-tool-btn-active' : ''}`} title={t('tools.text')} aria-label={t('tools.text')}><Type size={18} aria-hidden="true" /></button>
          </div>

          <div className="toolbar-divider-h w-8 h-[1px] bg-[#333] mb-3" />

          {/* Color Picker Section (Photoshop Style) */}
          <div className="toolbar-color-picker flex flex-col items-center gap-2 mb-3 mt-2 relative">
            <div className="relative w-10 h-10">
              {/* Background Color Square */}
              <div className="absolute bottom-0 right-0 z-0">
                <ColorPickerPopup
                  color={brushBgColor}
                  onChange={setBrushBgColor}
                  size={24}
                  className="shadow-lg"
                  title="배경색 변경"
                />
              </div>

              {/* Foreground Color Square */}
              <div className="absolute top-0 left-0 z-10">
                <ColorPickerPopup
                  color={brushColor}
                  onChange={setBrushColor}
                  size={24}
                  className="shadow-xl"
                  title="전경색 변경"
                />
              </div>

              {/* Swap Colors Button */}
              <button
                onClick={swapColors}
                className="absolute top-0 right-0 z-20 p-0.5 bg-[#444] rounded-full hover:bg-[#555] text-white-100 hover:text-white transition-colors shadow-md"
                title={`${t('editor.swap_colors')} (X)`}
                aria-label={t('editor.swap_colors')}
              >
                <ArrowLeftRight size={10} className="-scale-x-100" aria-hidden="true" />
              </button>

              {/* Reset Colors Button */}
              <button
                onClick={resetColors}
                className="absolute bottom-0 left-0 z-20 flex flex-col items-center justify-center p-0.5 bg-[#444] rounded-sm hover:bg-[#555] transition-colors shadow-md"
                title={`${t('editor.reset_colors')} (D)`}
                aria-label={t('editor.reset_colors')}
              >
                <div className="flex gap-[1px]" aria-hidden="true">
                  <div className="w-1.5 h-1.5 bg-black border border-white/20" />
                  <div className="w-1.5 h-1.5 bg-white border border-black/20" />
                </div>
              </button>
            </div>
          </div>

          <div className="toolbar-spacer flex-1" />

          <div className="toolbar-divider-h w-8 h-[1px] bg-[#333] mb-2" />
          <button
            onClick={() => setZoom(z => Math.min(8, z + 0.2))}
            className="brush-tool-btn"
            title={t('editor.zoom_in')}
            aria-label={t('editor.zoom_in')}
          >
            <PlusCircle size={18} aria-hidden="true" />
          </button>
          <button
            onClick={() => setZoom(z => Math.max(0.1, z - 0.2))}
            className="brush-tool-btn"
            title={t('editor.zoom_out')}
            aria-label={t('editor.zoom_out')}
          >
            <MinusCircle size={18} aria-hidden="true" />
          </button>
          <button onClick={() => {
            const container = containerRef.current;
            if (!container) return;
            const containerW = container.clientWidth;
            const containerH = container.clientHeight;
            setZoom(Math.min((containerW - 40) / imageSize.w, (containerH - 40) / imageSize.h, 1));
          }}
            className="brush-tool-btn"
            title={t('editor.fit_screen')}
            aria-label={t('editor.fit_screen')}
          >
            <Maximize2 size={18} aria-hidden="true" />
          </button>
        </div>

        {/* Center Canvas Area */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#1e1e1e] relative">
          {/* Options Bar */}
          <div className="editor-options-bar h-10 border-b border-[#111] bg-[#2d2d2d] flex items-center px-4 gap-4 overflow-hidden flex-shrink-0">
            <div className="flex items-center gap-2 pr-4 border-r border-[#444]">
              {tool === 'move' && <Move size={16} className="text-gray-400" />}
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
              <span className="text-[10px] font-bold text-gray-500 uppercase">{getToolName(tool)}</span>
            </div>
            {/* Tool Options */}
            <div className="flex items-center gap-6 overflow-x-auto no-scrollbar">
              {tool === 'wand' && (
                <>
                  <div className="flex items-center gap-2">
                    <label htmlFor="wand-tolerance" className="text-[10px] font-bold text-gray-400">TOLERANCE</label>
                    <input id="wand-tolerance" type="range" min={5} max={120} value={tolerance} onChange={(e) => setTolerance(Number(e.target.value))} className="w-24 h-1 range-slider" />
                    <span className="text-[11px] font-mono text-indigo-400 w-8">{tolerance}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <label htmlFor="wand-smooth" className="text-[10px] font-bold text-gray-400">SMOOTH</label>
                    <input id="wand-smooth" type="range" min={0} max={20} value={wandSmooth} onChange={(e) => setWandSmooth(Number(e.target.value))} className="w-24 h-1 range-slider" />
                    <span className="text-[11px] font-mono text-indigo-400 w-8">{wandSmooth}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <label htmlFor="wand-expand" className="text-[10px] font-bold text-gray-400">EXPAND</label>
                    <input id="wand-expand" type="range" min={0} max={50} value={wandExpand} onChange={(e) => handleExpandChange(Number(e.target.value))} className="w-24 h-1 range-slider" />
                    <span className="text-[11px] font-mono text-indigo-400 w-8">{wandExpand}</span>
                  </div>
                </>
              )}

              {(tool === 'erase' || tool === 'restore' || tool === 'paint' || tool === 'heal' || tool === 'clone' || tool === 'blur-brush') && (
                <>
                  <div className="flex items-center gap-2">
                    <label htmlFor="opt-brush-size" className="text-[10px] font-bold text-gray-400">SIZE</label>
                    <input id="opt-brush-size" type="range" min={5} max={300} value={brushSize} onChange={(e) => setBrushSize(Number(e.target.value))} className="w-24 h-1 range-slider" />
                    <span className="text-[11px] font-mono text-indigo-400 w-10">{brushSize}px</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <label htmlFor="opt-brush-hardness" className="text-[10px] font-bold text-gray-400">HARDNESS</label>
                    <input id="opt-brush-hardness" type="range" min={0} max={100} value={brushHardness} onChange={(e) => setBrushHardness(Number(e.target.value))} className="w-20 h-1 range-slider" />
                    <span className="text-[11px] font-mono text-indigo-400 w-10">{brushHardness}%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <label htmlFor="opt-brush-opacity" className="text-[10px] font-bold text-gray-400">OPACITY</label>
                    <input id="opt-brush-opacity" type="range" min={10} max={100} value={brushOpacity} onChange={(e) => setBrushOpacity(Number(e.target.value))} className="w-20 h-1 range-slider" />
                    <span className="text-[11px] font-mono text-indigo-400 w-10">{brushOpacity}%</span>
                  </div>
                  {tool === 'blur-brush' && (
                    <div className="flex items-center gap-2">
                      <label htmlFor="opt-brush-blur" className="text-[10px] font-bold text-gray-400">BLUR</label>
                      <input id="opt-brush-blur" type="range" min={1} max={100} value={brushBlur} onChange={(e) => setBrushBlur(Number(e.target.value))} className="w-20 h-1 range-slider" />
                      <span className="text-[11px] font-mono text-indigo-400 w-8">{brushBlur}</span>
                    </div>
                  )}
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
                  <ColorPickerPopup
                    color={brushColor}
                    onChange={setBrushColor}
                    size={20}
                    title="브러시 색상"
                  />
                  <span className="text-[11px] font-mono text-gray-400">{brushColor.toUpperCase()}</span>
                </div>
              )}

              {tool === 'bucket' && (
                <div className="flex items-center gap-2">
                  <label htmlFor="bucket-tolerance" className="text-[10px] font-bold text-gray-400">TOLERANCE</label>
                  <input id="bucket-tolerance" type="range" min={5} max={120} value={tolerance} onChange={(e) => setTolerance(Number(e.target.value))} className="w-28 h-1 range-slider" />
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


              {tool === 'move' && (
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-bold text-gray-400">MOVE</span>
                  {getActiveLayer() && (
                    <span className="text-[11px] font-mono text-indigo-400">
                      x: {getActiveLayer()!.x} y: {getActiveLayer()!.y}
                    </span>
                  )}
                </div>
              )}

              {tool === 'text' && (
                <div className="flex items-center gap-3">
                  <label htmlFor="font-family-select" className="text-[10px] font-bold text-gray-400">FONT</label>
                  <select
                    id="font-family-select"
                    value={textStyle.fontFamily}
                    onChange={(e) => { const v = { ...textStyleRef.current, fontFamily: e.target.value }; textStyleRef.current = v; setTextStyle(v); applyTextStyleLive(v); commitTextStyleChange(v); }}
                    className="h-6 bg-[#333] text-gray-300 text-[10px] border-0 rounded px-1 max-w-[120px]"
                  >
                    <optgroup label="국문 (Korean)">
                      {[
                        // 인기 무료 상업용 폰트 (SIL OFL 또는 무료 상업용 라이선스)
                        'Gmarket Sans', 'Gmarket Sans Light', 'Gmarket Sans Medium', 'Gmarket Sans Bold',
                        'MaruBuri', 'MaruBuri SemiBold', 'MaruBuri Bold',
                        'Binggrae', 'Binggrae Bold', 'Binggrae Melona', 'Binggrae Samanco', 'Binggrae Taom',
                        'BM DoHyeon', 'BM Jua', 'BM Hanna 11yrs Old', 'BM Hanna Air', 'BM Kirang Haerang', 'BM Dohyeon', 'BM Euljiro', 'BM Euljiro 10 Years Later', 'BM LeeSa', 'BM COOLJi', 'BM Jua_TTF',
                        'Spoqa Han Sans', 'Spoqa Han Sans Neo', 'Spoqa Han Sans Original',
                        'Pretendard', 'Pretendard JP', 'Pretendard Std',
                        'SUIT', 'SUIT Bold', 'SUIT ExtraBold', 'SUIT Heavy', 'SUIT Light', 'SUIT Medium', 'SUIT Regular', 'SUIT SemiBold', 'SUIT Thin',
                        'Tmoney RoundWind', 'Tmoney RoundWind ExtraBold', 'Tmoney RoundWind Regular',
                        'SeoulNamsan', 'SeoulNamsanM', 'SeoulNamsanB', 'SeoulHangang', 'SeoulHangangM', 'SeoulHangangB', 'SeoulHangangEB',
                        'Hanna', 'Hanna Pro',
                        'Nanum Gothic', 'Nanum Gothic Coding', 'Nanum Myeongjo', 'Nanum Pen Script', 'Nanum Barun Gothic', 'Nanum Barun Pen',
                        'Noto Sans KR', 'Noto Serif KR', 'Noto Sans CJK KR',
                        'Black Han Sans', 'Do Hyeon', 'Jua', 'Yeon Sung', 'Bagel Fat One', 'Gowun Batang', 'Gowun Dodum', 'Song Myung', 'Poor Story', 'IBM Plex Sans KR', 'Gamja Flower', 'Sunflower', 'Gugi', 'Cute Font',
                        'Cafe24 ClassicType', 'Cafe24 Onearth', 'Cafe24 Shining Star', 'Cafe24 Ssurround', 'Cafe24 Ssurround air', 'Cafe24 Sweet', 'Cafe24 Syeheeha', 'Cafe24 Dongdong', 'Cafe24 Moheengaa', 'Cafe24 Danjunghae', 'Cafe24 Deko', 'Cafe24 Godic', 'Cafe24 Goryeong', 'Cafe24 Haeyoom', 'Cafe24 Lovely', 'Cafe24 Okta', 'Cafe24 Ohsquare air', 'Cafe24 Supermagic', 'Cafe24 Yaemin',
                        'MapoAgape', 'MapoBackpacking', 'MapoBoulevard', 'MapoCalmness', 'MapoCapri', 'MapoCheongdaesan', 'MapoCypress', 'MapoDalrae', 'MapoDamaseng', 'MapoDaehang', 'MapoFlowerIsland', 'MapoGoldenPier', 'MapoGonyos', 'MapoGwangjin', 'MapoHongdae', 'MapoHumanism', 'MapoJangdol', 'MapoJipapen', 'MapoMapo', 'MapoMaru', 'MapoNhang', 'MapoPeaceful', 'MapoPickles', 'MapoPigpen', 'MapoPom', 'MapoDacapo',
                      ].sort().map(f => (
                        <option key={f} value={f}>{f}</option>
                      ))}
                    </optgroup>
                    <optgroup label="영문 (English)">
                      {['Roboto', 'Open Sans', 'Montserrat', 'Lato', 'Oswald', 'Playfair Display', 'Merriweather', 'Poppins', 'Raleway', 'Ubuntu', 'Roboto Mono', 'Fira Sans', 'Inter', 'Kanit', 'Prompt', 'Nunito', 'Titillium Web', 'Orbitron', 'Bebas Neue', 'Anton', 'Lobster', 'Pacifico', 'Caveat', 'Dancing Script', 'Righteous', 'Cinzel', 'Cormorant Garamond', 'Exo 2', 'Teko', 'Archivo', 'Jost'].sort().map(f => (
                        <option key={f} value={f}>{f}</option>
                      ))}
                    </optgroup>
                    <optgroup label="System">
                      {['sans-serif', 'serif', 'monospace', 'cursive', 'Arial', 'Georgia', 'Courier New'].map(f => (
                        <option key={f} value={f}>{f}</option>
                      ))}
                    </optgroup>
                  </select>
                  <input
                    aria-label="Font Size"
                    type="number" min={8} max={300} value={textStyle.fontSize}
                    onChange={(e) => { const v = { ...textStyleRef.current, fontSize: Number(e.target.value) }; textStyleRef.current = v; setTextStyle(v); applyTextStyleLive(v); commitTextStyleChange(v); }}
                    className="w-14 h-6 bg-[#333] text-gray-300 text-[10px] border-0 rounded px-1"
                  />
                  <button onClick={() => { const v = { ...textStyleRef.current, fontWeight: (textStyleRef.current.fontWeight === 'bold' ? 'normal' : 'bold') as 'normal' | 'bold' }; textStyleRef.current = v; setTextStyle(v); applyTextStyleLive(v); commitTextStyleChange(v); }}
                    className={`w-6 h-6 rounded text-[11px] font-bold ${textStyle.fontWeight === 'bold' ? 'bg-indigo-500 text-white' : 'bg-[#333] text-gray-400'}`}>B</button>
                  <button onClick={() => { const v = { ...textStyleRef.current, fontStyle: (textStyleRef.current.fontStyle === 'italic' ? 'normal' : 'italic') as 'normal' | 'italic' }; textStyleRef.current = v; setTextStyle(v); applyTextStyleLive(v); commitTextStyleChange(v); }}
                    className={`w-6 h-6 rounded text-[11px] italic ${textStyle.fontStyle === 'italic' ? 'bg-indigo-500 text-white' : 'bg-[#333] text-gray-400'}`}>I</button>
                  <div className="flex gap-1">
                    {(['left', 'center', 'right'] as const).map(a => (
                      <button key={a} onClick={() => { const v = { ...textStyleRef.current, align: a }; textStyleRef.current = v; setTextStyle(v); applyTextStyleLive(v); commitTextStyleChange(v); }}
                        className={`w-6 h-6 rounded flex items-center justify-center ${textStyle.align === a ? 'bg-indigo-500 text-white' : 'bg-[#333] text-gray-400'}`}>
                        {a === 'left' ? <AlignLeft size={10} /> : a === 'center' ? <AlignCenter size={10} /> : <AlignRight size={10} />}
                      </button>
                    ))}
                  </div>
                  <ColorPickerPopup
                    color={textStyle.color}
                    onChange={(hex) => { const v = { ...textStyleRef.current, color: hex }; textStyleRef.current = v; setTextStyle(v); applyTextStyleLive(v); commitTextStyleChange(v); }}
                    size={24}
                    title="텍스트 색상"
                  />
                  <div className="w-px h-4 bg-[#444]" />
                  <label htmlFor="text-ls-input" className="text-[10px] text-gray-400">자간</label>
                  <input
                    id="text-ls-input"
                    type="number" min={-200} max={500} step={1}
                    value={textStyle.letterSpacing ?? 0}
                    onChange={(e) => {
                      const v = { ...textStyleRef.current, letterSpacing: Number(e.target.value) };
                      textStyleRef.current = v;
                      setTextStyle(v);
                      applyTextStyleLive(v);
                      commitTextStyleChange(v);
                    }}
                    className="w-14 h-6 bg-[#333] text-gray-300 text-[10px] border-0 rounded px-1"
                  />
                  <input
                    aria-label="자간 슬라이더"
                    type="range" min={-200} max={500} step={1}
                    defaultValue={textStyle.letterSpacing ?? 0}
                    key={`ls-${editingTextLayerIdRef.current ?? selectedTextLayerIdRef.current}`}
                    onChange={(e) => {
                      const v = { ...textStyleRef.current, letterSpacing: Number(e.target.value) };
                      textStyleRef.current = v;
                      applyTextStyleLive(v);
                    }}
                    onPointerUp={(e) => {
                      const v = { ...textStyleRef.current, letterSpacing: Number((e.target as HTMLInputElement).value) };
                      textStyleRef.current = v;
                      setTextStyle(v);
                      commitTextStyleChange(v);
                    }}
                    className="w-20 h-1 accent-indigo-500"
                  />
                  <label htmlFor="text-lh-input" className="text-[10px] text-gray-400 ml-2">행간</label>
                  <input
                    id="text-lh-input"
                    type="number" min={0.5} max={5.0} step={0.05}
                    value={textStyle.lineHeight ?? 1.3}
                    onChange={(e) => {
                      const v = { ...textStyleRef.current, lineHeight: Number(e.target.value) };
                      textStyleRef.current = v;
                      setTextStyle(v);
                      applyTextStyleLive(v);
                      commitTextStyleChange(v);
                    }}
                    className="w-14 h-6 bg-[#333] text-gray-300 text-[10px] border-0 rounded px-1"
                  />
                  <input
                    aria-label="행간 슬라이더"
                    type="range" min={0.5} max={5.0} step={0.05}
                    defaultValue={textStyle.lineHeight ?? 1.3}
                    key={`lh-${editingTextLayerIdRef.current ?? selectedTextLayerIdRef.current}`}
                    onChange={(e) => {
                      const v = { ...textStyleRef.current, lineHeight: Number(e.target.value) };
                      textStyleRef.current = v;
                      applyTextStyleLive(v);
                    }}
                    onPointerUp={(e) => {
                      const v = { ...textStyleRef.current, lineHeight: Number((e.target as HTMLInputElement).value) };
                      textStyleRef.current = v;
                      setTextStyle(v);
                      commitTextStyleChange(v);
                    }}
                    className="w-20 h-1 accent-indigo-500"
                  />
                  {isEditingTextRef.current && (
                    <button onClick={commitTextLayer} className="px-2 h-6 rounded bg-indigo-500 text-white text-[10px] font-bold">Commit</button>
                  )}
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
              {imageUrl ? (
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

                  {/* 텍스트 레이어 DOM 오버레이 — 벡터 화질로 표시 (편집 중이 아닌 레이어) */}
                  {layers.filter(l => l.type === 'text' && l.visible && l.id !== editingTextLayerIdRef.current && l.id !== domHiddenTextId).map(layer => {
                    const ts = layer.textStyle;
                    const lh = ts.lineHeight ?? 1.3;
                    const ls = ts.letterSpacing ?? 0;
                    const lx = (textLiveOverrideRef.current?.x != null && layer.id === textMarchLayerIdRef.current ? textLiveOverrideRef.current.x : layer.x) * zoom;
                    const ly = (textLiveOverrideRef.current?.y != null && layer.id === textMarchLayerIdRef.current ? textLiveOverrideRef.current.y : layer.y) * zoom;
                    const fontSize = (textLiveOverrideRef.current?.fontSize != null && layer.id === textMarchLayerIdRef.current ? textLiveOverrideRef.current.fontSize : ts.fontSize) * zoom;
                    return (
                      <div
                        key={layer.id}
                        className="text-layer-dom-overlay"
                        style={{
                          position: 'absolute',
                          left: lx,
                          top: ly,
                          opacity: layer.opacity / 100,
                          pointerEvents: 'none',
                          whiteSpace: 'pre',
                          fontFamily: ts.fontFamily,
                          fontSize: `${fontSize}px`,
                          fontWeight: ts.fontWeight,
                          fontStyle: ts.fontStyle,
                          color: ts.color,
                          letterSpacing: `${ls * zoom}px`,
                          lineHeight: lh,
                          textAlign: ts.align,
                          transform: ts.align === 'center' ? 'translateX(-50%)' : ts.align === 'right' ? 'translateX(-100%)' : 'none',
                          userSelect: 'none',
                        }}
                      >
                        {layer.textContent}
                      </div>
                    );
                  })}

                  {/* 텍스트 툴 입력 오버레이 — uncontrolled textarea (렉 없음) */}
                  {isEditingTextRef.current && textPosRef.current && (
                    <div
                      className="text-tool-overlay"
                      style={{
                        left: textPosRef.current.x * zoom,
                        top: textPosRef.current.y * zoom,
                        transform: textStyle.align === 'center' ? 'translateX(-50%)' : textStyle.align === 'right' ? 'translateX(-100%)' : 'none',
                      }}
                    >
                      <textarea
                        ref={textareaRef}
                        className="text-tool-input"
                        defaultValue={textInputRef.current}
                        onChange={(e) => {
                          textInputRef.current = e.target.value;
                          // 내용에 맞게 높이 자동 조절
                          e.target.style.height = 'auto';
                          e.target.style.height = e.target.scrollHeight + 'px';
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitTextLayer(); }
                          if (e.key === 'Escape') {
                            isEditingTextRef.current = false;
                            textPosRef.current = null;
                            textInputRef.current = '';
                            editingTextLayerIdRef.current = null;
                            bumpTextUI();
                          }
                        }}
                        style={{
                          fontSize: `${textStyle.fontSize * zoom}px`,
                          fontFamily: textStyle.fontFamily,
                          fontWeight: textStyle.fontWeight,
                          fontStyle: textStyle.fontStyle,
                          color: textStyle.color,
                          letterSpacing: `${(textStyle.letterSpacing ?? 0) * zoom}px`,
                          lineHeight: textStyle.lineHeight ?? 1.3,
                          textAlign: textStyle.align,
                          whiteSpace: 'pre',
                        }}
                        placeholder={t('editor.text_placeholder')}
                        rows={1}
                      />
                    </div>
                  )}
                </div>
              ) : (
                <div
                  className="editor-upload-center absolute inset-0 flex items-center justify-center p-8 pointer-events-none"
                  style={{ paddingLeft: '110px', paddingTop: '110px' }} // 눈금자 제외 중앙
                >
                  <div
                    className="pointer-events-auto w-full max-w-lg"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (e.dataTransfer.files?.length) {
                        Array.from(e.dataTransfer.files).forEach(file => onImageChange(file));
                      }
                    }}
                    onClick={() => onAddNewTab?.()}
                  >
                    <div
                      className="glass-interactive individual-upload-glass w-full aspect-video bg-[#252526] border border-white/10 rounded-[var(--radius-3xl)] shadow-2xl flex flex-col items-center justify-center relative overflow-hidden"
                    >
                      <div className="upload-icon-container mb-6 bg-indigo-500/10 p-5 rounded-full ring-1 ring-indigo-500/20">
                        <ImagePlus className="w-12 h-12 text-indigo-400" />
                      </div>
                      <p className="upload-text text-2xl font-black text-white text-center">
                        {t('editor.empty_desc')}<br />
                        <span className="text-sm font-bold text-indigo-400 uppercase tracking-widest mt-2 block">{t('editor.empty_hint')}</span>
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className={cn("brush-editor-sidebar-right flex flex-col min-w-[240px]", mobilePanelOpen && "mobile-panel-open")}>
          {/* History — 기본 접힘 및 조건부 렌더링 */}
          <div className="flex-shrink-0 flex flex-col border-b border-[#111]">
            <button
              className="brush-panel-title px-3 py-2 bg-[#333] text-white font-black italic flex justify-between items-center w-full"
              onClick={() => setHistoryOpen(v => !v)}
              aria-expanded={historyOpen}
              aria-label={t('editor.history')}
            >
              <span>{t('editor.history').toUpperCase()}</span>
              <div className="flex items-center gap-1">
                <Activity size={12} className="text-gray-500" aria-hidden="true" />
                <span className="text-[10px] text-gray-500" aria-hidden="true">{historyOpen ? '▲' : '▼'}</span>
              </div>
            </button>
            {historyOpen && (
              <HistoryPanel
                historyStack={historyStack.current}
                historyIndexRef={historyIndexRef}
                jumpToHistory={jumpToHistory}
                subscribeHistory={subscribeHistory}
              />
            )}
          </div>

          {/* Adjustments — 기본 접힘 */}
          <div className="flex-shrink-0 flex flex-col border-b border-[#111]">
            <button
              className="brush-panel-title px-3 py-2 bg-[#333] text-white font-black italic flex justify-between items-center w-full"
              onClick={() => setAdjOpen(v => !v)}
              aria-expanded={adjOpen}
              aria-label={t('editor.adjustments')}
            >
              <span>{t('editor.adjustments').toUpperCase()}</span>
              <div className="flex items-center gap-1">
                <Sliders size={12} className="text-gray-500" aria-hidden="true" />
                <span className="text-[10px] text-gray-500" aria-hidden="true">{adjOpen ? '▲' : '▼'}</span>
              </div>
            </button>
            {adjOpen && <div className="overflow-y-auto no-scrollbar p-3 space-y-3 bg-[#282828]">
              <div className="space-y-3">
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between items-center text-[10px] font-bold text-gray-400">
                    <label htmlFor="adj-brightness">{t('options.brightness').toUpperCase()}</label>
                    <span className="text-indigo-400">{brightness}%</span>
                  </div>
                  <input id="adj-brightness" type="range" min={0} max={200} value={brightness} onChange={(e) => setBrightness(Number(e.target.value))} className="w-full h-1 range-slider" />
                </div>
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between items-center text-[10px] font-bold text-gray-400">
                    <label htmlFor="adj-contrast">{t('options.contrast').toUpperCase()}</label>
                    <span className="text-indigo-400">{contrast}%</span>
                  </div>
                  <input id="adj-contrast" type="range" min={0} max={200} value={contrast} onChange={(e) => setContrast(Number(e.target.value))} className="w-full h-1 range-slider" />
                </div>
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between items-center text-[10px] font-bold text-gray-400">
                    <label htmlFor="adj-saturation">{t('options.saturation').toUpperCase()}</label>
                    <span className="text-indigo-400">{saturation}%</span>
                  </div>
                  <input id="adj-saturation" type="range" min={0} max={200} value={saturation} onChange={(e) => setSaturation(Number(e.target.value))} className="w-full h-1 range-slider" />
                </div>
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between items-center text-[10px] font-bold text-gray-400">
                    <label htmlFor="adj-blur">{t('options.blur').toUpperCase()}</label>
                    <span className="text-indigo-400">{blur}px</span>
                  </div>
                  <input id="adj-blur" type="range" min={0} max={20} value={blur} onChange={(e) => setBlur(Number(e.target.value))} className="w-24 h-1 range-slider" />
                </div>
              </div>
              <button
                onClick={applyAdjustments}
                className="w-full h-8 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-black uppercase rounded transition-colors"
              >
                {t('common.save')}
              </button>
            </div>}
          </div>

          <LayerPanel
            layers={layers}
            activeLayerId={activeLayerId}
            setActiveLayerId={setActiveLayerId}
            // (id: string, vis: boolean) => setLayerVisible(id, vis, layers) 형태의 래퍼는 useLayers에서 이미 처리되거나 여기서 직접 넘김
            setLayerVisible={setLayerVisible}
            setLayerOpacity={setLayerOpacity}
            removeLayer={removeLayer}
            reorderLayer={reorderLayer}
            addPaintLayer={addPaintLayer}
            mergeDown={mergeDown}
            flattenAll={flattenAll}
            imageSize={imageSize}
            subscribeHistory={subscribeHistory}
          />
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

      <div className="hidden">
        <canvas ref={maskSnapshotRef} />
        <canvas ref={tempCanvasRef} />
        <canvas ref={originalRef} />
        <canvas ref={maskRef} />
        <canvas ref={aiResultRef} />
      </div>
    </div >
  );
}
