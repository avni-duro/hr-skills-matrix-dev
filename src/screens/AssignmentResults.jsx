import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabaseClient'
import { cachedFetch, TTL } from '../utils/cacheDB'
import './AssignmentResults.css'

function AssignmentResults() {
  const mountedRef = useRef(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [allAttempts, setAllAttempts] = useState([])
  const [detailOpen, setDetailOpen] = useState(false)
  const [selectedRow, setSelectedRow] = useState(null)
  const [selectedAttempts, setSelectedAttempts] = useState([])

  const breadcrumbItems = [
    { label: 'Home', link: true },
    { label: 'Assignment Results', link: false }
  ]

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen)
  }

  useEffect(() => {
    mountedRef.current = true
    fetchAssignmentResults()
    return () => {
      mountedRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchAssignmentResults = async () => {
    try {
      if (mountedRef.current) {
        setLoading(true)
        setError('')
      }

      const [usersResult, quizzesResult, resultsRes] = await Promise.all([
        cachedFetch('users_basic', async () => {
          const { data, error } = await supabase.from('users').select('id, full_name, email')
          if (error) throw error
          return data || []
        }, TTL.MEDIUM),
        cachedFetch('quizzes_basic', async () => {
          const { data, error } = await supabase.from('quizzes').select('id, title, passing_score')
          if (error) throw error
          return data || []
        }, TTL.MEDIUM),
        supabase.from('user_quiz_results').select('*').order('completed_at', { ascending: false })
      ])

      if (resultsRes.error) throw resultsRes.error

      const users = usersResult.data || []
      const quizzes = quizzesResult.data || []
      const attempts = resultsRes.data || []

      if (mountedRef.current) {
        setAllAttempts(attempts)
      }

      const userMap = new Map(users.map(u => [u.id, u]))
      const quizMap = new Map(quizzes.map(q => [q.id, q]))

      const aggregates = {}

      attempts.forEach(attempt => {
        if (!attempt.user_id || !attempt.quiz_id) return

        const key = `${attempt.user_id}-${attempt.quiz_id}`
        const user = userMap.get(attempt.user_id)
        const quiz = quizMap.get(attempt.quiz_id)

        if (!user || !quiz) return

        const passingScore = typeof quiz.passing_score === 'number' ? quiz.passing_score : 60

        if (!aggregates[key]) {
          aggregates[key] = {
            userId: attempt.user_id,
            quizId: attempt.quiz_id,
            userName: user.full_name || user.email || 'Unknown user',
            userEmail: user.email || '-',
            quizTitle: quiz.title || 'Untitled quiz',
            passingScore,
            attempts: 0,
            totalScore: 0,
            bestScore: null,
            lastScore: null,
            lastCompletedAt: null
          }
        }

        const agg = aggregates[key]
        const score = typeof attempt.score === 'number' ? attempt.score : null

        agg.attempts += 1
        if (score !== null) {
          agg.totalScore += score
          agg.bestScore = agg.bestScore === null ? score : Math.max(agg.bestScore, score)
          agg.lastScore = score
        }

        if (!agg.lastCompletedAt || new Date(attempt.completed_at) > new Date(agg.lastCompletedAt)) {
          agg.lastCompletedAt = attempt.completed_at
        }
      })

      const aggregatedResults = Object.values(aggregates).map(agg => {
        const averageScore = agg.attempts > 0 ? Math.round(agg.totalScore / agg.attempts) : 0
        const status = typeof agg.lastScore === 'number' && agg.lastScore >= agg.passingScore ? 'Pass' : 'Fail'

        return {
          ...agg,
          averageScore,
          status
        }
      }).sort((a, b) => {
        if (!a.lastCompletedAt || !b.lastCompletedAt) return 0
        return new Date(b.lastCompletedAt) - new Date(a.lastCompletedAt)
      })

      if (mountedRef.current) {
        setResults(aggregatedResults)
      }
    } catch (err) {
      console.error('Error fetching assignment results:', err)
      if (mountedRef.current) {
        setError(err.message || 'Failed to fetch assignment results')
        setResults([])
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false)
      }
    }
  }

  const formatDateTime = (value) => {
    if (!value) return 'N/A'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return 'N/A'
    return date.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const filteredResults = results.filter(row => {
    const term = searchTerm.toLowerCase()
    const matchesSearch =
      row.userName.toLowerCase().includes(term) ||
      row.userEmail.toLowerCase().includes(term) ||
      row.quizTitle.toLowerCase().includes(term)

    const matchesStatus = statusFilter === 'All' || row.status === statusFilter

    return matchesSearch && matchesStatus
  })

  const openDetail = (row) => {
    const attemptsForRow = allAttempts
      .filter(a => a.user_id === row.userId && a.quiz_id === row.quizId)
      .sort((a, b) => new Date(a.completed_at) - new Date(b.completed_at))

    setSelectedRow(row)
    setSelectedAttempts(attemptsForRow)
    setDetailOpen(true)
  }

  return (
        <main className="assignment-results-main">
          <section className="assignment-results-header">
            <div>
              <h2>Assignment Results</h2>
              <p>View quiz attempts, pass/fail status, and average scores per user.</p>
            </div>
            <div className="action-buttons">
              <button className="btn btn-secondary" onClick={fetchAssignmentResults}>
                <i className="fa-solid fa-arrows-rotate"></i>Refresh
              </button>
            </div>
          </section>

          {error && (
            <div className="error-message" style={{
              backgroundColor: '#FEE2E2',
              border: '1px solid #EF4444',
              color: '#991B1B',
              padding: '12px 16px',
              borderRadius: '8px',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <i className="fa-solid fa-circle-exclamation"></i>
              <span>{error}</span>
            </div>
          )}

          <section className="assignment-results-table-container">
            <div className="table-filters">
              <div className="search-wrapper">
                <i className="fa-solid fa-magnifying-glass"></i>
                <input
                  type="text"
                  placeholder="Search by user or assignment..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="filter-select-wrapper">
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="All">All Status</option>
                  <option value="Pass">Pass</option>
                  <option value="Fail">Fail</option>
                </select>
              </div>
            </div>

            {loading ? (
              <div style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                padding: '60px 20px',
                color: '#6B7280'
              }}>
                <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: '8px', fontSize: '20px' }}></i>
                Loading assignment results...
              </div>
            ) : filteredResults.length === 0 ? (
              <div style={{
                textAlign: 'center',
                padding: '60px 20px',
                color: '#6B7280'
              }}>
                <i className="fa-solid fa-clipboard-list" style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.5 }}></i>
                <p style={{ fontSize: '18px', fontWeight: '500', marginBottom: '8px' }}>No assignment results found</p>
                <p style={{ fontSize: '14px' }}>Results will appear here once users start completing quizzes.</p>
              </div>
            ) : (
              <div className="table-wrapper">
                <table className="assignment-results-table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Assignment</th>
                      <th>Attempts</th>
                      <th>Average Score</th>
                      <th>Best Score</th>
                      <th>Last Score</th>
                      <th>Status</th>
                      <th>Last Attempt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredResults.map(row => (
                      <tr 
                        key={`${row.userId}-${row.quizId}`}
                        onClick={() => openDetail(row)}
                      >
                        <td>
                          <div className="user-cell">
                            <div className="user-avatar-small">
                              {row.userName.charAt(0).toUpperCase()}
                            </div>
                            <div className="user-info">
                              <div className="user-name">{row.userName}</div>
                              <div className="user-email">{row.userEmail}</div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div className="quiz-info">
                            <span className="quiz-title">{row.quizTitle}</span>
                            <span className="quiz-subtext">Passing score: {row.passingScore}%</span>
                          </div>
                        </td>
                        <td>{row.attempts}</td>
                        <td>{row.averageScore}%</td>
                        <td>{row.bestScore !== null ? `${row.bestScore}%` : 'N/A'}</td>
                        <td>{row.lastScore !== null ? `${row.lastScore}%` : 'N/A'}</td>
                        <td>
                          <span className={`status-badge ${row.status === 'Pass' ? 'published' : 'draft'}`}>
                            {row.status}
                          </span>
                        </td>
                        <td>
                          <span className="date-text">{formatDateTime(row.lastCompletedAt)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Detail Drawer */}
          {detailOpen && selectedRow && (
            <div className="assignment-detail-overlay" onClick={() => setDetailOpen(false)}>
              <div className="assignment-detail-panel" onClick={(e) => e.stopPropagation()}>
                <div className="assignment-detail-header">
                  <div>
                    <h3>{selectedRow.quizTitle}</h3>
                    <p>{selectedRow.userName}  b7 {selectedRow.userEmail}</p>
                  </div>
                  <button
                    className="assignment-detail-close"
                    onClick={() => setDetailOpen(false)}
                  >
                    <i className="fa-solid fa-xmark"></i>
                  </button>
                </div>

                <div className="assignment-detail-summary">
                  <div>
                    <span className="summary-label">Attempts</span>
                    <span className="summary-value">{selectedRow.attempts}</span>
                  </div>
                  <div>
                    <span className="summary-label">Average Score</span>
                    <span className="summary-value">{selectedRow.averageScore}%</span>
                  </div>
                  <div>
                    <span className="summary-label">Best Score</span>
                    <span className="summary-value">{selectedRow.bestScore !== null ? `${selectedRow.bestScore}%` : 'N/A'}</span>
                  </div>
                  <div>
                    <span className="summary-label">Passing Score</span>
                    <span className="summary-value">{selectedRow.passingScore}%</span>
                  </div>
                </div>

                <div className="assignment-detail-list">
                  <table>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Score</th>
                        <th>Status</th>
                        <th>Time Taken</th>
                        <th>Completed At</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedAttempts.map((attempt, index) => {
                        const score = typeof attempt.score === 'number' ? attempt.score : null
                        const status = score !== null && score >= selectedRow.passingScore ? 'Pass' : 'Fail'
                        return (
                          <tr key={attempt.id || index}>
                            <td>{index + 1}</td>
                            <td>{score !== null ? `${score}%` : 'N/A'}</td>
                            <td>
                              <span className={`status-badge ${status === 'Pass' ? 'published' : 'draft'}`}>
                                {status}
                              </span>
                            </td>
                            <td>{attempt.time_taken != null ? `${attempt.time_taken} sec` : 'N/A'}</td>
                            <td>{formatDateTime(attempt.completed_at)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </main>
  )
}

export default AssignmentResults
