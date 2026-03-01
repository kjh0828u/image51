import React from 'react';
import { Trash2, Download, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatBytes } from '@/lib/fileUtils';
import { ImageItem } from '@/store/useAppStore';

interface ImageListProps {
    images: ImageItem[];
    onRemove: (id: string) => void;
    onClear: () => void;
    onDownload: (img: ImageItem) => void;
    onAddFiles: () => void;
}

export function ImageList({ images, onRemove, onClear, onDownload, onAddFiles }: ImageListProps) {
    return (
        <div className="image-list" onClick={e => e.stopPropagation()}>
            <div className="image-list-scroll custom-scrollbar">
                {images.map(img => (
                    <div key={img.id} className="image-item">
                        <div className="image-preview checkered-bg">
                            <img src={img.status === 'done' ? img.processedUrl! : img.previewUrl} alt="" />
                        </div>
                        <div className="image-info">
                            <p className="image-filename">{img.file.name}</p>
                            <div className="image-meta">
                                <span className={cn(
                                    "image-status-badge",
                                    img.status === 'processing' ? 'status-processing' :
                                        img.status === 'done' ? 'status-done' : 'status-pending'
                                )}>
                                    {img.status}
                                </span>
                                {img.status === 'done' && img.processedSize && (
                                    <span className="image-size">{formatBytes(img.processedSize)}</span>
                                )}
                                {img.isDownloaded && (
                                    <span className="image-downloaded-badge">
                                        <Check className="w-2.5 h-2.5" />저장됨
                                    </span>
                                )}
                            </div>
                        </div>
                        <div className="image-actions">
                            {img.status === 'done' && img.processedUrl && (
                                <button
                                    onClick={() => onDownload(img)}
                                    className={cn("btn-icon", img.isDownloaded && "text-white/15 hover:text-white/30")}
                                >
                                    <Download className="w-5 h-5" />
                                </button>
                            )}
                            <button onClick={() => onRemove(img.id)} className="btn-icon-delete">
                                <Trash2 className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                ))}
            </div>
            <div className="image-list-footer">
                <button onClick={onAddFiles} className="btn-text btn-text-primary">+ 이미지 추가</button>
                <button onClick={onClear} className="btn-text btn-text-muted">모두 지우기</button>
            </div>
        </div>
    );
}
