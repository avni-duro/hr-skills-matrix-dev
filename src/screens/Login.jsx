import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { metaSet } from '../utils/cacheDB'
import { getDefaultRouteForScreens, ROLE_PERMISSIONS, ALLOWED_ROLES, SCREENS } from '../config/permissions'
import { useAuth } from '../contexts/AuthContext'
import './Login.css'

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const { refreshPermissions } = useAuth()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      // Sign in with Supabase
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (signInError) throw signInError

      // AuthContext handles role verification via onAuthStateChange

      // Store user session
      if (rememberMe) {
        metaSet('adminEmail', email).catch(() => {})
      }

      const { data: userRecord, error: userRecordError } = await supabase
        .from('users')
        .select('id, role')
        .eq('email', email)
        .single()

      if (userRecordError) throw userRecordError

      let defaultRoute = '/dashboard'
      if (userRecord?.role === 'admin') {
        const { data: permissionsData, error: permissionsError } = await supabase
          .from('admin_permissions')
          .select('allowed_screens')
          .eq('user_id', userRecord.id)
          .maybeSingle()

        if (permissionsError && permissionsError.code !== 'PGRST116') throw permissionsError

        const allowedScreens = Array.isArray(permissionsData?.allowed_screens)
          ? permissionsData.allowed_screens
          : ROLE_PERMISSIONS.admin

        defaultRoute = getDefaultRouteForScreens(allowedScreens, userRecord.role)
        await refreshPermissions()
      } else if (userRecord?.role === 'super_admin') {
        defaultRoute = '/dashboard'
      }

      navigate(defaultRoute)
    } catch (error) {
      console.error('Login error:', error)
      setError(error.message || 'Invalid email or password')
    } finally {
      setLoading(false)
    }
  }

  const handleForgotPassword = (e) => {
    e.preventDefault()
    navigate('/forgot-password')
  }

  return (
    <div className="login-page">
      <div className="login-container">
        
        {/* Left Side: Login Form */}
        <div className="login-form-container">
          <div className="form-wrapper">
            <div className="logo-section">
              <img 
                src="/duro-academy-logo.png" 
                alt="DuroAcademy Logo"
                style={{ height: '6rem', width: 'auto', maxWidth: '100%', objectFit: 'contain' }}
              />
            </div>
            <div className="header-text">
              <p>Welcome back! Please sign in to your account.</p>
            </div>

            {error && (
              <div style={{
                padding: '0.75rem',
                marginBottom: '1rem',
                backgroundColor: '#FEE2E2',
                border: '1px solid #DC2626',
                borderRadius: '0.5rem',
                color: '#991B1B',
                fontSize: '0.875rem'
              }}>
                <strong>⚠️ Error:</strong> {error}
              </div>
            )}

            <form className="login-form" onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="email">Email</label>
                <div className="input-wrapper">
                  <span className="input-icon">
                    <i className="fa-regular fa-envelope"></i>
                  </span>
                  <input 
                    id="email" 
                    name="email" 
                    type="text" 
                    required 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="password">Password</label>
                <div className="input-wrapper">
                  <span className="input-icon">
                    <i className="fa-solid fa-lock"></i>
                  </span>
                  <input 
                    id="password" 
                    name="password" 
                    type="password" 
                    required 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                </div>
              </div>

              <div className="form-options">
                <div className="remember-me">
                  <input 
                    id="remember-me" 
                    name="remember-me" 
                    type="checkbox" 
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                  />
                  <label htmlFor="remember-me">Remember Me</label>
                </div>
                <a href="#" className="forgot-password" onClick={handleForgotPassword}>Forgot Password?</a>
              </div>

              <div className="submit-button-wrapper">
                <button type="submit" className="login-button" disabled={loading}>
                  {loading ? (
                    <>
                      <i className="fa-solid fa-spinner fa-spin"></i> Signing in...
                    </>
                  ) : (
                    'Login'
                  )}
                </button>
              </div>
            </form>
          </div>
          <footer className="footer">
            <p>© DuroAcademy — Secure Training Portal</p>
          </footer>
        </div>
        
        {/* Right Side: Illustration */}
        <div className="illustration-section">
          <div className="illustration-wrapper">
            <img 
              src="https://storage.googleapis.com/uxpilot-auth.appspot.com/074efe8b43-572f90b9975b6cb3cae0.png" 
              alt="Learning illustration" 
            />
          </div>
          <div className="illustration-overlay"></div>
          <div className="illustration-text">
            <h2>Unlock Your Team's Potential.</h2>
            <p>Manage, train, and track progress with our all-in-one learning platform.</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Login
