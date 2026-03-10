import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
    return {
        rules: {
            userAgent: '*',
            allow: '/',
            disallow: ['/private/', '/api/'], // 비공개 경로나 API가 없으면 '/'만 남겨도 됩니다.
        },
        sitemap: 'https://image51.rmntwndrs.com/sitemap.xml', // 본인 도메인으로 수정하세요.
    }
}
