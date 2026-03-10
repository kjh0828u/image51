import { MetadataRoute } from 'next'

export const dynamic = 'force-static'

export default function robots(): MetadataRoute.Robots {
    return {
        rules: {
            userAgent: '*',
            allow: '/',
            disallow: '',
        },
        sitemap: 'https://image51.rmntwndrs.com/sitemap.xml',
    }
}
