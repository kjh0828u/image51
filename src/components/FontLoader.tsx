'use client';

import { useEffect } from 'react';

const GOOGLE_FONTS_URL = "https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@100;300;400;500;700;900&family=Noto+Serif+KR:wght@200;300;400;500;600;700;900&family=Nanum+Gothic:wght@400;700;800&family=Nanum+Myeongjo:wght@400;700;800&family=Nanum+Pen+Script&family=Nanum+Gothic+Coding:wght@400;700&family=Black+Han+Sans&family=Do+Hyeon&family=Jua&family=Yeon+Sung&family=Bagel+Fat+One&family=Gowun+Batang:wght@400;700&family=Gowun+Dodum&family=Song+Myung&family=Poor+Story&family=IBM+Plex+Sans+KR:wght@100;200;300;400;500;600;700&family=Gamja+Flower&family=Sunflower:wght@300;500;700&family=Gugi&family=Cute+Font&family=Roboto:wght@100;300;400;500;700;900&family=Open+Sans:wght@300;400;500;600;700;800&family=Montserrat:wght@100;200;300;400;500;600;700;800;900&family=Lato:wght@100;300;400;700;900&family=Oswald:wght@200;300;400;500;600;700&family=Playfair+Display:wght@400;500;600;700;800;900&family=Merriweather:wght@300;400;700;900&family=Poppins:wght@100;200;300;400;500;600;700;800;900&family=Raleway:wght@100;200;300;400;500;600;700;800;900&family=Ubuntu:wght@300;400;500;700&family=Roboto+Mono:wght@100;200;300;400;500;600;700&family=Fira+Sans:wght@100;200;300;400;500;600;700;800;900&family=Inter:wght@100;200;300;400;500;600;700;800;900&family=Kanit:wght@100;200;300;400;500;600;700;800;900&family=Prompt:wght@100;200;300;400;500;600;700;800;900&family=Nunito:wght@200;300;400;500;600;700;800;900;1000&family=Titillium+Web:wght@200;300;400;600;700;900&family=Orbitron:wght@400;500;600;700;800;900&family=Bebas+Neue&family=Anton&family=Lobster&family=Pacifico&family=Caveat:wght@400;500;600;700&family=Dancing+Script:wght@400;500;600;700&family=Righteous&family=Cinzel:wght@400;500;600;700;800;900&family=Cormorant+Garamond:wght@300;400;500;600;700&family=Exo+2:wght@100;200;300;400;500;600;700;800;900&family=Teko:wght@300;400;500;600;700&family=Archivo:wght@100;200;300;400;500;600;700;800;900&family=Jost:wght@100;200;300;400;500;600;700;800;900&display=swap";

const EXTERNAL_FONTS = [
    "https://cdn.jsdelivr.net/gh/webfontworld/gmarket/GmarketSans.css",
    "https://hangeul.pstatic.net/hangeul_static/css/maru-buri.css",
    "https://cdn.jsdelivr.net/gh/ebang106/ebangFont/ebang_font.css",
    "https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css",
    "https://cdn.jsdelivr.net/gh/sun-typeface/SUIT@2/fonts/static/woff2/SUIT.css",
    "https://spoqa.github.io/spoqa-han-sans/css/SpoqaHanSans-kr.css",
    "https://cdn.jsdelivr.net/gh/zzz-daniel/zzz-fonts/TmoneyRoundWind/TmoneyRoundWind.css",
    "https://cdn.jsdelivr.net/gh/velopert/seoul-fonts@master/seoul-fonts.css",
    "https://cdn.jsdelivr.net/gh/cafe24/cafe24-fonts@latest/cafe24-fonts.css",
    "https://cdn.jsdelivr.net/gh/lee-loung/binggrae-font@master/font.css"
];

export function FontLoader() {
    useEffect(() => {
        const loadFont = (url: string) => {
            const link = document.createElement('link');
            link.href = url;
            link.rel = 'stylesheet';
            link.media = 'print';
            link.onload = () => { link.media = 'all'; };
            document.head.appendChild(link);
        };

        loadFont(GOOGLE_FONTS_URL);
        EXTERNAL_FONTS.forEach(loadFont);
    }, []);

    return null;
}
