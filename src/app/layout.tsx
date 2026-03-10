import type { Metadata } from "next";
import { Noto_Sans_KR } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";
import "../lib/i18n"; // i18n 초기화

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
        {/* 인기 무료 상업용 한국어/영문 폰트 - Google Fonts */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@100;300;400;500;700;900&family=Noto+Serif+KR:wght@200;300;400;500;600;700;900&family=Nanum+Gothic:wght@400;700;800&family=Nanum+Myeongjo:wght@400;700;800&family=Nanum+Pen+Script&family=Nanum+Gothic+Coding:wght@400;700&family=Black+Han+Sans&family=Do+Hyeon&family=Jua&family=Yeon+Sung&family=Bagel+Fat+One&family=Gowun+Batang:wght@400;700&family=Gowun+Dodum&family=Song+Myung&family=Poor+Story&family=IBM+Plex+Sans+KR:wght@100;200;300;400;500;600;700&family=Gamja+Flower&family=Sunflower:wght@300;500;700&family=Gugi&family=Cute+Font&family=Roboto:wght@100;300;400;500;700;900&family=Open+Sans:wght@300;400;500;600;700;800&family=Montserrat:wght@100;200;300;400;500;600;700;800;900&family=Lato:wght@100;300;400;700;900&family=Oswald:wght@200;300;400;500;600;700&family=Playfair+Display:wght@400;500;600;700;800;900&family=Merriweather:wght@300;400;700;900&family=Poppins:wght@100;200;300;400;500;600;700;800;900&family=Raleway:wght@100;200;300;400;500;600;700;800;900&family=Ubuntu:wght@300;400;500;700&family=Roboto+Mono:wght@100;200;300;400;500;600;700&family=Fira+Sans:wght@100;200;300;400;500;600;700;800;900&family=Inter:wght@100;200;300;400;500;600;700;800;900&family=Kanit:wght@100;200;300;400;500;600;700;800;900&family=Prompt:wght@100;200;300;400;500;600;700;800;900&family=Nunito:wght@200;300;400;500;600;700;800;900;1000&family=Titillium+Web:wght@200;300;400;600;700;900&family=Orbitron:wght@400;500;600;700;800;900&family=Bebas+Neue&family=Anton&family=Lobster&family=Pacifico&family=Caveat:wght@400;500;600;700&family=Dancing+Script:wght@400;500;600;700&family=Righteous&family=Cinzel:wght@400;500;600;700;800;900&family=Cormorant+Garamond:wght@300;400;500;600;700&family=Exo+2:wght@100;200;300;400;500;600;700;800;900&family=Teko:wght@300;400;500;600;700&family=Archivo:wght@100;200;300;400;500;600;700;800;900&family=Jost:wght@100;200;300;400;500;600;700;800;900&display=swap" rel="stylesheet" />
        {/* 한국어 전용 무료 상업용 폰트 - 각 사이트 CDN */}
        {/* Gmarket Sans */}
        <link href="https://cdn.jsdelivr.net/gh/webfontworld/gmarket/GmarketSans.css" rel="stylesheet" />
        {/* MaruBuri (마루부리) */}
        <link href="https://hangeul.pstatic.net/hangeul_static/css/maru-buri.css" rel="stylesheet" />
        {/* BM (배달의민족) 폰트들 */}
        <link href="https://cdn.jsdelivr.net/gh/ebang106/ebangFont/ebang_font.css" rel="stylesheet" />
        {/* Pretendard */}
        <link href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css" rel="stylesheet" />
        {/* SUIT */}
        <link href="https://cdn.jsdelivr.net/gh/sun-typeface/SUIT@2/fonts/static/woff2/SUIT.css" rel="stylesheet" />
        {/* Spoqa Han Sans */}
        <link href="//spoqa.github.io/spoqa-han-sans/css/SpoqaHanSans-kr.css" rel="stylesheet" type="text/css" />
        {/* Tmoney RoundWind */}
        <link href="https://cdn.jsdelivr.net/gh/zzz-daniel/zzz-fonts/TmoneyRoundWind/TmoneyRoundWind.css" rel="stylesheet" />
        {/* 서울서체 (Seoul Fonts) */}
        <link href="https://cdn.jsdelivr.net/gh/velopert/seoul-fonts@master/seoul-fonts.css" rel="stylesheet" />
        {/* Cafe24 폰트들 */}
        <link href="https://cdn.jsdelivr.net/gh/cafe24/cafe24-fonts@latest/cafe24-fonts.css" rel="stylesheet" />
        {/* 빙그레 폰트 */}
        <link href="https://cdn.jsdelivr.net/gh/lee-loung/binggrae-font@master/font.css" rel="stylesheet" />
      </head>
      <body className={`${notoSansKr.variable} antialiased`}>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
