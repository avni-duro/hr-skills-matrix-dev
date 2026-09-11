import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  fetchSkillMaster,
  fetchSkillVideos,
  fetchTrainingRows,
  fetchQuizzesForVideos,
  saveVideoProgress,
  markVideoCompleted,
  fetchAssessment,
  submitAssessment,
  summariseSkill,
  DEFAULT_PASSING_SCORE,
} from '../services/skillTraining'
import { PASS_MARK, SKILL_PARAMETERS } from '../config/skillMatrix'
import './SkillTrainingPanel.css'

const formatDuration = (seconds) => {
  if (!seconds) return '-'
  const minutes = Math.floor(seconds / 60)
  const rest = Math.round(seconds % 60)
  return `${minutes}:${String(rest).padStart(2, '0')} min`
}

// A video counts as watched once this much of it has played
const WATCHED_FRACTION = 0.95

/**
 * playback_url is stored in two shapes in the videos table:
 * a Bunny HLS link, or a full iframe embed snippet. Both are handled.
 */
const resolvePlayback = (value = '') => {
  const text = String(value || '').trim()
  if (!text) return { kind: 'none', src: '' }

  if (text.includes('<iframe')) {
    const match = text.match(/src=["']([^"']+)["']/i)
    return match ? { kind: 'iframe', src: match[1] } : { kind: 'none', src: '' }
  }

  if (!/^https?:\/\//i.test(text)) return { kind: 'none', src: '' }
  if (text.includes('iframe.mediadelivery.net')) return { kind: 'iframe', src: text }
  if (text.includes('.m3u8')) return { kind: 'hls', src: text }
  return { kind: 'file', src: text }
}

function VideoPlayer({ video, onWatched, onClose }) {
  const videoRef = useRef(null)
  const lastSavedRef = useRef(0)
  const [error, setError] = useState('')
  const [reachedEnd, setReachedEnd] = useState(false)
  const playback = useMemo(() => resolvePlayback(video.playbackUrl), [video.playbackUrl])

  useEffect(() => {
    const element = videoRef.current
    if (!element || playback.kind === 'iframe' || playback.kind === 'none') return undefined

    let hls = null
    let cancelled = false

    // Safari plays HLS on its own; other browsers need hls.js, loaded only when a video opens
    if (playback.kind === 'file' || element.canPlayType('application/vnd.apple.mpegurl')) {
      element.src = playback.src
    } else {
      import('hls.js').then(({ default: Hls }) => {
        if (cancelled) return
        if (!Hls.isSupported()) {
          setError('This browser cannot play the video format')
          return
        }
        hls = new Hls({ enableWorker: true })
        hls.loadSource(playback.src)
        hls.attachMedia(element)
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data?.fatal) setError('This video could not be played. Check the playback URL in the Videos screen.')
        })
      }).catch(() => {
        if (!cancelled) setError('Video player could not be loaded')
      })
    }

    return () => {
      cancelled = true
      if (hls) hls.destroy()
    }
  }, [playback])

  const handleTimeUpdate = (event) => {
    const element = event.target
    const played = element.currentTime || 0
    const total = element.duration || video.duration || 0

    if (played - lastSavedRef.current >= 15) {
      lastSavedRef.current = played
      onWatched({ watchedSeconds: played, completed: false })
    }

    if (total && played / total >= WATCHED_FRACTION && !reachedEnd) {
      setReachedEnd(true)
      onWatched({ watchedSeconds: played, completed: true })
    }
  }

  const handleEnded = (event) => {
    if (reachedEnd) return
    setReachedEnd(true)
    onWatched({ watchedSeconds: event.target.currentTime || video.duration || 0, completed: true })
  }

  return (
    <div className="stp-modal-overlay" onClick={onClose}>
      <div className="stp-modal stp-modal-player" onClick={(event) => event.stopPropagation()}>
        <div className="stp-modal-head">
          <div>
            <h2>{video.title}</h2>
            <p>{formatDuration(video.duration)}</p>
          </div>
          <button type="button" className="stp-close" onClick={onClose}>
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div className="stp-player-body">
          {error || playback.kind === 'none' ? (
            <div className="stp-player-error">
              <i className="fa-solid fa-triangle-exclamation"></i>
              <p>{error || 'This video has no usable playback link in the Videos screen.'}</p>
            </div>
          ) : playback.kind === 'iframe' ? (
            <div className="stp-embed">
              <iframe
                src={playback.src}
                title={video.title}
                loading="lazy"
                allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
              ></iframe>
            </div>
          ) : (
            <video
              ref={videoRef}
              className="stp-video"
              controls
              controlsList="nodownload"
              onTimeUpdate={handleTimeUpdate}
              onEnded={handleEnded}
            />
          )}
        </div>

        <div className="stp-modal-foot">
          {reachedEnd ? (
            <span className="stp-watched-note">
              <i className="fa-solid fa-circle-check"></i>
              Video watched. The assessment is open now.
            </span>
          ) : (
            <span className="stp-watched-note muted">
              {playback.kind === 'iframe'
                ? 'This video plays in the Bunny player, so mark it watched after finishing it.'
                : 'Watch the full video to open the assessment.'}
            </span>
          )}
          {playback.kind === 'iframe' && !reachedEnd && (
            <button
              type="button"
              className="stp-btn stp-btn-primary"
              onClick={() => {
                setReachedEnd(true)
                onWatched({ watchedSeconds: video.duration || 0, completed: true })
              }}
            >
              <i className="fa-solid fa-check"></i>
              I have watched this
            </button>
          )}
          <button type="button" className="stp-btn stp-btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

function Assessment({ video, trainingRow, userId, onClose, onFinished }) {
  const [loading, setLoading] = useState(true)
  const [quiz, setQuiz] = useState(null)
  const [questions, setQuestions] = useState([])
  const [answers, setAnswers] = useState({})
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null)

  useEffect(() => {
    let active = true

    const load = async () => {
      setLoading(true)
      const { quiz: loadedQuiz, questions: loadedQuestions, error: loadError } = await fetchAssessment(video.id)
      if (!active) return
      setQuiz(loadedQuiz)
      setQuestions(loadedQuestions)
      setError(loadError || '')
      setLoading(false)
    }

    load()
    return () => { active = false }
  }, [video.id])

  const answeredCount = Object.keys(answers).length

  const handleSubmit = async () => {
    if (answeredCount < questions.length) {
      setError(`Answer all ${questions.length} questions before submitting`)
      return
    }

    setSubmitting(true)
    setError('')
    const { result: scored, error: submitError } = await submitAssessment({
      trainingRow,
      quiz,
      questions,
      answers,
      userId,
    })
    setSubmitting(false)

    if (submitError) {
      setError(submitError)
      return
    }

    setResult(scored)
    onFinished()
  }

  return (
    <div className="stp-modal-overlay" onClick={onClose}>
      <div className="stp-modal" onClick={(event) => event.stopPropagation()}>
        <div className="stp-modal-head">
          <div>
            <h2>{quiz?.title || 'Assessment'}</h2>
            <p>{video.title}</p>
          </div>
          <button type="button" className="stp-close" onClick={onClose}>
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div className="stp-modal-body">
          {loading && (
            <div className="stp-state"><i className="fa-solid fa-spinner fa-spin"></i> Loading assessment...</div>
          )}

          {!loading && !quiz && (
            <div className="stp-empty">
              <i className="fa-regular fa-circle-question"></i>
              <div>
                <strong>No assessment created for this video yet</strong>
                <p>Build one in Quiz Builder and link it to this video, then the employee can clear the skill.</p>
              </div>
            </div>
          )}

          {!loading && quiz && result && (
            <div className={`stp-result ${result.passed ? 'pass' : 'fail'}`}>
              <span className="stp-result-score">{result.score}%</span>
              <strong>{result.passed ? 'Passed' : 'Not cleared'}</strong>
              <p>
                {result.correct} of {result.total} correct. Passing score is {result.passingScore}%.
                {!result.passed && ' Watch the video again and retake the assessment.'}
              </p>
            </div>
          )}

          {!loading && quiz && !result && (
            <>
              <div className="stp-quiz-meta">
                <span>{questions.length} questions</span>
                <span>Passing score {quiz.passingScore || DEFAULT_PASSING_SCORE}%</span>
                <span className={answeredCount === questions.length ? 'done' : ''}>
                  {answeredCount} of {questions.length} answered
                </span>
              </div>

              <ol className="stp-question-list">
                {questions.map((question, index) => (
                  <li key={question.id} className="stp-question">
                    <p className="stp-question-text">
                      <span className="stp-question-index">{index + 1}</span>
                      {question.text}
                    </p>
                    <div className="stp-options">
                      {question.options.map((option, optionIndex) => (
                        <label
                          key={`${question.id}-${optionIndex}`}
                          className={`stp-option ${answers[question.id] === option ? 'selected' : ''}`}
                        >
                          <input
                            type="radio"
                            name={`question-${question.id}`}
                            checked={answers[question.id] === option}
                            onChange={() => setAnswers(prev => ({ ...prev, [question.id]: option }))}
                          />
                          <span>{option}</span>
                        </label>
                      ))}
                    </div>
                  </li>
                ))}
              </ol>
            </>
          )}

          {error && (
            <div className="stp-inline-error">
              <i className="fa-solid fa-circle-exclamation"></i>
              {error}
            </div>
          )}
        </div>

        <div className="stp-modal-foot">
          <button type="button" className="stp-btn stp-btn-secondary" onClick={onClose}>
            {result ? 'Close' : 'Cancel'}
          </button>
          {!result && quiz && questions.length > 0 && (
            <button
              type="button"
              className="stp-btn stp-btn-primary"
              onClick={handleSubmit}
              disabled={submitting}
            >
              <i className={`fa-solid ${submitting ? 'fa-spinner fa-spin' : 'fa-paper-plane'}`}></i>
              {submitting ? 'Submitting...' : 'Submit Assessment'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Retraining list for one person: the skills rated below the cut-off,
 * the videos mapped to those skills, and the assessment after each video.
 */
export default function SkillTrainingPanel({ person, review, viewerUserId, readOnly = false, onProgress, focusSkillKey = null, onFocusHandled }) {
  const [loading, setLoading] = useState(true)
  const [setupMissing, setSetupMissing] = useState(false)
  const [error, setError] = useState('')
  const [skillsByKey, setSkillsByKey] = useState(new Map())
  const [videosBySkill, setVideosBySkill] = useState(new Map())
  const [trainingRows, setTrainingRows] = useState([])
  const [playing, setPlaying] = useState(null) // { video, row }
  const [assessing, setAssessing] = useState(null) // { video, row }
  const [highlighted, setHighlighted] = useState(null)
  const [quizzesByVideo, setQuizzesByVideo] = useState(new Map())
  const skillRefs = useRef({})
  const navigate = useNavigate()

  const weakSkillKeys = useMemo(() => (
    SKILL_PARAMETERS
      .filter(parameter => {
        const value = Number(review?.ratings?.[parameter.key]) || 0
        return value > 0 && value < PASS_MARK
      })
      .map(parameter => parameter.key)
  ), [review])

  const load = useCallback(async () => {
    if (!person?.id || !weakSkillKeys.length) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError('')

    const { skillsByKey: skills, missingTable: skillsMissing, error: skillsError } = await fetchSkillMaster()
    if (skillsMissing) {
      setSetupMissing(true)
      setLoading(false)
      return
    }
    if (skillsError) {
      setError(skillsError.message || 'Failed to load the skill master')
      setLoading(false)
      return
    }

    const weakSkillIds = weakSkillKeys.map(key => skills.get(key)?.id).filter(Boolean)
    const [videosResult, trainingResult] = await Promise.all([
      fetchSkillVideos(weakSkillIds),
      fetchTrainingRows(person.id),
    ])

    if (videosResult.missingTable || trainingResult.missingTable) {
      setSetupMissing(true)
      setLoading(false)
      return
    }

    const mappedVideoIds = [...videosResult.videosBySkill.values()]
      .flat()
      .map(video => video.id)
    const { quizzesByVideo: quizMap } = await fetchQuizzesForVideos(mappedVideoIds)

    setSkillsByKey(skills)
    setVideosBySkill(videosResult.videosBySkill)
    setTrainingRows(trainingResult.rows)
    setQuizzesByVideo(quizMap)
    setSetupMissing(false)
    setLoading(false)
  }, [person?.id, weakSkillKeys])

  useEffect(() => {
    load()
  }, [load])

  // A skill opened from the review tag scrolls into view and is highlighted for a moment
  useEffect(() => {
    if (!focusSkillKey || loading) return undefined

    const element = skillRefs.current[focusSkillKey]
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setHighlighted(focusSkillKey)
    }
    if (onFocusHandled) onFocusHandled()

    const timer = setTimeout(() => setHighlighted(null), 2500)
    return () => clearTimeout(timer)
  }, [focusSkillKey, loading, onFocusHandled])

  const rowFor = useCallback(
    (skillId, videoId) => trainingRows.find(row => row.skillId === skillId && row.videoId === videoId) || null,
    [trainingRows]
  )

  const handleWatched = async ({ watchedSeconds, completed }) => {
    const row = playing?.row
    await saveVideoProgress({
      userId: person.id,
      videoId: playing.video.id,
      watchedSeconds,
      completed,
    })

    if (completed && row && !row.videoCompleted) {
      await markVideoCompleted(row.id)
      await load()
      if (onProgress) onProgress()
    }
  }

  const handleAssessmentFinished = async () => {
    await load()
    if (onProgress) onProgress()
  }

  if (!weakSkillKeys.length) {
    return (
      <div className="stp-empty">
        <i className="fa-solid fa-circle-check"></i>
        <div>
          <strong>No retraining pending</strong>
          <p>
            {review
              ? `Every parameter in the last review is at or above ${PASS_MARK.toFixed(1)}.`
              : 'Retraining videos appear here once a review rates a parameter below the cut-off.'}
          </p>
        </div>
      </div>
    )
  }

  if (loading) {
    return <div className="stp-state"><i className="fa-solid fa-spinner fa-spin"></i> Loading training...</div>
  }

  if (setupMissing) {
    return (
      <div className="stp-empty warn">
        <i className="fa-solid fa-database"></i>
        <div>
          <strong>Skill training tables are not created yet</strong>
          <p>Run supabase/migrations/20260911000100_create_skill_training.sql, then map videos to each skill.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="stp-panel">
      {error && (
        <div className="stp-inline-error">
          <i className="fa-solid fa-circle-exclamation"></i>
          {error}
        </div>
      )}

      {weakSkillKeys.map((skillKey) => {
        const parameter = SKILL_PARAMETERS.find(item => item.key === skillKey)
        const skill = skillsByKey.get(skillKey)
        const videos = skill ? (videosBySkill.get(skill.id) || []) : []
        const rows = skill ? trainingRows.filter(row => row.skillId === skill.id) : []
        const summary = summariseSkill(rows)
        const rating = Number(review?.ratings?.[skillKey]) || 0

        return (
          <section
            className={`stp-skill ${highlighted === skillKey ? 'is-focused' : ''}`}
            key={skillKey}
            ref={(element) => { skillRefs.current[skillKey] = element }}
          >
            <header className="stp-skill-head">
              <div className="stp-skill-title">
                <h3>{parameter?.label || skill?.name || skillKey}</h3>
                <span className="stp-rating">Rated {rating}/5</span>
              </div>

              {summary.total > 0 && (
                <div className="stp-skill-status">
                  <span className="stp-progress-text">
                    {summary.videosWatched} of {summary.total} videos watched
                    {summary.assessmentsDone > 0 && ` · ${summary.assessmentsDone} of ${summary.total} assessments done`}
                  </span>
                  {summary.averageScore !== null && (
                    <span className={`stp-avg ${summary.cleared ? 'pass' : 'pending'}`}>
                      Avg {Math.round(summary.averageScore)}%
                    </span>
                  )}
                  <span className={`stp-chip ${summary.cleared ? 'cleared' : 'pending'}`}>
                    <i className={`fa-solid ${summary.cleared ? 'fa-circle-check' : 'fa-hourglass-half'}`}></i>
                    {summary.cleared ? 'Retraining cleared' : 'In progress'}
                  </span>
                </div>
              )}
            </header>

            {videos.length === 0 ? (
              <div className="stp-empty small">
                <i className="fa-regular fa-folder-open"></i>
                <div>
                  <strong>No video mapped to this skill yet</strong>
                  <p>Add rows in skill_video_map for this skill, up to 3 videos.</p>
                </div>
              </div>
            ) : (
              <div className="stp-video-grid">
                {videos.map((video, index) => {
                  const row = skill ? rowFor(skill.id, video.id) : null
                  const watched = Boolean(row?.videoCompleted)
                  const passed = Boolean(row?.assessmentPassed)
                  const score = row?.assessmentScore
                  const quiz = quizzesByVideo.get(video.id) || null

                  return (
                    <article className={`stp-video-card ${passed ? 'done' : ''}`} key={video.id}>
                      <div className="stp-thumb">
                        <span className="stp-thumb-index">Video {index + 1}</span>
                        <i className={`fa-solid ${passed ? 'fa-circle-check' : 'fa-play'}`}></i>
                      </div>

                      <div className="stp-video-info">
                        <strong>{video.title}</strong>
                        <span>{formatDuration(video.duration)}</span>
                      </div>

                      <div className="stp-video-status">
                        <span className={`stp-state-chip ${watched ? 'done' : 'todo'}`}>
                          <i className={`fa-solid ${watched ? 'fa-check' : 'fa-play'}`}></i>
                          {watched ? 'Watched' : 'Not watched'}
                        </span>
                        <span className={`stp-state-chip ${passed ? 'done' : score !== null && score !== undefined ? 'fail' : 'todo'}`}>
                          <i className="fa-solid fa-clipboard-question"></i>
                          {score === null || score === undefined ? 'Assessment pending' : `${Math.round(score)}%`}
                        </span>
                        <span className={`stp-state-chip ${quiz?.questionCount ? 'quiz' : 'fail'}`}>
                          <i className="fa-solid fa-list-check"></i>
                          {quiz?.questionCount
                            ? `${quiz.questionCount} questions`
                            : 'No assessment'}
                        </span>
                      </div>

                      {readOnly && (
                        <div className="stp-video-actions">
                          <button
                            type="button"
                            className="stp-btn stp-btn-secondary"
                            onClick={() => navigate(
                              quiz ? `/quiz-builder/${quiz.quizId}` : `/quiz-builder?video=${video.id}`
                            )}
                          >
                            <i className={`fa-solid ${quiz ? 'fa-pen' : 'fa-plus'}`}></i>
                            {quiz ? 'Edit questions' : 'Add questions'}
                          </button>
                        </div>
                      )}

                      {!readOnly && (
                        <div className="stp-video-actions">
                          <button
                            type="button"
                            className="stp-btn stp-btn-secondary"
                            onClick={() => setPlaying({ video, row })}
                            disabled={!video.playbackUrl}
                          >
                            <i className="fa-solid fa-play"></i>
                            {watched ? 'Watch again' : 'Watch'}
                          </button>
                          <button
                            type="button"
                            className="stp-btn stp-btn-primary"
                            onClick={() => setAssessing({ video, row })}
                            disabled={!watched || !row || passed}
                            title={!watched ? 'Finish the video first' : undefined}
                          >
                            <i className="fa-solid fa-clipboard-question"></i>
                            {passed ? 'Cleared' : 'Assessment'}
                          </button>
                        </div>
                      )}
                    </article>
                  )
                })}
              </div>
            )}
          </section>
        )
      })}

      {playing && (
        <VideoPlayer
          video={playing.video}
          onWatched={handleWatched}
          onClose={() => setPlaying(null)}
        />
      )}

      {assessing && assessing.row && (
        <Assessment
          video={assessing.video}
          trainingRow={assessing.row}
          userId={viewerUserId}
          onClose={() => setAssessing(null)}
          onFinished={handleAssessmentFinished}
        />
      )}
    </div>
  )
}
