import { createContext, useContext, useRef, useCallback, useState } from 'react'

const NotificationContext = createContext()

export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([])
  const timeoutRefsRef = useRef({})

  const showNotification = useCallback((message, type = 'success', duration = 3500) => {
    const id = Date.now()
    
    setNotifications(prev => [...prev, { id, message, type }])

    const timeout = setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id))
      delete timeoutRefsRef.current[id]
    }, duration)

    timeoutRefsRef.current[id] = timeout

    return id
  }, [])

  const dismissNotification = useCallback((id) => {
    if (timeoutRefsRef.current[id]) {
      clearTimeout(timeoutRefsRef.current[id])
      delete timeoutRefsRef.current[id]
    }
    setNotifications(prev => prev.filter(n => n.id !== id))
  }, [])

  return (
    <NotificationContext.Provider value={{ showNotification, dismissNotification }}>
      {children}
      <div className="pba-notifications-container">
        {notifications.map(notification => (
          <div key={notification.id} className={`pba-notification pba-notification-${notification.type}`}>
            <div className="pba-notification-content">
              <i className={`fa-solid ${notification.type === 'success' ? 'fa-check-circle' : notification.type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'}`}></i>
              <span>{notification.message}</span>
            </div>
          </div>
        ))}
      </div>
    </NotificationContext.Provider>
  )
}

export function useNotification() {
  const context = useContext(NotificationContext)
  if (!context) {
    throw new Error('useNotification must be used within NotificationProvider')
  }
  return context
}
