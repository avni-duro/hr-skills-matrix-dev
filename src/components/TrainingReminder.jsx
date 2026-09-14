import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { fetchPendingTraining } from '../services/skillTraining'
import './TrainingReminder.css'

// Gap between two reminders, and the gap before the first one after the app opens
const REMINDER_GAP_MS = 5 * 60 * 1000
const FIRST_REMINDER_MS = 20 * 1000

// The reminder is about this screen, so it stays quiet while the person is already on it
const TRAINING_PATH = '/skill-matrix'

/**
 * Pending training reminder.
 * Shows one pending video at a time, every five minutes, for as long as the app is open.
 * Each reminder re-reads the training rows, so the moment the video is watched and its
 * assessment is cleared there is nothing left to show and the popup stops on its own.
 */
export default function TrainingReminder() {
  const { user, isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [items, setItems] = useState([])
  const [index, setIndex] = useState(0)
  const [visible, setVisible] = useState(false)

  const timerRef = useRef(null)
  const activeRef = useRef(true)
  const userId = user?.id || null

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  // One reminder cycle: read what is still pending, then either show it or wait and look again
  const tick = useCallback(async () => {
    if (!userId) return

    const { items: pending, error, missingTable } = await fetchPendingTraining(userId)
    if (!activeRef.current) return

    if (missingTable || error || !pending.length) {
      // Nothing to remind about. Keep looking quietly, in case a new review assigns training later.
      setItems([])
      setVisible(false)
      clearTimer()
      timerRef.current = setTimeout(tick, REMINDER_GAP_MS)
      return
    }

    setItems(pending)
    // One pending item per reminder, taken in turn
    setIndex(prev => (prev + 1) % pending.length)
    setVisible(true)
  }, [userId])

  // While the popup is open the timer is not running. Closing it starts the next five minutes.
  const snooze = useCallback(() => {
    setVisible(false)
    clearTimer()
    timerRef.current = setTimeout(tick, REMINDER_GAP_MS)
  }, [tick])

  useEffect(() => {
    activeRef.current = true
    setVisible(false)
    setItems([])
    setIndex(0)
    clearTimer()

    if (!userId || !isAuthenticated) return undefined

    timerRef.current = setTimeout(tick, FIRST_REMINDER_MS)

    return () => {
      activeRef.current = false
      clearTimer()
    }
  }, [userId, isAuthenticated, tick])

  const current = items[index] || items[0] || null
  const onTrainingScreen = location.pathname.startsWith(TRAINING_PATH)

  if (!visible || !current || onTrainingScreen) return null

  const openTraining = () => {
    setVisible(false)
    clearTimer()
    timerRef.current = setTimeout(tick, REMINDER_GAP_MS)
    navigate(TRAINING_PATH, { state: { focusSkillKey: current.skillKey || null } })
  }

  return (
    <div className="trm-popup" role="dialog" aria-live="polite" aria-label="Training reminder">
      <button type="button" className="trm-close" onClick={snooze} aria-label="Close">
        <i className="fa-solid fa-xmark"></i>
      </button>

      <div className="trm-head">
        <span className="trm-icon">
          <i className={`fa-solid ${current.nextStep === 'assessment' ? 'fa-list-check' : 'fa-play'}`}></i>
        </span>
        <div className="trm-head-text">
          <strong>Your training is waiting</strong>
          <span>{current.skillName}</span>
        </div>
      </div>

      <p className="trm-title">{current.videoTitle}</p>

      <p className="trm-step">
        {current.nextStep === 'assessment'
          ? 'Video done. One short assessment left to finish this one.'
          : 'Watch the video, then clear its short assessment.'}
      </p>

      {items.length > 1 && (
        <span className="trm-count">
          <i className="fa-regular fa-clock"></i>
          {items.length} items still open
        </span>
      )}

      <div className="trm-actions">
        <button type="button" className="trm-btn trm-btn-ghost" onClick={snooze}>
          Later
        </button>
        <button type="button" className="trm-btn trm-btn-primary" onClick={openTraining}>
          <i className="fa-solid fa-arrow-right"></i>
          Open training
        </button>
      </div>
    </div>
  )
}
