'use client';

import { cn } from '@/lib/utils';
import { Glass } from './Glass';

interface OptionCardProps {
    title: string;
    subtitle?: string;
    className?: string;
    contentClassName?: string;
    headerAction?: React.ReactNode;
    children: React.ReactNode;
    disabled?: boolean;
}

/**
 * OptionCard 컴포넌트
 * 
 * 변환 옵션 각각을 담는 글래스 카드 프레임입니다.
 */
export function OptionCard({
    title,
    subtitle,
    className,
    contentClassName,
    headerAction,
    children,
    disabled
}: OptionCardProps) {
    return (
        <Glass
            variant="card"
            className={cn("h-full", className)}
            contentClassName="glass-content glass-content-full"
        >
            <div className="liquidGlass-effect"></div>

            <div className="card-header">
                <div className="card-header-with-icon">
                    <span className="card-header-title">
                        {title}
                        {subtitle && <span className="card-header-subtitle">({subtitle})</span>}
                    </span>
                </div>
                {headerAction}
            </div>

            <div className={cn("card-content", contentClassName, disabled && "card-content-disabled")}>
                {children}
            </div>
        </Glass>
    );
}
