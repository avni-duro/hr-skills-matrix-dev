import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import ManagerRating from './ManagerRating'
import ReviewHistory from '../components/ReviewHistory'
import { fetchLatestReview, fetchLatestReviewsFor } from '../services/skillMatrixReviews'
import { assignTrainingForReview } from '../services/skillTraining'
import SkillTrainingPanel from '../components/SkillTrainingPanel'
import {
  SKILL_PARAMETERS,
  RATING_SCALE,
  PASS_MARK,
  scoreClass,
  formatDate,
  initialsOf,
} from '../config/skillMatrix'
import './SkillMatrix.css'

const USER_COLUMNS = 'id, full_name, email, employee_id, reporting_manager, designation_id, department_id, branch_id, status'

// Placeholder slots until the video list for each department is given
const VIDEO_SLOTS = [1, 2, 3, 4, 5, 6]

const buildPerson = (row, maps) => ({
  id: row.id,
  name: row.full_name || 'N/A',
  email: row.email || '',
  empCode: row.employee_id || '',
  managerEmpCode: (row.reporting_manager || '').trim(),
  designation: maps.designations.get(row.designation_id) || '',
  department: maps.departments.get(row.department_id) || '',
  branch: maps.branches.get(row.branch_id) || '',
  status: String(row.status || 'active').trim().toLowerCase() === 'inactive' ? 'Inactive' : 'Active',
})

function VideoSlots({ readOnly = false }) {
  return (
    <div className="skm-video-grid">
      {VIDEO_SLOTS.map(slot => (
        <div className="skm-video-card" key={slot}>
          <div className="skm-video-thumb">
            <i className="fa-solid fa-play"></i>
            <span className="skm-video-slot">Slot {slot}</span>
          </div>
          <div className="skm-video-meta">
            <strong>Video to be assigned</strong>
            <span>{readOnly ? 'View only' : 'Training video'}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function ReviewReadOnly({ review, personName, managerName, onSkillClick }) {
  if (!review) {
    return (
      <div className="skm-empty-inline">
        <i className="fa-regular fa-folder-open"></i>
        <div>
          <strong>No review on record yet</strong>
          <p>
            {managerName
              ? `${managerName} has not submitted a skill review for ${personName} so far.`
              : `No reporting manager is mapped for ${personName} in the users table.`}
          </p>
        </div>
      </div>
    )
  }

  const isGood = review.averageRating >= PASS_MARK
  const ringClass = scoreClass(review.averageRating)

  // Skills that cleared the cut-off come first, the weak ones sit at the bottom
  const scored = SKILL_PARAMETERS.map(parameter => {
    const value = Number(review.ratings?.[parameter.key]) || 0
    return { ...parameter, value, weak: value > 0 && value < PASS_MARK }
  })
  const ordered = [...scored.filter(item => !item.weak), ...scored.filter(item => item.weak)]
  const weakSkills = scored.filter(item => item.weak)
  const goodCount = scored.length - weakSkills.length

  return (
    <div className="skm-review">
      {/* Score summary */}
      <section className="skm-score-card">
        <div className={`skm-score-stars ${ringClass}`}>
          <span className="skm-score-number">
            <strong>{review.averageRating.toFixed(1)}</strong>
            <small>/ 5</small>
          </span>
          <span className="skm-stars" title={`${review.averageRating.toFixed(1)} out of 5`}>
            <span className="skm-stars-row">
              {RATING_SCALE.map(star => <i className="fa-solid fa-star" key={star}></i>)}
            </span>
            <span className="skm-stars-clip" style={{ width: `${(review.averageRating / 5) * 100}%` }}>
              <span className="skm-stars-row filled">
                {RATING_SCALE.map(star => <i className="fa-solid fa-star" key={star}></i>)}
              </span>
            </span>
          </span>
          <span className="skm-score-caption">Average rating</span>
        </div>

        <div className="skm-score-side">
          <span className={`skm-score-status ${isGood ? 'good' : 'low'}`}>
            <i className={`fa-solid ${isGood ? 'fa-circle-check' : 'fa-triangle-exclamation'}`}></i>
            {isGood ? 'Good' : 'Low Performance'}
          </span>

          <div className="skm-score-facts">
            <div>
              <span><i className="fa-regular fa-calendar"></i>Rating Period</span>
              <strong>{review.ratingPeriod || '-'}</strong>
            </div>
            <div>
              <span><i className="fa-regular fa-user"></i>Reviewed By</span>
              <strong>{review.reviewerName || '-'}</strong>
            </div>
            <div>
              <span><i className="fa-regular fa-calendar-check"></i>Submitted On</span>
              <strong>{formatDate(review.reviewedOn)}</strong>
            </div>
          </div>
        </div>
      </section>

      {/* Overall performance */}
      <section className={`skm-overall ${isGood ? 'good' : 'low'}`}>
        <span className="skm-overall-icon">
          <i className={`fa-solid ${isGood ? 'fa-trophy' : 'fa-graduation-cap'}`}></i>
        </span>
        <div className="skm-overall-text">
          <strong>Overall Performance</strong>
          <p>
            {isGood
              ? weakSkills.length
                ? `Your performance is strong, with ${weakSkills.length} area${weakSkills.length > 1 ? 's' : ''} needing attention.`
                : 'Every skill is at or above the cut-off. Nothing is pending.'
              : `Your average is below ${PASS_MARK.toFixed(1)}. Complete the training listed below.`}
          </p>
        </div>
        <i className={`fa-solid ${isGood ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down'} skm-overall-art`}></i>
      </section>

      {/* Skill assessment */}
      <section className="skm-assess">
        <div className="skm-assess-head">
          <span className="skm-assess-icon"><i className="fa-solid fa-table-cells-large"></i></span>
          <div className="skm-assess-title">
            <strong>Skill Assessment</strong>
            <span>Your rating on each training area</span>
          </div>
          <div className="skm-assess-counts">
            <span className="skm-count good">
              <i className="skm-count-dot"></i>Good <strong>{goodCount}/{scored.length}</strong>
            </span>
            <span className="skm-count low">
              <i className="skm-count-dot"></i>Needs Attention <strong>{weakSkills.length}/{scored.length}</strong>
            </span>
          </div>
        </div>

        <div className="skm-skill-rows">
          {ordered.map((item) => {
            const clickable = Boolean(item.weak && onSkillClick)
            const Row = clickable ? 'button' : 'div'
            return (
              <Row
                key={item.key}
                className={`skm-skill-row ${item.weak ? 'low' : 'good'} ${clickable ? 'is-link' : ''}`}
                {...(clickable
                  ? { type: 'button', onClick: () => onSkillClick(item.key), title: `Open the training videos for ${item.label}` }
                  : {})}
              >
                <span className="skm-skill-icon"><i className={`fa-solid ${item.icon}`}></i></span>
                <span className="skm-skill-text">
                  <strong>{item.label}</strong>
                  <span>{item.description}</span>
                </span>
                <span className="skm-skill-score">{item.value || '-'}/5</span>
                <i className="fa-solid fa-chevron-right skm-skill-chevron"></i>
              </Row>
            )
          })}
        </div>
      </section>

      {/* Action required */}
      {weakSkills.length > 0 && (
        <section className="skm-action">
          <div className="skm-action-head">
            <span className="skm-action-icon"><i className="fa-solid fa-triangle-exclamation"></i></span>
            <div>
              <strong>Action Required</strong>
              <p>Finish the training on {weakSkills.length === 1 ? 'this area' : 'these areas'} to lift your overall rating.</p>
            </div>
          </div>

          {weakSkills.map((item) => (
            <div className="skm-action-item" key={item.key}>
              <span className="skm-action-item-icon"><i className="fa-solid fa-graduation-cap"></i></span>
              <div className="skm-action-item-text">
                <div className="skm-action-item-top">
                  <strong>{item.label}</strong>
                  <span className="skm-skill-score low">{item.value}/5</span>
                </div>
                <span className="skm-action-item-desc">{item.description}</span>
              </div>
              {onSkillClick && (
                <button type="button" className="skm-action-btn" onClick={() => onSkillClick(item.key)}>
                  Open Training
                  <i className="fa-solid fa-chevron-right"></i>
                </button>
              )}
            </div>
          ))}
        </section>
      )}

      {review.remarks && (
        <div className="skm-remarks">
          <span>Manager Remarks</span>
          <p>{review.remarks}</p>
        </div>
      )}
    </div>
  )
}

export default function SkillMatrix() {
  const { user } = useAuth()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [me, setMe] = useState(null)
  const [myManager, setMyManager] = useState(null)
  const [team, setTeam] = useState([])

  const [view, setView] = useState('self')
  const [selfTab, setSelfTab] = useState('videos')
  const [focusSkillKey, setFocusSkillKey] = useState(null)
  const [selection, setSelection] = useState(null) // { member, mode: 'videos' | 'review' | 'history' }
  const [teamSearch, setTeamSearch] = useState('')
  const [myReview, setMyReview] = useState(null)
  const [teamReviews, setTeamReviews] = useState(new Map())
  const [reviewsTableMissing, setReviewsTableMissing] = useState(false)

  const loadReviews = useCallback(async (myUserId, teamUserIds) => {
    const [mine, teamResult] = await Promise.all([
      fetchLatestReview(myUserId),
      fetchLatestReviewsFor(teamUserIds),
    ])

    setMyReview(mine.review)
    setTeamReviews(teamResult.reviews)
    setReviewsTableMissing(Boolean(mine.missingTable || teamResult.missingTable))
  }, [])

  const loadData = useCallback(async () => {
    if (!user?.email) return

    setLoading(true)
    setError('')

    try {
      const { data: myRow, error: myError } = await supabase
        .from('users')
        .select(USER_COLUMNS)
        .eq('email', user.email)
        .maybeSingle()

      if (myError) throw myError
      if (!myRow) {
        setMe(null)
        setTeam([])
        setMyManager(null)
        setError(`No employee record found in the users table for ${user.email}`)
        return
      }

      const myEmpCode = (myRow.employee_id || '').trim()

      const [teamResult, managerResult] = await Promise.all([
        myEmpCode
          ? supabase.from('users').select(USER_COLUMNS).eq('reporting_manager', myEmpCode).order('full_name')
          : Promise.resolve({ data: [], error: null }),
        (myRow.reporting_manager || '').trim()
          ? supabase.from('users').select(USER_COLUMNS).eq('employee_id', (myRow.reporting_manager || '').trim()).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ])

      if (teamResult.error) throw teamResult.error
      if (managerResult.error) throw managerResult.error

      const teamRows = (teamResult.data || []).filter(row => row.id !== myRow.id)
      const managerRow = managerResult.data || null
      const allRows = [myRow, ...teamRows, ...(managerRow ? [managerRow] : [])]

      const designationIds = [...new Set(allRows.map(row => row.designation_id).filter(Boolean))]
      const departmentIds = [...new Set(allRows.map(row => row.department_id).filter(Boolean))]
      const branchIds = [...new Set(allRows.map(row => row.branch_id).filter(Boolean))]

      const [designations, departments, branches] = await Promise.all([
        designationIds.length
          ? supabase.from('designations').select('id, designation_name').in('id', designationIds)
          : Promise.resolve({ data: [] }),
        departmentIds.length
          ? supabase.from('departments').select('id, department_name').in('id', departmentIds)
          : Promise.resolve({ data: [] }),
        branchIds.length
          ? supabase.from('branches').select('id, branch_name').in('id', branchIds)
          : Promise.resolve({ data: [] }),
      ])

      const maps = {
        designations: new Map((designations.data || []).map(item => [item.id, item.designation_name])),
        departments: new Map((departments.data || []).map(item => [item.id, item.department_name])),
        branches: new Map((branches.data || []).map(item => [item.id, item.branch_name])),
      }

      setMe(buildPerson(myRow, maps))
      setMyManager(managerRow ? buildPerson(managerRow, maps) : null)
      setTeam(teamRows.map(row => buildPerson(row, maps)))
      await loadReviews(myRow.id, teamRows.map(row => row.id))
    } catch (loadError) {
      setError(loadError.message || 'Failed to load skill matrix')
      setMe(null)
      setTeam([])
      setMyManager(null)
    } finally {
      setLoading(false)
    }
  }, [user?.email, loadReviews])

  useEffect(() => {
    loadData()
  }, [loadData])

  const filteredTeam = useMemo(() => {
    const needle = teamSearch.trim().toLowerCase()
    if (!needle) return team
    return team.filter(member =>
      member.name.toLowerCase().includes(needle)
      || member.empCode.toLowerCase().includes(needle)
      || member.department.toLowerCase().includes(needle)
      || member.branch.toLowerCase().includes(needle)
    )
  }, [team, teamSearch])

  const hasTeam = team.length > 0

  // Nobody reports to this user, so the team option is not shown at all
  useEffect(() => {
    if (!hasTeam) {
      setView('self')
      setSelection(null)
    }
  }, [hasTeam])

  // Escape closes the review or history modal, same as their close button
  useEffect(() => {
    if (selection?.mode !== 'review' && selection?.mode !== 'history') return undefined
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setSelection(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selection])

  const switchView = (nextView) => {
    setView(nextView)
    setSelection(null)
  }

  if (loading) {
    return (
      <main className="skm-container">
        <div className="skm-state">
          <i className="fa-solid fa-spinner fa-spin"></i>
          Loading skill matrix...
        </div>
      </main>
    )
  }

  return (
    <main className="skm-container">
      <div className="skm-page-header">
        <div className="skm-header-content">
          <h1>Skill Matrix</h1>
          {/* <p>Training videos and skill review, for yourself and for the team reporting to you.</p> */}
        </div>
        <div className="skm-header-actions">
          <button type="button" className="skm-btn skm-btn-secondary" onClick={loadData}>
            <i className="fa-solid fa-rotate-right"></i>
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="skm-banner skm-banner-error">
          <i className="fa-solid fa-circle-exclamation"></i>
          <span>{error}</span>
        </div>
      )}

      {reviewsTableMissing && (
        <div className="skm-banner skm-banner-warn">
          <i className="fa-solid fa-database"></i>
          <span>
            Reviews table is not created yet. Run supabase/migrations/20260910000100_create_skill_matrix_reviews.sql,
            after that submitted reviews will show here.
          </span>
        </div>
      )}

      {me && (
        <>
          {hasTeam && (
          <div className="skm-switch" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={view === 'self'}
              className={`skm-switch-btn ${view === 'self' ? 'active' : ''}`}
              onClick={() => switchView('self')}
            >
              <i className="fa-solid fa-user-graduate"></i>
              <span>
                <strong>My Skill Matrix</strong>
                <small>My videos and my review</small>
              </span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === 'team'}
              className={`skm-switch-btn ${view === 'team' ? 'active' : ''}`}
              onClick={() => switchView('team')}
            >
              <i className="fa-solid fa-users-rectangle"></i>
              <span>
                <strong>My Team</strong>
                <small>{team.length} reporting to me</small>
              </span>
            </button>
          </div>
          )}

          {/* <section className="skm-profile">
            <span className="skm-avatar">{initialsOf(me.name)}</span>
            <div className="skm-profile-name">
              <strong>{me.name}</strong>
              <span>{me.empCode || '-'}</span>
            </div>
            <div className="skm-profile-facts">
              <div><span>Department</span><strong>{me.department || '-'}</strong></div>
              <div><span>Designation</span><strong>{me.designation || '-'}</strong></div>
              <div><span>Branch</span><strong>{me.branch || '-'}</strong></div>
              <div><span>Reporting Manager</span><strong>{myManager?.name || '-'}</strong></div>
            </div>
          </section> */}
        </>
      )}

      {me && view === 'self' && (
        <section className="skm-card">
          <div className="skm-tabs">
            <button
              type="button"
              className={`skm-tab ${selfTab === 'videos' ? 'active' : ''}`}
              onClick={() => setSelfTab('videos')}
            >
              <i className="fa-solid fa-clapperboard"></i>
              Training Videos
            </button>
            <button
              type="button"
              className={`skm-tab ${selfTab === 'review' ? 'active' : ''}`}
              onClick={() => setSelfTab('review')}
            >
              <i className="fa-solid fa-star-half-stroke"></i>
              My Review
            </button>
          </div>

          {selfTab === 'videos' ? (
            <div className="skm-card-body">
              <div className="skm-section-head">
                <h2>Retraining from my last review</h2>
                <span className="skm-note">Watch every video, then clear its assessment</span>
              </div>
              <SkillTrainingPanel
                person={me}
                review={myReview}
                viewerUserId={me.id}
                focusSkillKey={focusSkillKey}
                onFocusHandled={() => setFocusSkillKey(null)}
                onProgress={() => loadReviews(me.id, team.map(member => member.id))}
              />

              {/* <div className="skm-section-head skm-section-gap">
                <h2>Videos for {me.department || 'my department'}</h2>
                <span className="skm-note">Department library, to be linked</span>
              </div>
              <VideoSlots /> */}
            </div>
          ) : (
            <div className="skm-card-body">
              <div className="skm-review-head">
                <div className="skm-review-head-text">
                  <h2>My Review</h2>
                  {/* <p>Your training performance and skill assessment summary</p> */}
                </div>
                <span className="skm-given-by">
                  <i className="fa-regular fa-user"></i>
                  <span>Given by</span>
                  <strong>{myManager ? `${myManager.name} (${myManager.empCode || '-'})` : 'No manager mapped'}</strong>
                </span>
              </div>
              <ReviewReadOnly
                review={myReview}
                personName={me.name}
                managerName={myManager?.name || ''}
                onSkillClick={(skillKey) => { setSelfTab('videos'); setFocusSkillKey(skillKey) }}
              />
              <p className="skm-foot-note">
                Scale 1 to 5. {PASS_MARK.toFixed(1)} and above is good; below that retraining is due on the weak parameters.
              </p>
            </div>
          )}
        </section>
      )}

      {me && hasTeam && view === 'team' && !selection && (
        <section className="skm-card">
          <div className="skm-card-head">
            <h2><i className="fa-solid fa-users-rectangle"></i> Team Reporting to Me</h2>
            <div className="skm-search">
              <i className="fa-solid fa-magnifying-glass"></i>
              <input
                type="text"
                placeholder="Search name, code, department..."
                value={teamSearch}
                onChange={(event) => setTeamSearch(event.target.value)}
              />
            </div>
          </div>

          <div className="skm-card-body">
            {filteredTeam.length === 0 ? (
              <div className="skm-empty-inline">
                <i className="fa-solid fa-magnifying-glass"></i>
                <div>
                  <strong>No match for this search</strong>
                  <p>Clear the search box to see all {team.length} team members.</p>
                </div>
              </div>
            ) : (
              <div className="skm-team-grid">
                {filteredTeam.map(member => (
                  <article className="skm-member" key={member.id}>
                    <div className="skm-member-top">
                      <span className="skm-avatar small">{initialsOf(member.name)}</span>
                      <div className="skm-member-name">
                        <strong>{member.name}</strong>
                        <span>{member.empCode || '-'}</span>
                      </div>
                      <span className={`skm-status ${member.status.toLowerCase()}`}>{member.status}</span>
                    </div>

                    <dl className="skm-member-facts">
                      <div><dt>Department</dt><dd>{member.department || '-'}</dd></div>
                      <div><dt>Designation</dt><dd>{member.designation || '-'}</dd></div>
                      <div><dt>Branch</dt><dd>{member.branch || '-'}</dd></div>
                    </dl>

                    <div className="skm-member-actions">
                      <div className="skm-member-actions-row">
                        <button
                          type="button"
                          className="skm-btn skm-btn-secondary"
                          onClick={() => setSelection({ member, mode: 'videos' })}
                        >
                          <i className="fa-solid fa-clapperboard"></i>
                          Videos
                        </button>
                        <button
                          type="button"
                          className="skm-btn skm-btn-secondary"
                          onClick={() => setSelection({ member, mode: 'history' })}
                        >
                          <i className="fa-solid fa-clock-rotate-left"></i>
                          History
                        </button>
                      </div>
                      <button
                        type="button"
                        className="skm-btn skm-btn-primary skm-member-actions-primary"
                        onClick={() => setSelection({ member, mode: 'review' })}
                      >
                        <i className="fa-solid fa-star-half-stroke"></i>
                        Give Review
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {me && hasTeam && view === 'team' && selection?.mode === 'videos' && (
        <section className="skm-card">
          <div className="skm-card-head">
            <button type="button" className="skm-btn skm-btn-ghost" onClick={() => setSelection(null)}>
              <i className="fa-solid fa-arrow-left"></i>
              Back to Team
            </button>
            <span className="skm-note">View only</span>
          </div>
          <div className="skm-card-body">
            <div className="skm-section-head">
              <h2>{selection.member.name} — retraining progress</h2>
              <span className="skm-note">
                {selection.member.empCode || '-'} &middot; {selection.member.department || '-'}
              </span>
            </div>
            <SkillTrainingPanel
              person={selection.member}
              review={teamReviews.get(selection.member.id) || null}
              viewerUserId={me.id}
              readOnly
            />

            {/* <div className="skm-section-head skm-section-gap">
              <h2>Department videos</h2>
              <span className="skm-note">View only</span>
            </div>
            <VideoSlots readOnly /> */}
          </div>
        </section>
      )}

      {me && hasTeam && view === 'team' && selection?.mode === 'review' && (
        <div className="skm-modal-overlay" onClick={() => setSelection(null)}>
          <div className="skm-modal" onClick={(event) => event.stopPropagation()}>
            <ManagerRating
              employee={selection.member}
              reviewer={me}
              onClose={() => setSelection(null)}
              onViewHistory={() => setSelection({ member: selection.member, mode: 'history' })}
              onSaved={async (record, savedReview) => {
                await assignTrainingForReview({
                  review: savedReview || { id: null, ratings: record.ratings },
                  employeeUserId: selection.member.id,
                  reviewerUserId: me.id,
                })
                await loadReviews(me.id, team.map(member => member.id))
              }}
            />
          </div>
        </div>
      )}

      {me && hasTeam && view === 'team' && selection?.mode === 'history' && (
        <div className="skm-modal-overlay" onClick={() => setSelection(null)}>
          <div className="skm-modal" onClick={(event) => event.stopPropagation()}>
            <ReviewHistory
              employee={selection.member}
              onClose={() => setSelection(null)}
            />
          </div>
        </div>
      )}
    </main>
  )
}
