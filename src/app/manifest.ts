import { MetadataRoute } from 'next'

export const dynamic = 'force-static'

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: 'Image51 - All-in-One Online Image AI Tools',
        short_name: 'Image51',
        description: 'Powerful, secure, and free in-browser AI tool to remove backgrounds, compress photos, and resize images.',
        start_url: '/',
        display: 'standalone',
        background_color: '#0a0a0b',
        theme_color: '#4f46e5',
        icons: [
            {
                src: '/favicon.ico',
                sizes: 'any',
                type: 'image/x-icon',
            },
        ],
    }
}
