/**
 * SortablePresetItem 컴포넌트
 *
 * 드래그 앤 드롭으로 정렬 가능한 프리셋 아이템
 * - @dnd-kit 라이브러리 사용
 * - 프리셋 목록에서 각 아이템을 드래그로 순서 변경
 *
 * 주요 기능:
 * - 드래그 핸들로 순서 변경
 * - 현재 활성 프리셋 표시
 * - 저장/수정/삭제 버튼 (호버 시 표시)
 */
import { Save, Pencil, Trash2, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Profile } from '@/store/useAppStore';

interface SortablePresetItemProps {
  p: Profile;                           // 프리셋 데이터 (id, name, options)
  isActive: boolean;                    // 현재 선택된 프리셋인지 여부
  onLoad: (id: string) => void;         // 프리셋 로드 콜백
  onUpdate: (id: string, name: string) => void;   // 현재 설정으로 덮어쓰기 콜백
  onRename: (id: string, oldName: string) => void; // 이름 수정 콜백
  onDelete: (id: string, name: string) => void;   // 삭제 콜백
}

export function SortablePresetItem({ p, isActive, onLoad, onUpdate, onRename, onDelete }: SortablePresetItemProps) {
  // dnd-kit의 useSortable 훅으로 드래그 기능 연결
  const {
    attributes,    // 접근성 속성
    listeners,     // 드래그 이벤트 리스너
    setNodeRef,    // DOM 참조 설정 함수
    transform,     // 드래그 중 변형 값
    transition,    // 애니메이션 transition
    isDragging     // 현재 드래그 중인지 여부
  } = useSortable({ id: p.id });

  // 드래그 중 위치 변환을 위한 스타일
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    position: 'relative' as const,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "preset-item glass",
        isActive && "preset-item-active",
        isDragging && "preset-item-dragging"
      )}
      onClick={() => onLoad(p.id)}
    >
      {/* 프리셋 이름 + 드래그 핸들 영역 */}
      <div className="preset-item-content">
        {/* 드래그 핸들 - 여기를 잡고 드래그 */}
        <div {...attributes} {...listeners} className="preset-drag-handle">
          <GripVertical className="w-3.5 h-3.5" />
        </div>
        <span className="preset-name">{p.name}</span>
      </div>

      {/* 액션 버튼들 (호버 시 표시) */}
      <div className="preset-actions">
        {/* 현재 설정으로 덮어쓰기 */}
        <button
          onClick={(e) => { e.stopPropagation(); onUpdate(p.id, p.name); }}
          className="preset-action-btn"
          title="현재 설정 저장 (덮어쓰기)"
        >
          <Save className="w-3.5 h-3.5" />
        </button>

        {/* 이름 수정 */}
        <button
          onClick={(e) => { e.stopPropagation(); onRename(p.id, p.name); }}
          className="preset-action-btn preset-action-btn-edit"
          title="이름 수정"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>

        {/* 삭제 */}
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(p.id, p.name); }}
          className="preset-action-btn preset-action-btn-delete"
          title="삭제"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
