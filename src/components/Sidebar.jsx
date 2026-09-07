import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { cacheClearAll } from '../utils/cacheDB'
import { useAuth } from '../contexts/AuthContext'
import { NAV_ITEMS, SCREENS } from '../config/permissions'
import './Sidebar.css'

function Sidebar() {
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { hasAccess, role } = useAuth()
  const navRef = useRef(null)

  // Restore sidebar scroll position on mount
  useEffect(() => {
    const saved = sessionStorage.getItem('sidebarScrollTop')
    if (saved && navRef.current) {
      navRef.current.scrollTop = parseInt(saved, 10)
    }
  }, [])

  // Persist sidebar scroll position on scroll
  const handleNavScroll = useCallback(() => {
    if (navRef.current) {
      sessionStorage.setItem('sidebarScrollTop', navRef.current.scrollTop.toString())
    }
  }, [])

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen)
  }

  const isActive = (path) => {
    return location.pathname === path ? 'active' : ''
  }

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut()
      await cacheClearAll() // Clear all IndexedDB cache on logout
      navigate('/login')
    } catch (error) {
      console.error('Logout error:', error)
    }
  }

  // Filter nav items based on user's role permissions
  const visibleNavItems = NAV_ITEMS.filter(item => hasAccess(item.screen))

  return (
    <>
      {/* Sidebar Overlay for Mobile */}
      <div 
        className={`sidebar-overlay ${sidebarOpen ? 'active' : ''}`}
        onClick={toggleSidebar}
      ></div>

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <h1>DuroAcademy</h1>
          {role && (
            <span className={`role-badge ${role === 'super_admin' ? 'super-admin' : 'admin'}`}>
              {role === 'super_admin' ? 'Super Admin' : 'Admin'}
            </span>
          )}
        </div>
        <nav className="sidebar-nav" ref={navRef} onScroll={handleNavScroll}>
          {visibleNavItems.map((item) => (
            <a 
              key={item.path}
              href={item.path}
              className={`nav-link ${isActive(item.path)}`} 
              onClick={(e) => { e.preventDefault(); navigate(item.path); setSidebarOpen(false); }}
            >
              <i className={item.icon}></i>
              {item.label}
            </a>
          ))}
        </nav>
        <div className="sidebar-footer">
          {hasAccess(SCREENS.SETTINGS) && (
            <a href="/settings" className="nav-link" onClick={(e) => { e.preventDefault(); navigate('/settings'); }}>
              <i className="fa-solid fa-gear"></i>
              Settings
            </a>
          )}
          <a href="/login" className="nav-link logout-link" onClick={(e) => { e.preventDefault(); handleLogout(); }}>
            <i className="fa-solid fa-right-from-bracket"></i>
            Logout
          </a>
        </div>
      </aside>
    </>
  )
}

export default Sidebar
export { Sidebar }
