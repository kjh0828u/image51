import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  output: 'export',
  images: {
    unoptimized: true,
  },
  // 보안 헤더 설정 (실제 배포 환경의 nginx/vercel 등에서도 설정 권장)
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' }, // 클릭재킹 방지
          { key: 'X-Content-Type-Options', value: 'nosniff' }, // MIME 가로채기 방지
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' }, // 정보 노출 제한
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' }, // 불필요한 권한 차단
        ],
      },
    ];
  },
};

export default nextConfig;
