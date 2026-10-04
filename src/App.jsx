import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './AuthContext'
import Layout from './Layout'
import Login from './pages/Login'
import Inicio from './pages/Inicio'
import Compras from './pages/Compras'
import Ventas from './pages/Ventas'
import Inventario from './pages/Inventario'
import Gastos from './pages/Gastos'
import Mas from './pages/Mas'

function Rutas() {
  const { session, profile, loading, signOut } = useAuth()
  if (loading) return <p className="muted" style={{ padding: 24 }}>Cargando…</p>
  if (!session) return <Login />
  if (!profile || !profile.activo) {
    return (
      <div className="login">
        <p>Este usuario no tiene un perfil activo en T-800. Pide al administrador que lo active.</p>
        <button onClick={signOut}>Salir</button>
      </div>
    )
  }
  const rol = profile.rol
  const solo = (roles, el) => roles.includes(rol) ? el : <Navigate to="/" replace />

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Inicio />} />
        <Route path="ventas" element={solo(['admin', 'bodega', 'vendedor'], <Ventas />)} />
        <Route path="compras" element={solo(['admin', 'bodega'], <Compras />)} />
        <Route path="inventario" element={<Inventario />} />
        <Route path="gastos" element={<Gastos />} />
        <Route path="mas" element={<Mas />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return <AuthProvider><Rutas /></AuthProvider>
}
