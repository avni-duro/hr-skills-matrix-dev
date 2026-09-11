import { useEffect, useState } from 'react'
import { fetchReviewHistory } from '../services/skillMatrixReviews'
import {
  SKILL_PARAMETERS,
  PASS_MARK,
  scoreClass,
  formatDateTime,
  formatRatingPeriod,
  initialsOf,
} from '../config/skillMatrix'
import './ReviewHistory.css'

/**
 * Every review ever submitted for one employee, newest first.
 * Opened from the Skill Matrix team list ("History") and from inside
 * the Give Review form, so a manager can check past ratings without
 * them cluttering the review-entry screen.
 */
export default function ReviewHistory({ employee, onClose }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [missingTable, setMissingTable] = useState(false)
  const [reviews, setReviews] = useState([])
  const [expanded, setExpanded] = useState(() => new Set())

  useEffect(() => {
    let active = true

    const load = async () => {
      setLoading(true)
      const { reviews: rows, missingTable: missing, error: loadError } = await fetchReviewHistory(employee.id)
      if (!active) return

      setReviews(rows)
      setMissingTable(missing)
      setError(loadError ? (loadError.message || 'Failed to load review history') : '')
      setLoading(false)
      // The most recent entry opens by default so the fullest detail is visible first
      setExpanded(rows.length ? new Set([rows[0].id]) : new Set())
    }

    load()
    return () => { active = false }
  }, [employee.id])

  const toggle = (id) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="rhx-panel">
      <header className="rhx-banner">
        <span className="rhx-avatar">{initialsOf(employee.name)}</span>
        <div className="rhx-banner-text">
          <span className="rhx-eyebrow">Review History</span>
          <h2>{employee.name}</h2>
          <div className="rhx-meta-row">
            <span><i className="fa-solid fa-id-badge"></i>{employee.empCode || '-'}</span>
            <span><i className="fa-solid fa-building"></i>{employee.department || '-'}</span>
          </div>
        </div>
        {!loading && !error && !missingTable && (
          <span className="rhx-count">{reviews.length} review{reviews.length === 1 ? '' : 's'}</span>
        )}
        <button type="button" className="rhx-close" onClick={onClose} aria-label="Close">
          <i className="fa-solid fa-xmark"></i>
        </button>
      </header>

      <div className="rhx-scroll">
        {loading && (
          <div className="rhx-state"><i className="fa-solid fa-spinner fa-spin"></i> Loading history...</div>
        )}

        {!loading && missingTable && (
          <div className="rhx-empty warn">
            <i className="fa-solid fa-database"></i>
            <div>
              <strong>Reviews table needs an update</strong>
              <p>Run supabase/migrations/20260912000100_skill_matrix_reviews_history.sql, then history will show here.</p>
            </div>
          </div>
        )}

        {!loading && !missingTable && error && (
          <div className="rhx-empty error">
            <i className="fa-solid fa-circle-exclamation"></i>
            <div>
              <strong>Could not load history</strong>
              <p>{error}</p>
            </div>
          </div>
        )}

        {!loading && !missingTable && !error && reviews.length === 0 && (
          <div className="rhx-empty">
            <i className="fa-regular fa-folder-open"></i>
            <div>
              <strong>No reviews submitted yet</strong>
              <p>Once a review is given for {employee.name}, every submission is listed here with its date and time.</p>
            </div>
          </div>
        )}

        {!loading && reviews.length > 0 && (
          <ol className="rhx-timeline">
            {reviews.map((review, index) => {
              const isOpen = expanded.has(review.id)
              const isGood = review.averageRating >= PASS_MARK

              return (
                <li className="rhx-entry" key={review.id}>
                  <div className="rhx-entry-rail">
                    <span className={`rhx-entry-dot ${scoreClass(review.averageRating)}`}></span>
                    {index < reviews.length - 1 && <span className="rhx-entry-line"></span>}
                  </div>

                  <div className={`rhx-entry-card ${isOpen ? 'is-open' : ''}`}>
                    <button type="button" className="rhx-entry-head" onClick={() => toggle(review.id)}>
                      <span className={`rhx-entry-score ${scoreClass(review.averageRating)}`}>
                        {review.averageRating.toFixed(1)}
                      </span>
                      <span className="rhx-entry-main">
                        <strong>{formatDateTime(review.reviewedOn)}</strong>
                        <span>{formatRatingPeriod(review.ratingPeriod)} &middot; Reviewed by {review.reviewerName || '-'}</span>
                      </span>
                      <span className={`rhx-entry-status ${isGood ? 'good' : 'low'}`}>
                        <i className={`fa-solid ${isGood ? 'fa-circle-check' : 'fa-graduation-cap'}`}></i>
                        {isGood ? 'Good' : 'Low Performance'}
                      </span>
                      <i className={`fa-solid fa-chevron-down rhx-entry-chevron ${isOpen ? 'is-open' : ''}`}></i>
                    </button>

                    {isOpen && (
                      <div className="rhx-entry-body">
                        <div className="rhx-skill-rows">
                          {SKILL_PARAMETERS.map((parameter) => {
                            const value = Number(review.ratings?.[parameter.key]) || 0
                            const weak = value > 0 && value < PASS_MARK
                            return (
                              <div className={`rhx-skill-row ${weak ? 'low' : 'good'}`} key={parameter.key}>
                                <span className="rhx-skill-icon"><i className={`fa-solid ${parameter.icon}`}></i></span>
                                <span className="rhx-skill-label">{parameter.label}</span>
                                <span className="rhx-skill-score">{value || '-'}/5</span>
                              </div>
                            )
                          })}
                        </div>

                        {review.remarks && (
                          <div className="rhx-entry-remarks">
                            <span>Manager Remarks</span>
                            <p>{review.remarks}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </div>
  )
}
