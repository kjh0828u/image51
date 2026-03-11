import type { Metadata } from 'next';
import HomeClient from './HomeClient';

const BASE = 'https://image51.rmntwndrs.com';

export async function generateStaticParams() {
  return [
    { slug: [] }, // /
    { slug: ['image-editor'] }, // /image-editor
    { slug: ['image-batch'] }   // /image-batch
  ];
}

interface PageProps {
  params: Promise<{ slug?: string[] }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = slug?.[0];

  if (page === 'image-batch') {
    return {
      alternates: {
        canonical: `${BASE}/image-batch`,
      },
    };
  }

  // /image-editor 또는 / → /image-editor canonical
  return {
    alternates: {
      canonical: `${BASE}/image-editor`,
    },
  };
}

export default async function Page({ params }: PageProps) {
  const { slug } = await params;
  const initialSlug = slug?.[0];

  return <HomeClient initialSlug={initialSlug} />;
}
