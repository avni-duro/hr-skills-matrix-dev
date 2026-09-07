import { createContext, useContext, useEffect, useState, useRef } from 'react'
import { supabase } from '../supabaseClient'
import { ROLE_PERMISSIONS, ALLOWED_ROLES, SCREENS } from '../config/permissions'

export const AuthContext = createContext(null)

const CACHE_KEY = 'duroacademy_auth_cache'

function getCachedAuth() {
  try {
    const cached = sessionStorage.getItem(CACHE_KEY)
    if (cached) return JSON.parse(cached)
  } catch {}
  return null
}

function setCachedAuth(data) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(data))
  } catch {}
}

function clearCachedAuth() {
  try {
    sessionStorage.removeItem(CACHE_KEY)
  } catch {}
}

export function AuthProvider({ children }) {
  const cachedAuth = getCachedAuth()
  const [user, setUser] = useState(cachedAuth?.user || null)
  const [role, setRole] = useState(cachedAuth?.role || null)
  const [allowedScreens, setAllowedScreens] = useState(cachedAuth?.allowedScreens || null)
  const [loading, setLoading] = useState(!cachedAuth)
  const [isAuthenticated, setIsAuthenticated] = useState(!!cachedAuth)
  const fetchingRef = useRef(false)
  const authedEmailRef = useRef(cachedAuth?.user?.email || null)

  useEffect(() => {
    // Check initial session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        fetchUserRole(session.user.email, !!cachedAuth)
      } else {
        // No session — clear any stale cache
        clearCachedAuth()
        setUser(null)
        setRole(null)
        setAllowedScreens(null)
        setIsAuthenticated(false)
        setLoading(false)
      }
    })

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        // Skip if already authenticated with the same user (tab-focus duplicate)
        if (authedEmailRef.current === session.user.email) return
        fetchUserRole(session.user.email)
      } else if (event === 'SIGNED_OUT') {
        authedEmailRef.current = null
        clearCachedAuth()
        setUser(null)
        setRole(null)
        setAllowedScreens(null)
        setIsAuthenticated(false)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const fetchUserRole = async (email, background = false) => {
    if (fetchingRef.current) return
    fetchingRef.current = true
    try {
      if (!background) setLoading(true)
      const { data: userData, error } = await supabase
        .from('users')
        .select('id, role, email, full_name')
        .eq('email', email)
        .single()

      if (error || !userData) {
        authedEmailRef.current = null
        clearCachedAuth()
        setUser(null)
        setRole(null)
        setAllowedScreens(null)
        setIsAuthenticated(false)
        return
      }

      // Only allow admin and super_admin roles
      if (ALLOWED_ROLES.includes(userData.role)) {
        authedEmailRef.current = userData.email
        setUser(userData)
        setRole(userData.role)
        setIsAuthenticated(true)

        let screens = null
        // For admin role, fetch DB-based permissions
        if (userData.role === 'admin') {
          screens = await fetchAdminPermissions(userData.id)
        }

        // Cache auth data for instant load on next visit
        setCachedAuth({ user: userData, role: userData.role, allowedScreens: screens })
      } else {
        authedEmailRef.current = null
        clearCachedAuth()
        setIsAuthenticated(false)
        await supabase.auth.signOut()
      }
    } catch (error) {
      console.error('Error fetching user role:', error)
      authedEmailRef.current = null
      clearCachedAuth()
      setIsAuthenticated(false)
    } finally {
      fetchingRef.current = false
      setLoading(false)
    }
  }

  const fetchAdminPermissions = async (userId) => {
    try {
      const { data, error } = await supabase
        .from('admin_permissions')
        .select('allowed_screens')
        .eq('user_id', userId)
        .single()

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching admin permissions:', error)
      }

      if (data && data.allowed_screens) {
        setAllowedScreens(data.allowed_screens)
        return data.allowed_screens
      } else {
        // No DB permissions found — fall back to static config
        setAllowedScreens(null)
        return null
      }
    } catch (error) {
      console.error('Error fetching admin permissions:', error)
      setAllowedScreens(null)
      return null
    }
  }

  // Check if the current user has access to a specific screen
  const hasAccess = (screenKey) => {
    if (!role) return false
    if (role === 'super_admin') return true

    // Quiz Builder is a sub-route of Assessments — grant access automatically
    if (screenKey === SCREENS.QUIZ_BUILDER) {
      return hasAccess(SCREENS.ASSESSMENTS)
    }

    // If DB permissions exist for this admin, use them
    if (allowedScreens !== null) {
      return allowedScreens.includes(screenKey)
    }

    // Fallback to static config
    const permissions = ROLE_PERMISSIONS[role]
    if (!permissions) return false
    if (permissions === 'all') return true
    return permissions.includes(screenKey)
  }

  // Allow refreshing permissions (used after saving in AdminPermissions screen)
  const refreshPermissions = async () => {
    if (user && role === 'admin') {
      const screens = await fetchAdminPermissions(user.id)
      setCachedAuth({ user, role, allowedScreens: screens })
    }
  }

  const value = {
    user,
    role,
    loading,
    isAuthenticated,
    hasAccess,
    refreshPermissions,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export default AuthContext
