import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import Header from './Header'
import { navItems } from './navigation'
import Sidebar from './Sidebar'

export default function Layout() {
  const [menuOpen, setMenuOpen] = useState(false)
  const { pathname } = useLocation()

  return (
    <div className="app-shell">
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
      <div className="main-shell">
        <Header onMenuClick={() => setMenuOpen(true)} />
        <main className="page-content">
          <Outlet />
        </main>
      </div>
      <nav className="bottom-nav">
        {navItems.map(({ to, label, icon: Icon, children }) => {
          const groupActive = children?.some((child) => child.to === pathname)
          return (
            <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => isActive || groupActive ? 'active' : ''}>
              <Icon size={20} />
              <span>{label === 'Paket Sampler' ? 'Sampler' : label.replace(' & Stok', '')}</span>
            </NavLink>
          )
        })}
      </nav>
    </div>
  )
}
