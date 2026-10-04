import { Suspense, lazy } from 'react'
import { Routes, Route, useLocation } from 'react-router'
import Home from './pages/Home'
import { SiteFooter } from './components/SiteFooter'
import { Seo } from './lib/seo'
import NotFound from './pages/NotFound'

// Secondary pages load on demand so first paint on the homepage is not
// paying for code it never runs.
const Sell = lazy(() => import('./pages/Sell'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Docs = lazy(() => import('./pages/Docs'))
const Fund = lazy(() => import('./pages/Fund'))
const Verify = lazy(() => import('./pages/Verify'))
const Status = lazy(() => import('./pages/Status'))
const Legal = lazy(() => import('./pages/Legal'))

export default function App() {
  const location = useLocation()
  return (
    <>
      <Seo path={location.pathname.replace(/\/+$/, '') || '/'} />
      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/sell" element={<Sell />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/docs" element={<Docs />} />
          <Route path="/fund" element={<Fund />} />
          <Route path="/verify" element={<Verify />} />
          <Route path="/status" element={<Status />} />
          <Route path="/legal" element={<Legal />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
      <SiteFooter />
    </>
  )
}
