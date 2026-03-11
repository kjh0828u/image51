import HomeClient from './HomeClient';

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

export default async function Page({ params }: PageProps) {
  const { slug } = await params;
  const initialSlug = slug?.[0];

  return <HomeClient initialSlug={initialSlug} />;
}
