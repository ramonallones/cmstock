import { useEffect, useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { navItems } from './navigation'

export default function Sidebar({ open, onClose }) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const activeGroup = useMemo(
    () => navItems.find((item) => item.children?.some((child) => child.to === pathname))?.to,
    [pathname],
  )
  const [openGroups, setOpenGroups] = useState(() => activeGroup ? { [activeGroup]: true } : {})

  useEffect(() => {
    if (activeGroup) setOpenGroups((current) => ({ ...current, [activeGroup]: true }))
  }, [activeGroup])

  const toggleGroup = (groupTo) => {
    setOpenGroups((current) => ({ ...current, [groupTo]: !current[groupTo] }))
  }

  return (
    <>
      <button
        className={`sidebar-overlay ${open ? 'is-open' : ''}`}
        aria-label="Tutup menu"
        onClick={onClose}
      />
      <aside className={`sidebar ${open ? 'is-open' : ''}`}>
        <div className="brand">
          <div className="brand-mark">CM</div>
          <div>
            <strong>Cerutumurah</strong>
            <span>Stock Admin</span>
          </div>
        </div>
        <nav className="sidebar-nav">
          {navItems.map(({ to, label, icon: Icon, children }) => {
            const groupActive = children?.some((child) => child.to === pathname)
            const groupOpen = Boolean(openGroups[to])
            if (!children) {
              return (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/'}
                  className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                  onClick={onClose}
                >
                  <Icon size={19} />
                  <span>{label}</span>
                </NavLink>
              )
            }

            return (
              <div className={`nav-group ${groupActive ? 'active' : ''} ${groupOpen ? 'open' : ''}`} key={to}>
                <button
                  className={`nav-item nav-toggle ${groupActive ? 'active' : ''}`}
                  type="button"
                  aria-expanded={groupOpen}
                  onClick={() => toggleGroup(to)}
                  onDoubleClick={() => {
                    navigate(to)
                    onClose()
                  }}
                >
                  <Icon size={19} />
                  <span>{label}</span>
                  <ChevronDown className="nav-chevron" size={15} />
                </button>
                <div className="nav-submenu">
                  {children.map(({ to: childTo, label: childLabel }) => (
                    <NavLink
                      key={childTo}
                      to={childTo}
                      end
                      className={({ isActive }) => `nav-subitem ${isActive ? 'active' : ''}`}
                      onClick={onClose}
                    >
                      {childLabel}
                    </NavLink>
                  ))}
                </div>
              </div>
            )
          })}
        </nav>
        <div className="sidebar-footer">
          <span>Inventory workspace</span>
          <strong>Kelola stok dengan tenang.</strong>
        </div>
      </aside>
    </>
  )
}
