import { Outlet, useLocation, Navigate } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'
import { useAuth } from '../contexts/AuthContext'

// Breadcrumb mapping from pathname to labels
const BREADCRUMB_MAP = {
  '/dashboard': 'Dashboard',
  '/modules': 'Modules',
  '/videos': 'Videos',
  '/module-requests': 'Module Requests',
  '/users': 'Users',
  '/banners': 'Banners',
  '/feedbacks': 'Feedback',
  '/notifications': 'Notifications',
  '/assessments': 'Assessments',
  '/quiz-builder': 'Quiz Builder',
  '/assignment-results': 'Assignment Results',
  '/video-progress': 'Video Progress',
  '/active-logins': 'Active Logins',
  '/assign-modules': 'Assign Modules',
  '/admin-permissions': 'Admin Permissions',
  '/performance-branch-access': 'Branch Access',
  '/goal-master': 'Goal Master',
}

function AdminLayout() {
  const { loading, isAuthenticated } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        flexDirection: 'column',
        gap: '1rem'
      }}>
        <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: '3rem', color: '#4F46E5' }}></i>
        <p style={{ color: '#6B7280' }}>Verifying authentication...</p>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  // Build breadcrumb from current path
  const basePath = '/' + location.pathname.split('/').filter(Boolean)[0]
  const pageLabel = BREADCRUMB_MAP[basePath] || BREADCRUMB_MAP[location.pathname] || 'Page'
  const breadcrumbItems = [
    { label: 'Home', link: true },
    { label: pageLabel, link: false }
  ]

  return (
    <div className="dashboard-panel">
      <Sidebar />
      <div className="main-content">
        <Header breadcrumbItems={breadcrumbItems} onMenuToggle={() => {}} />
        <Outlet />
      </div>
    </div>
  )
}

export default AdminLayout
