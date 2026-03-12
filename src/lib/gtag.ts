import { sendGAEvent } from '@next/third-parties/google';

/**
 * GA4 이벤트 전송 유틸리티
 * @param eventName 이벤트 명
 * @param params 상세 파라미터 컨텐츠
 */
export const trackEvent = (eventName: string, params?: Record<string, any>) => {
    // 개발 환경에서는 콘솔로그만 출력 (데이터 오염 방지)
    if (process.env.NODE_ENV === 'development') {
        console.log(`[GA Event]: ${eventName}`, params);
        return;
    }

    try {
        sendGAEvent({ event: eventName, value: params });
    } catch (error) {
        console.error('GA Event Track Error:', error);
    }
};
