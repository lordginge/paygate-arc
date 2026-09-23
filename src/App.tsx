import { Routes, Route } from 'react-router'
import Home from './pages/Home'
import Sell from './pages/Sell'
import Dashboard from './pages/Dashboard'
import Docs from './pages/Docs'
import Fund from './pages/Fund'
import Verify from './pages/Verify'
import Status from './pages/Status'
import Legal from './pages/Legal'
import { SiteFooter } from './components/SiteFooter'

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/sell" element={<Sell />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/docs" element={<Docs />} />
        <Route path="/fund" element={<Fund />} />
        <Route path="/verify" element={<Verify />} />
        <Route path="/status" element={<Status />} />
        <Route path="/legal" element={<Legal />} />
      </Routes>
      <SiteFooter />
    </>
  )
}
