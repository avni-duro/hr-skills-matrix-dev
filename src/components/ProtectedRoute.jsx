import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { getDefaultRouteForScreens, ROLE_PERMISSIONS, SCREENS } from '../config/permissions'

function ProtectedRoute({ children, requiredScreen }) {
  const { isAuthenticated, hasAccess, role, allowedScreens } = useAuth()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  // Check screen-level permission
  if (requiredScreen && !hasAccess(requiredScreen)) {
    const fallbackScreens = allowedScreens || ROLE_PERMISSIONS[role] || [SCREENS.DASHBOARD]
    return <Navigate to={getDefaultRouteForScreens(fallbackScreens, role)} replace />
  }

  return children
}

export default ProtectedRoute
