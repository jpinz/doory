import { Hero } from '@/features/landing/Hero'
import { LocalDesignsStrip } from '@/features/landing/LocalDesignsStrip'
import { usePageMeta } from '@/lib/usePageMeta'

const DESCRIPTION = 'Doory is a free, open-source presentation designer. Create interactive slide decks and presentation games in your browser. No account needed to start.'

export default function LandingPage() {
  usePageMeta({ description: DESCRIPTION, canonical: '/', image: '/og-image.png' })
  return (
    <>
      <Hero />
      <LocalDesignsStrip />
    </>
  )
}
