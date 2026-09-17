import { Routes, Route } from 'react-router'
import Home from './pages/Home'
import Sell from './pages/Sell'
import Dashboard from './pages/Dashboard'
import Docs from './pages/Docs'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/sell" element={<Sell />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/docs" element={<Docs />} />
    </Routes>
  )
}
