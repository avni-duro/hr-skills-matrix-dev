import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './ForgotPassword.css'

function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [isSubmitted, setIsSubmitted] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = (e) => {
    e.preventDefault()
    console.log('Password reset requested for:', email)
    
    // Add your password reset logic here
    // For now, just show the success message
    setIsSubmitted(true)
  }

  const handleBackToLogin = () => {
    navigate('/login')
  }

  return (
    <div className="forgot-password-page">
      <div className="auth-card">
        
        <div className="logo-section">
          <img 
            src="https://storage.googleapis.com/uxpilot-auth.appspot.com/604dfc4353-7332f21e85e56178681e.png" 
            alt="DuroAcademy Logo" 
          />
          <h1>DuroAcademy Admin</h1>
        </div>

        {/* Form Container */}
        {!isSubmitted ? (
          <div className="form-container">
            <div className="header-text">
              <h2>Forgot Your Password?</h2>
              <p>No worries! Enter your email below and we'll send you a reset link.</p>
            </div>

            <form className="reset-form" onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="email">Email Address</label>
                <div className="input-wrapper">
                  <span className="input-icon">
                    <i className="fa-regular fa-envelope"></i>
                  </span>
                  <input 
                    id="email" 
                    name="email" 
                    type="email" 
                    required 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                </div>
              </div>

              <div className="submit-button-wrapper">
                <button type="submit" className="reset-button">
                  Send Reset Link
                </button>
              </div>
            </form>
          </div>
        ) : (
          /* Success Message Container */
          <div className="success-message">
            <div className="success-icon-wrapper">
              <div className="success-icon-circle">
                <i className="fa-solid fa-check-circle"></i>
              </div>
            </div>
            <h2>Link Sent!</h2>
            <p>Please check your inbox for password reset instructions.</p>
          </div>
        )}

        <div className="back-to-login-link">
          <a href="#" onClick={handleBackToLogin}>
            <i className="fa-solid fa-arrow-left"></i>
            Return to Login
          </a>
        </div>

        <footer className="footer">
          <p>© DuroAcademy — Secure Training Portal</p>
        </footer>
      </div>
    </div>
  )
}

export default ForgotPassword
