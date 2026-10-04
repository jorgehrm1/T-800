import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from './AuthContext'

const ICONOS = {
  inicio: 'M3 12l9-8 9 8M5 10v10h5v-6h4v6h5V10',
  ventas: 'M3 3h2l2.4 12.2a2 2 0 002 1.8h8.2a2 2 0 002-1.6L21 8H6M10 21h.01M18 21h.01',
  compras: 'M4 7l8-4 8 4-8 4-8-4zm0 0v10l8 4 8-4V7M12 11v10',
  inventario: 'M4 4h16v4H4zM6 8v12h12V8M10 12h4',
  gastos: 'M12 3v18M17 7H9.5a3 3 0 000 6h5a3 3 0 010 6H6',
  mas: 'M5 12h.01M12 12h.01M19 12h.01',
}
const Icono = ({ d }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
)

const NAV = {
  admin: ['inicio', 'ventas', 'compras', 'inventario', 'gastos', 'mas'],
  bodega: ['inicio', 'ventas', 'compras', 'inventario', 'gastos', 'mas'],
  vendedor: ['inicio', 'ventas', 'inventario', 'gastos', 'mas'],
}
const ETIQUETA = { inicio: 'Inicio', ventas: 'Ventas', compras: 'Compras', inventario: 'Inventario', gastos: 'Gastos', mas: 'Más' }

export default function Layout() {
  const { profile } = useAuth()
  const items = NAV[profile?.rol] || NAV.vendedor

  return (
    <div className="app-shell">
      <header className="topbar">
        <img src="/logo.png" alt="" width="34" height="34" className="top-logo" />
        <div>
          <div className="brand display">T-800</div>
          <div className="rol-badge">{profile?.nombre} · {profile?.rol}{profile?.ubicaciones ? ` · ${profile.ubicaciones.nombre}` : ''}</div>
        </div>
      </header>
      <main className="content"><Outlet /></main>
      <nav className="bottom-nav">
        {items.map(k => (
          <NavLink key={k} to={k === 'inicio' ? '/' : `/${k}`} end={k === 'inicio'} className={({ isActive }) => isActive ? 'active' : ''}>
            <Icono d={ICONOS[k]} /><span>{ETIQUETA[k]}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
