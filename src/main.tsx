import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Inter is bundled rather than pulled from fonts.googleapis.com: the CDN link
// sent every visitor's IP to Google before they'd agreed to anything, which is
// the one third-party request the app made and the only reason it would have
// needed a consent banner. Self-hosting removes both. Must precede index.css so
// the @font-face rules are defined before the html rule that uses them.
import '@fontsource-variable/inter'
import './index.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
