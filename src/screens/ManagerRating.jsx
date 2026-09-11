import { useMemo, useState } from 'react'
import { saveReview } from '../services/skillMatrixReviews'
import {
  SKILL_PARAMETERS,
  RATING_SCALE,
  PASS_MARK,
  scoreClass,
  formatDate,
  initialsOf,
} from '../config/skillMatrix'
import './ManagerRating.css'

const EMPTY_RATINGS = SKILL_PARAMETERS.reduce((acc, parameter) => ({ ...acc, [parameter.key]: 0 }), {})

/**
 * Review page opened from the Skill Matrix team list.
 * Employee details arrive pre-filled from the users table; the reporting
 * manager only fills the ratings, period and remarks.
 */
export default function ManagerRating({ employee, reviewer, previousReview = null, onBack, onSaved }) {
  const [ratings, setRatings] = useState(EMPTY_RATINGS)
  const [ratingPeriod, setRatingPeriod] = useState('')
  const [remarks, setRemarks] = useState('')
  const [errors, setErrors] = useState([])
  const [saved, setSaved] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [saveError, setSaveError] = useState('')

  const ratedCount = useMemo(
    () => SKILL_PARAMETERS.filter(parameter => ratings[parameter.key] > 0).length,
    [ratings]
  )

  const averageScore = useMemo(() => {
    if (!ratedCount) return 0
    const total = SKILL_PARAMETERS.reduce((sum, parameter) => sum + (ratings[parameter.key] || 0), 0)
    return total / ratedCount
  }, [ratings, ratedCount])

  const weakParameters = useMemo(
    () => SKILL_PARAMETERS.filter(parameter => {
      const value = ratings[parameter.key]
      return value > 0 && value < PASS_MARK
    }),
    [ratings]
  )

  const allRated = ratedCount === SKILL_PARAMETERS.length
  const status = averageScore >= PASS_MARK ? 'good' : 'low'

  const onRatingChange = (parameterKey, value) => {
    setRatings(prev => ({ ...prev, [parameterKey]: prev[parameterKey] === value ? 0 : value }))
    setSaved(null)
  }

  const resetReview = () => {
    setRatings(EMPTY_RATINGS)
    setRatingPeriod('')
    setRemarks('')
    setErrors([])
    setSaveError('')
    setSaved(null)
  }

  const onSubmit = async (event) => {
    event.preventDefault()

    const found = []
    if (!ratingPeriod) found.push('Rating period is required')
    if (!allRated) found.push(`Rate all ${SKILL_PARAMETERS.length} parameters (${ratedCount} done)`)

    setErrors(found)
    setSaveError('')
    if (found.length) {
      setSaved(null)
      return
    }

    const record = {
      employeeUserId: employee.id,
      employeeCode: employee.empCode,
      employeeName: employee.name,
      branch: employee.branch,
      department: employee.department,
      designation: employee.designation,
      reviewerUserId: reviewer?.id || null,
      reviewerCode: reviewer?.empCode || '',
      reviewerName: reviewer?.name || '',
      ratingPeriod,
      remarks: remarks.trim(),
      ratings: { ...ratings },
      averageRating: Number(averageScore.toFixed(1)),
      status: status === 'good' ? 'Good' : 'Low Performance',
      retrainingRequired: status !== 'good',
      retrainingParameters: weakParameters.map(parameter => parameter.label),
    }

    setSubmitting(true)
    const { review: savedReview, error } = await saveReview(record)
    setSubmitting(false)

    if (error) {
      setSaveError(error)
      setSaved(null)
      return
    }

    setSaved(record)
    if (onSaved) onSaved(record, savedReview)
  }

  return (
    <div className="mpr-review">
      <div className="mpr-review-head">
        <button type="button" className="mpr-btn mpr-btn-ghost" onClick={onBack}>
          <i className="fa-solid fa-arrow-left"></i>
          Back to Team
        </button>
        <span className="mpr-review-title">Performance Review</span>
      </div>

      <section className="mpr-employee-strip">
        <span className="mpr-employee-avatar">{initialsOf(employee.name)}</span>
        <div className="mpr-employee-name">
          <strong>{employee.name}</strong>
          <span>{employee.empCode || '-'}</span>
        </div>
        <div className="mpr-employee-facts">
          <div><span>Department</span><strong>{employee.department || '-'}</strong></div>
          <div><span>Designation</span><strong>{employee.designation || '-'}</strong></div>
          <div><span>Branch</span><strong>{employee.branch || '-'}</strong></div>
          <div><span>Reviewed By</span><strong>{reviewer?.name || '-'}</strong></div>
        </div>
      </section>

      {errors.length > 0 && (
        <div className="mpr-banner mpr-banner-error">
          <i className="fa-solid fa-circle-exclamation"></i>
          <div>
            <strong>Please complete the review</strong>
            <ul>
              {errors.map(message => <li key={message}>{message}</li>)}
            </ul>
          </div>
        </div>
      )}

      {saveError && (
        <div className="mpr-banner mpr-banner-error">
          <i className="fa-solid fa-triangle-exclamation"></i>
          <div>
            <strong>Review could not be saved</strong>
            <p>{saveError}</p>
          </div>
        </div>
      )}

      {saved && (
        <div className="mpr-banner mpr-banner-success">
          <i className="fa-solid fa-circle-check"></i>
          <div>
            <strong>Review submitted for {saved.employeeName} ({saved.employeeCode || '-'})</strong>
            <p>
              Average {saved.averageRating.toFixed(1)} / 5 &middot; {saved.status}
              {saved.retrainingParameters.length > 0 && ` · Retraining due on: ${saved.retrainingParameters.join(', ')}`}
            </p>
            <p>{saved.employeeName} can now see this review in their own Skill Matrix.</p>
          </div>
        </div>
      )}

      <form onSubmit={onSubmit}>
        <div className="mpr-form-grid">
          <div className="mpr-column">
            <section className="mpr-card">
              <div className="mpr-card-head">
                <h2><i className="fa-solid fa-star-half-stroke"></i> Performance Parameters</h2>
                <span className={`mpr-progress ${allRated ? 'done' : ''}`}>
                  {ratedCount} of {SKILL_PARAMETERS.length} rated
                </span>
              </div>

              <div className="mpr-scale-legend">
                <span>1 Poor</span>
                <span>2 Needs Improvement</span>
                <span>3 Meets Standard</span>
                <span>4 Good</span>
                <span>5 Excellent</span>
              </div>

              <div className="mpr-card-body mpr-rating-list">
                {SKILL_PARAMETERS.map((parameter, index) => {
                  const value = ratings[parameter.key]
                  return (
                    <div className="mpr-rating-row" key={parameter.key}>
                      <div className="mpr-rating-label">
                        <span className="mpr-rating-index">{index + 1}</span>
                        <span>{parameter.label}</span>
                      </div>
                      <div className="mpr-scale" role="group" aria-label={parameter.label}>
                        {RATING_SCALE.map(option => (
                          <button
                            type="button"
                            key={option}
                            className={`mpr-scale-btn ${value === option ? `selected ${scoreClass(option)}` : ''}`}
                            onClick={() => onRatingChange(parameter.key, option)}
                            aria-pressed={value === option}
                          >
                            {option}
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>

            <section className="mpr-card">
              <div className="mpr-card-head">
                <h2><i className="fa-regular fa-comment-dots"></i> Review Period and Remarks</h2>
              </div>
              <div className="mpr-card-body">
                <div className="mpr-field mpr-field-period">
                  <label htmlFor="ratingPeriod">Rating Period <span>*</span></label>
                  <input
                    id="ratingPeriod"
                    type="month"
                    value={ratingPeriod}
                    onChange={(event) => { setRatingPeriod(event.target.value); setSaved(null) }}
                  />
                </div>
                <div className="mpr-field">
                  <label htmlFor="remarks">Manager Remarks</label>
                  <textarea
                    id="remarks"
                    rows={4}
                    placeholder="Field observations, training already given, action agreed with the employee..."
                    value={remarks}
                    onChange={(event) => { setRemarks(event.target.value); setSaved(null) }}
                  ></textarea>
                </div>
              </div>
            </section>

            <section className="mpr-card">
              <div className="mpr-card-head">
                <h2><i className="fa-solid fa-clock-rotate-left"></i> Review Received Earlier</h2>
                <span className="mpr-card-note">Rating given by the reporting manager</span>
              </div>
              <div className="mpr-card-body">
                {previousReview ? (
                  <div className="mpr-previous-list">
                    {SKILL_PARAMETERS.map(parameter => {
                      const value = Number(previousReview.ratings?.[parameter.key]) || 0
                      return (
                        <div className="mpr-previous-row" key={parameter.key}>
                          <span>{parameter.label}</span>
                          <div className="mpr-bar-track">
                            <span
                              className={`mpr-bar-fill ${scoreClass(value)}`}
                              style={{ width: `${(value / 5) * 100}%` }}
                            ></span>
                          </div>
                          <strong className={scoreClass(value)}>{value || '-'}</strong>
                        </div>
                      )
                    })}
                    <p className="mpr-previous-meta">
                      Average {Number(previousReview.averageRating || 0).toFixed(1)} / 5 &middot;
                      {' '}Reviewed by {previousReview.reviewerName || '-'} on {formatDate(previousReview.reviewedOn)}
                    </p>
                  </div>
                ) : (
                  <div className="mpr-empty-inline">
                    <i className="fa-regular fa-folder-open"></i>
                    <div>
                      <strong>No earlier review on record</strong>
                      <p>Once a review is submitted for {employee.name}, it will show here.</p>
                    </div>
                  </div>
                )}
              </div>
            </section>
          </div>

          <aside className="mpr-column mpr-side">
            <section className="mpr-card mpr-summary">
              <div className="mpr-card-head">
                <h2><i className="fa-solid fa-gauge-high"></i> Rating Summary</h2>
              </div>
              <div className="mpr-card-body">
                <div className={`mpr-score-ring ${scoreClass(averageScore)}`}>
                  <span className="mpr-score-value">{averageScore ? averageScore.toFixed(1) : '-'}</span>
                  <span className="mpr-score-of">out of 5</span>
                </div>

                <div className="mpr-bar-track">
                  <span
                    className={`mpr-bar-fill ${scoreClass(averageScore)}`}
                    style={{ width: `${(averageScore / 5) * 100}%` }}
                  ></span>
                </div>
                <p className="mpr-cut-off">Cut-off {PASS_MARK.toFixed(1)} — below this retraining is due</p>

                {ratedCount === 0 ? (
                  <div className="mpr-verdict idle">
                    <i className="fa-regular fa-hourglass-half"></i>
                    <div>
                      <strong>Review not started</strong>
                      <p>Rate the parameters to see the result.</p>
                    </div>
                  </div>
                ) : (
                  <div className={`mpr-verdict ${status}`}>
                    <i className={`fa-solid ${status === 'good' ? 'fa-circle-check' : 'fa-graduation-cap'}`}></i>
                    <div>
                      <strong>{status === 'good' ? 'Good performance' : 'Low performance - retraining required'}</strong>
                      <p>
                        {allRated
                          ? `Average of all ${SKILL_PARAMETERS.length} parameters is ${averageScore.toFixed(1)}.`
                          : `Based on ${ratedCount} of ${SKILL_PARAMETERS.length} parameters rated so far.`}
                      </p>
                    </div>
                  </div>
                )}

                {weakParameters.length > 0 && (
                  <div className="mpr-weak-list">
                    <span className="mpr-weak-title">Retraining due on</span>
                    <ul>
                      {weakParameters.map(parameter => (
                        <li key={parameter.key}>
                          <i className="fa-solid fa-circle-arrow-down"></i>
                          {parameter.label}
                          <strong>{ratings[parameter.key]}</strong>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="mpr-card-footer">
                <button type="button" className="mpr-btn mpr-btn-secondary" onClick={resetReview} disabled={submitting}>Clear</button>
                <button type="submit" className="mpr-btn mpr-btn-primary" disabled={!allRated || submitting}>
                  <i className={`fa-solid ${submitting ? 'fa-spinner fa-spin' : 'fa-floppy-disk'}`}></i>
                  {submitting ? 'Saving...' : 'Submit Review'}
                </button>
              </div>
            </section>
          </aside>
        </div>
      </form>
    </div>
  )
}
