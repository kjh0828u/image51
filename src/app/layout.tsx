import type { Metadata } from "next";
import { Noto_Sans_KR } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";

const notoSansKr = Noto_Sans_KR({
  variable: "--font-noto-sans-kr",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Image51 - Smart Image Converter",
  description: "클라이언트 사이드 이미지 변환 도구 - 배경제거, 압축, 리사이즈 등",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className={`${notoSansKr.variable} antialiased`}>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
