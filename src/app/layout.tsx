import type { Metadata } from "next";
import { Noto_Sans_KR } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";
import "../lib/i18n"; // i18n 초기화

import { FontLoader } from "@/components/FontLoader";

const notoSansKr = Noto_Sans_KR({
  variable: "--font-noto-sans-kr",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://image51.rmntwndrs.com"),
  applicationName: "Image51",
  category: "multimedia",
  title: {
    default: "Image51 - All-in-One Online Image AI Tools",
    template: "%s | Image51",
  },
  description: "Remove background, compress, and resize images directly in your browser. Fast, secure, and privacy-focused AI image tools.",
  keywords: [
    "Image51", "Background Removal", "Image Compressor", "Image Resizer", "AI Background Removal",
    "Online Image Editor", "No Upload Image Tool", "배경 제거", "누끼 따기", "이미지 압축", "리사이즈",
    "무료 온라인 도구", "인물 누끼", "사물 누끼", "개인정보 보호 이미지 편집"
  ],
  authors: [{ name: "Image51 Team" }],
  openGraph: {
    title: "Image51 - Smart & Secure Image Converter",
    description: "Remove background, compress, and resize images directly in your browser. Privacy-focused AI tools.",
    url: "https://image51.rmntwndrs.com",
    siteName: "Image51",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Image51 Preview",
      },
    ],
    locale: "ko_KR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Image51 - In-browser Image AI Tools",
    description: "Fast, secure, and free image processing without server uploads.",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  alternates: {
    canonical: "https://image51.rmntwndrs.com",
    languages: {
      "ko-KR": "https://image51.rmntwndrs.com/?lang=ko",
      "en-US": "https://image51.rmntwndrs.com/?lang=en",
      "x-default": "https://image51.rmntwndrs.com/",
    },
  },
};

export const viewport = {
  themeColor: "#4f46e5",
  width: "device-width",
  initialScale: 1,
};



export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Image51',
    operatingSystem: 'Windows, macOS, Linux, iOS, Android',
    applicationCategory: 'MultimediaApplication',
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: '4.8',
      ratingCount: '102',
    },
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
    description: 'Powerful, secure, and free in-browser AI tool to remove backgrounds, compress photos, and resize images. No server uploads - your data stays private.',
  };

  return (
    <html lang="ko">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {/* 비동기 폰트 로딩 최적화 - 사전 연결 설정은 유지 */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://hangeul.pstatic.net" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://spoqa.github.io" crossOrigin="anonymous" />
      </head>
      <body className={`${notoSansKr.variable} antialiased`}>
        <FontLoader />
        {children}
        <Analytics />
      </body>
    </html>
  );
}
