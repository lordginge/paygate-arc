import { Routes, Route } from 'react-router'
import Home from './pages/Home'
import Maintenance from './components/Maintenance'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/sell" element={<Maintenance name="Sell" />} />
      <Route path="/dashboard" element={<Maintenance name="Dashboard" />} />
      <Route path="/docs" element={<Maintenance name="Docs" />} />
      <Route path="/fund" element={<Maintenance name="Fund" />} />
    </Routes>
  )
}
