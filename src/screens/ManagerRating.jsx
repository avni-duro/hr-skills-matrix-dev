import { useMemo, useState } from 'react'
import './ManagerRating.css'

// Rating parameters filled in by the reporting manager (1 - 5 each)
const PARAMETERS = [
  { key: 'productKnowledge', label: 'Product Knowledge' },
  { key: 'leadConversion', label: 'Lead Conversion' },
  { key: 'dmiUpgradation', label: 'DMI Upgradation' },
  { key: 'siteWorking', label: 'Site Working' },
  { key: 'loyaltyAwareness', label: 'Awareness of Loyalty Programme' },
  { key: 'sfaApp', label: 'SFA APP' },
  { key: 'complaintHandling', label: 'Complaint Handling' },
  { key: 'marketKnowledge', label: 'Market Knowledge' },
  { key: 'competitorKnowledge', label: 'Competitor Knowledge' },
  { key: 'dmiManagement', label: 'DMI Management' },
]

const RATING_SCALE = [1, 2, 3, 4, 5]
const PASS_MARK = 3
const DESIGNATIONS = ['DGO', 'DMI', 'TSM', 'ASM']

const EMPTY_FORM = {
  empCode: '',
  name: '',
  branch: '',
  designation: '',
  dateOfJoining: '',
  reportingManager: '',
  ratingPeriod: '',
  remarks: '',
  ratings: PARAMETERS.reduce((acc, parameter) => ({ ...acc, [parameter.key]: 0 }), {}),
}

const monthsBetween = (fromDate, toDate) => {
  const months = (toDate.getFullYear() - fromDate.getFullYear()) * 12 + (toDate.getMonth() - fromDate.getMonth())
  return toDate.getDate() < fromDate.getDate() ? months - 1 : months
}

const ageingFromJoining = (dateOfJoining) => {
  if (!dateOfJoining) return null
  const joined = new Date(dateOfJoining)
  if (Number.isNaN(joined.getTime())) return null
  const months = monthsBetween(joined, new Date())
  return months < 0 ? null : months
}

const formatAgeing = (months) => {
  if (months === null) return '-'
  const years = Math.floor(months / 12)
  const rest = months % 12
  if (!years) return `${rest} mo`
  if (!rest) return `${years} yr`
  return `${years} yr ${rest} mo`
}

const scoreClass = (score) => {
  if (score >= 4) return 'strong'
  if (score >= PASS_MARK) return 'meets'
  return 'below'
}

export default function ManagerRating() {
  const [form, setForm] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState([])
  const [saved, setSaved] = useState(null)

  const ageingMonths = useMemo(() => ageingFromJoining(form.dateOfJoining), [form.dateOfJoining])

  const ratedCount = useMemo(
    () => PARAMETERS.filter(parameter => form.ratings[parameter.key] > 0).length,
    [form.ratings]
  )

  const averageScore = useMemo(() => {
    if (!ratedCount) return 0
    const total = PARAMETERS.reduce((sum, parameter) => sum + (form.ratings[parameter.key] || 0), 0)
    return total / ratedCount
  }, [form.ratings, ratedCount])

  const weakParameters = useMemo(
    () => PARAMETERS.filter(parameter => {
      const value = form.ratings[parameter.key]
      return value > 0 && value < PASS_MARK
    }),
    [form.ratings]
  )

  const allRated = ratedCount === PARAMETERS.length
  const status = averageScore >= PASS_MARK ? 'good' : 'low'

  const onFieldChange = (event) => {
    const { name, value } = event.target
    setForm(prev => ({ ...prev, [name]: value }))
    setSaved(null)
  }

  const onRatingChange = (parameterKey, value) => {
    setForm(prev => ({
      ...prev,
      ratings: { ...prev.ratings, [parameterKey]: prev.ratings[parameterKey] === value ? 0 : value },
    }))
    setSaved(null)
  }

  const resetForm = () => {
    setForm(EMPTY_FORM)
    setErrors([])
    setSaved(null)
  }

  const onSubmit = (event) => {
    event.preventDefault()

    const found = []
    if (!form.empCode.trim()) found.push('Employee code is required')
    if (!form.name.trim()) found.push('Employee name is required')
    if (!form.branch.trim()) found.push('Branch is required')
    if (!form.designation) found.push('Designation is required')
    if (!form.reportingManager.trim()) found.push('Reporting manager is required')
    if (!form.ratingPeriod) found.push('Rating period is required')
    if (!allRated) found.push(`Rate all ${PARAMETERS.length} parameters (${ratedCount} done)`)

    setErrors(found)
    if (found.length) {
      setSaved(null)
      return
    }

    // Submission target is not wired yet - the record is only prepared here.
    const record = {
      empCode: form.empCode.trim(),
      name: form.name.trim(),
      branch: form.branch.trim(),
      designation: form.designation,
      dateOfJoining: form.dateOfJoining || null,
      ageingMonths,
      reportingManager: form.reportingManager.trim(),
      ratingPeriod: form.ratingPeriod,
      remarks: form.remarks.trim(),
      ratings: { ...form.ratings },
      averageRating: Number(averageScore.toFixed(1)),
      status: status === 'good' ? 'Good' : 'Low Performance',
      retrainingRequired: status !== 'good' || weakParameters.length > 0,
      retrainingParameters: weakParameters.map(parameter => parameter.label),
    }

    console.log('Manager rating record', record)
    setSaved(record)
  }

  return (
    <main className="mpr-container">
      <div className="mpr-page-header">
        <div className="mpr-header-content">
          <h1>Skill Matrix</h1>
          <p>Performance rating entry by the reporting manager. Rate each parameter from 1 to 5.</p>
        </div>
        <div className="mpr-header-actions">
          <button type="button" className="mpr-btn mpr-btn-secondary" onClick={resetForm}>
            <i className="fa-solid fa-rotate-left"></i>
            Clear Form
          </button>
        </div>
      </div>

      {errors.length > 0 && (
        <div className="mpr-banner mpr-banner-error">
          <i className="fa-solid fa-circle-exclamation"></i>
          <div>
            <strong>Please complete the form</strong>
            <ul>
              {errors.map(message => <li key={message}>{message}</li>)}
            </ul>
          </div>
        </div>
      )}

      {saved && (
        <div className="mpr-banner mpr-banner-success">
          <i className="fa-solid fa-circle-check"></i>
          <div>
            <strong>Rating captured for {saved.name} ({saved.empCode})</strong>
            <p>
              Average {saved.averageRating.toFixed(1)} / 5 &middot; {saved.status}
              {saved.retrainingParameters.length > 0 && ` · Retraining due on: ${saved.retrainingParameters.join(', ')}`}
            </p>
          </div>
        </div>
      )}

      <form className="mpr-form" onSubmit={onSubmit}>
        <div className="mpr-form-grid">
          <div className="mpr-column">
            <section className="mpr-card">
              <div className="mpr-card-head">
                <h2><i className="fa-solid fa-id-card-clip"></i> Employee Details</h2>
              </div>
              <div className="mpr-card-body">
                <div className="mpr-field-grid">
                  <div className="mpr-field">
                    <label htmlFor="empCode">Emp Code <span>*</span></label>
                    <input
                      id="empCode"
                      name="empCode"
                      type="text"
                      placeholder="e.g. DPL1042"
                      value={form.empCode}
                      onChange={onFieldChange}
                      autoComplete="off"
                    />
                  </div>
                  <div className="mpr-field">
                    <label htmlFor="name">Employee Name <span>*</span></label>
                    <input
                      id="name"
                      name="name"
                      type="text"
                      placeholder="Full name"
                      value={form.name}
                      onChange={onFieldChange}
                      autoComplete="off"
                    />
                  </div>
                  <div className="mpr-field">
                    <label htmlFor="branch">Branch <span>*</span></label>
                    <input
                      id="branch"
                      name="branch"
                      type="text"
                      placeholder="e.g. Kolkata"
                      value={form.branch}
                      onChange={onFieldChange}
                      autoComplete="off"
                    />
                  </div>
                  <div className="mpr-field">
                    <label htmlFor="designation">Designation <span>*</span></label>
                    <select id="designation" name="designation" value={form.designation} onChange={onFieldChange}>
                      <option value="">Select designation</option>
                      {DESIGNATIONS.map(item => <option key={item} value={item}>{item}</option>)}
                    </select>
                  </div>
                  {/* <div className="mpr-field">
                    <label htmlFor="dateOfJoining">Date of Joining</label>
                    <input
                      id="dateOfJoining"
                      name="dateOfJoining"
                      type="date"
                      value={form.dateOfJoining}
                      onChange={onFieldChange}
                    />
                  </div> */}
                  {/* <div className="mpr-field">
                    <label>Ageing</label>
                    <div className="mpr-readonly">
                      <i className="fa-regular fa-clock"></i>
                      {formatAgeing(ageingMonths)}
                    </div>
                  </div> */}
                  {/* <div className="mpr-field">
                    <label htmlFor="reportingManager">Reporting Manager <span>*</span></label>
                    <input
                      id="reportingManager"
                      name="reportingManager"
                      type="text"
                      placeholder="Manager name"
                      value={form.reportingManager}
                      onChange={onFieldChange}
                      autoComplete="off"
                    />
                  </div> */}
                  <div className="mpr-field">
                    <label htmlFor="ratingPeriod">Rating Period <span>*</span></label>
                    <input
                      id="ratingPeriod"
                      name="ratingPeriod"
                      type="month"
                      value={form.ratingPeriod}
                      onChange={onFieldChange}
                    />
                  </div>
                </div>
              </div>
            </section>

            <section className="mpr-card">
              <div className="mpr-card-head">
                <h2><i className="fa-solid fa-star-half-stroke"></i> Performance Parameters</h2>
                <span className={`mpr-progress ${allRated ? 'done' : ''}`}>{ratedCount} of {PARAMETERS.length} rated</span>
              </div>

              <div className="mpr-scale-legend">
                <span>1 Poor</span>
                <span>2 Needs Improvement</span>
                <span>3 Meets Standard</span>
                <span>4 Good</span>
                <span>5 Excellent</span>
              </div>

              <div className="mpr-card-body mpr-rating-list">
                {PARAMETERS.map((parameter, index) => {
                  const value = form.ratings[parameter.key]
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
                <h2><i className="fa-regular fa-comment-dots"></i> Manager Remarks</h2>
              </div>
              <div className="mpr-card-body">
                <textarea
                  name="remarks"
                  rows={4}
                  placeholder="Field observations, training already given, action agreed with the employee..."
                  value={form.remarks}
                  onChange={onFieldChange}
                ></textarea>
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
                      <strong>Rating not started</strong>
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
                          ? `Average of all ${PARAMETERS.length} parameters is ${averageScore.toFixed(1)}.`
                          : `Based on ${ratedCount} of ${PARAMETERS.length} parameters rated so far.`}
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
                          <strong>{form.ratings[parameter.key]}</strong>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="mpr-card-footer">
                <button type="button" className="mpr-btn mpr-btn-secondary" onClick={resetForm}>Clear</button>
                <button type="submit" className="mpr-btn mpr-btn-primary" disabled={!allRated}>
                  <i className="fa-solid fa-floppy-disk"></i>
                  Submit Rating
                </button>
              </div>
            </section>
          </aside>
        </div>
      </form>
    </main>
  )
}
