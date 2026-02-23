/**
 * Glass 컴포넌트
 *
 * 글래스모피즘 컨테이너
 * - filter, overlay, specular 레이어로 입체감 표현
 *
 * variant 옵션:
 * - default: 기본 투명도
 * - bright: 밝은 배경용 (더 투명)
 * - thick: 두꺼운 느낌 (덜 투명)
 * - card: 카드 전용 스타일
 */
import { cn } from '@/lib/utils';

interface GlassProps {
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  variant?: 'default' | 'bright' | 'thick' | 'card';
  style?: React.CSSProperties;
}

export function Glass({ children, className, contentClassName, variant = 'default', style }: GlassProps) {
  // variant에 따른 CSS 클래스 결정 (default는 'glass', 나머지는 'glass-{variant}')
  const variantClass = variant === 'default' ? 'glass' : `glass-${variant}`;

  return (
    <div className={cn("glass-container", variantClass, className)} style={style}>
      {/* 배경 블러 효과 레이어 - backdrop-filter로 유리 효과 구현 */}
      <div className="glass-filter" />

      {/* 배경색 오버레이 레이어 - 투명도 조절 */}
      <div className="glass-overlay" />

      {/* 하이라이트/경계 효과 레이어 - 유리 테두리 빛 반사 효과 */}
      <div className="glass-specular" />

      {/* 실제 콘텐츠가 들어가는 영역 */}
      <div className={cn("glass-content", contentClassName)}>{children}</div>
    </div>
  );
}
