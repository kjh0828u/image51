/**
 * ToggleSwitch 컴포넌트
 *
 * 커스텀 토글 스위치 (on/off 버튼)
 * - iOS 스타일의 슬라이드 토글
 * - 모든 옵션 카드의 활성화/비활성화에 사용
 *
 * size 옵션:
 * - default: 기본 크기 (메인 토글)
 * - small: 작은 크기 (서브 옵션용)
 */
import { cn } from '@/lib/utils';

interface ToggleSwitchProps {
  checked: boolean;           // 현재 on/off 상태
  onChange: (val: boolean) => void;  // 상태 변경 콜백
  size?: 'default' | 'small'; // 크기 옵션
}

export function ToggleSwitch({ checked, onChange, size = 'default' }: ToggleSwitchProps) {
  return (
    <div
      onClick={() => onChange(!checked)}
      className={cn(
        "toggle",
        size === 'small' ? 'toggle-small' : 'toggle-default',
        checked ? "toggle-on" : "toggle-off"
      )}
    >
      {/* 움직이는 원형 버튼 (thumb) */}
      <div
        className={cn(
          "toggle-thumb",
          size === 'small' ? 'toggle-thumb-small' : 'toggle-thumb-default',
          checked && (size === 'small' ? 'toggle-thumb-on-small' : 'toggle-thumb-on-default')
        )}
      />
    </div>
  );
}
