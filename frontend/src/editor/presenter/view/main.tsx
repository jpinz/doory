/** Entry point of `presenter-view.html`, the page "Present with notes" opens in a second window. */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import '@fontsource-variable/plus-jakarta-sans'
import '@fontsource-variable/nunito'
import '@fontsource-variable/nunito/wght-italic.css'
import '@fontsource-variable/fraunces/opsz.css'
import '@fontsource-variable/fraunces/opsz-italic.css'
import '@fontsource-variable/caveat'
import '@/styles/tokens.css'
import '@/styles/global.css'
import { initContrast } from '@/lib/contrast'
import { FlowMapView } from './FlowMapView'
import { PresenterView } from './PresenterView'

initContrast()

const params = new URLSearchParams(location.search)
const session = params.get('session')

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    {params.get('panel') === 'flow' ? <FlowMapView session={session} /> : <PresenterView session={session} />}
  </StrictMode>,
)
