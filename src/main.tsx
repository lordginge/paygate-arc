import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './index.css'
import { TRPCProvider } from "@/providers/trpc"
import App from './App.tsx'

// Prerendered pages (scripts/prerender.mjs) ship with full markup in #root
// so crawlers and first paint get real content. React then mounts over it
// with the same initial state the capture used (loading states, deferred
// background), so the swap paints identical pixels.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <TRPCProvider>
        <App />
      </TRPCProvider>
    </BrowserRouter>
  </StrictMode>,
)
