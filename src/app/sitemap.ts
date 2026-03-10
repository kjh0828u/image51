import { MetadataRoute } from 'next'

export const dynamic = 'force-static'

export default function sitemap(): MetadataRoute.Sitemap {
    const baseUrl = 'https://image51.rmntwndrs.com'
    const lastModified = new Date()

    return [
        { url: baseUrl, lastModified, changeFrequency: 'daily', priority: 1.0 },

        // --- Core Tools (SEO Keywords) ---
        // 배경 제거 (Background Removal)
        { url: `${baseUrl}/?tool=bg-removal`, lastModified, changeFrequency: 'weekly', priority: 0.9 },
        { url: `${baseUrl}/?lang=ko&tool=background-removal`, lastModified, changeFrequency: 'weekly', priority: 0.8 },

        // 이미지 압축 (Image Compression)
        { url: `${baseUrl}/?tool=compress`, lastModified, changeFrequency: 'weekly', priority: 0.9 },
        { url: `${baseUrl}/?lang=ko&tool=compression`, lastModified, changeFrequency: 'weekly', priority: 0.8 },

        // 이미지 리사이즈 (Image Resize)
        { url: `${baseUrl}/?tool=resize`, lastModified, changeFrequency: 'weekly', priority: 0.9 },
        { url: `${baseUrl}/?lang=ko&tool=resizing`, lastModified, changeFrequency: 'weekly', priority: 0.8 },

        // 일괄 처리 (Batch Processing)
        { url: `${baseUrl}/?view=batch`, lastModified, changeFrequency: 'weekly', priority: 0.8 },

        // --- Language Variants ---
        { url: `${baseUrl}/?lang=ko`, lastModified, changeFrequency: 'monthly', priority: 0.7 },
        { url: `${baseUrl}/?lang=en`, lastModified, changeFrequency: 'monthly', priority: 0.7 },
    ]
}
