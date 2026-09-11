/**
 * Skill Training Service
 * Skill master, skill to video mapping, and the retraining an employee has to finish
 * after a low rating. Videos, quizzes and quiz results come from the existing tables.
 */

import { supabase } from '../supabaseClient'
import { PASS_MARK } from '../config/skillMatrix'

export const SKILL_TABLE = 'skill_master'
export const MAP_TABLE = 'skill_video_map'
export const TRAINING_TABLE = 'employee_skill_training'

// Score needed to clear an assessment when the quiz itself does not set one
export const DEFAULT_PASSING_SCORE = 60

const MISSING_TABLE_CODES = ['42P01', 'PGRST205']

const isMissingTable = (error) => Boolean(error) && MISSING_TABLE_CODES.includes(error.code)

const mapTrainingRow = (row) => ({
  id: row.id,
  employeeUserId: row.employee_user_id,
  skillId: row.skill_id,
  videoId: row.video_id,
  reviewId: row.review_id,
  ratingGiven: row.rating_given,
  videoCompleted: Boolean(row.video_completed),
  assessmentScore: row.assessment_score === null || row.assessment_score === undefined
    ? null
    : Number(row.assessment_score),
  assessmentPassed: Boolean(row.assessment_passed),
  assessmentAttempts: row.assessment_attempts || 0,
  status: row.status || 'pending',
  completedAt: row.completed_at,
})

/**
 * Skill master rows, keyed by skill_key so they line up with the rating parameters.
 */
export async function fetchSkillMaster() {
  const { data, error } = await supabase
    .from(SKILL_TABLE)
    .select('id, skill_key, skill_name, skill_order, is_active')
    .eq('is_active', true)
    .order('skill_order')

  if (error) {
    return { skillsByKey: new Map(), skillsById: new Map(), missingTable: isMissingTable(error), error: isMissingTable(error) ? null : error }
  }

  const skillsByKey = new Map()
  const skillsById = new Map()
  ;(data || []).forEach((row) => {
    const skill = { id: row.id, key: row.skill_key, name: row.skill_name }
    skillsByKey.set(row.skill_key, skill)
    skillsById.set(row.id, skill)
  })

  return { skillsByKey, skillsById, missingTable: false, error: null }
}

/**
 * Videos mapped to each skill, as a Map of skillId to an ordered list of videos.
 */
export async function fetchSkillVideos(skillIds = []) {
  const ids = skillIds.filter(Boolean)
  if (!ids.length) return { videosBySkill: new Map(), missingTable: false, error: null }

  const { data, error } = await supabase
    .from(MAP_TABLE)
    .select('id, skill_id, video_id, video_order, is_mandatory, videos (id, title, description, duration, playback_url, bunny_video_id, module_id)')
    .in('skill_id', ids)
    .eq('is_active', true)
    .order('video_order')

  if (error) {
    return { videosBySkill: new Map(), missingTable: isMissingTable(error), error: isMissingTable(error) ? null : error }
  }

  const videosBySkill = new Map()
  ;(data || []).forEach((row) => {
    if (!row.videos) return
    const list = videosBySkill.get(row.skill_id) || []
    list.push({
      mapId: row.id,
      id: row.videos.id,
      title: row.videos.title || 'Untitled video',
      description: row.videos.description || '',
      duration: Number(row.videos.duration) || 0,
      playbackUrl: row.videos.playback_url || '',
      bunnyVideoId: row.videos.bunny_video_id || '',
      order: row.video_order || 1,
      mandatory: row.is_mandatory !== false,
    })
    videosBySkill.set(row.skill_id, list)
  })

  return { videosBySkill, missingTable: false, error: null }
}

/**
 * Training rows for one employee.
 */
export async function fetchTrainingRows(employeeUserId) {
  if (!employeeUserId) return { rows: [], missingTable: false, error: null }

  const { data, error } = await supabase
    .from(TRAINING_TABLE)
    .select('id, employee_user_id, skill_id, video_id, review_id, rating_given, video_completed, assessment_score, assessment_passed, assessment_attempts, status, completed_at')
    .eq('employee_user_id', employeeUserId)
    .order('assigned_on', { ascending: false })

  if (error) {
    return { rows: [], missingTable: isMissingTable(error), error: isMissingTable(error) ? null : error }
  }

  return { rows: (data || []).map(mapTrainingRow), missingTable: false, error: null }
}

/**
 * After a review is saved, create the training rows for every skill rated below the cut-off.
 * Existing rows for the same review are left as they are.
 */
export async function assignTrainingForReview({ review, employeeUserId, reviewerUserId }) {
  if (!review || !employeeUserId) return { assigned: 0, error: null }

  const weakKeys = Object.entries(review.ratings || {})
    .filter(([, value]) => Number(value) > 0 && Number(value) < PASS_MARK)
    .map(([key]) => key)

  if (!weakKeys.length) return { assigned: 0, error: null }

  const { skillsByKey, missingTable: skillsMissing } = await fetchSkillMaster()
  if (skillsMissing) return { assigned: 0, error: 'Skill master table is missing. Run the skill training migration first.' }

  const weakSkills = weakKeys.map(key => skillsByKey.get(key)).filter(Boolean)
  if (!weakSkills.length) return { assigned: 0, error: null }

  const { videosBySkill, missingTable: mapMissing } = await fetchSkillVideos(weakSkills.map(skill => skill.id))
  if (mapMissing) return { assigned: 0, error: 'Skill video mapping table is missing. Run the skill training migration first.' }

  const rows = []
  weakSkills.forEach((skill) => {
    const videos = videosBySkill.get(skill.id) || []
    videos.filter(video => video.mandatory).forEach((video) => {
      rows.push({
        employee_user_id: employeeUserId,
        skill_id: skill.id,
        video_id: video.id,
        review_id: review.id || null,
        rating_given: Number(review.ratings?.[skill.key]) || null,
        assigned_by: reviewerUserId || null,
        status: 'pending',
      })
    })
  })

  if (!rows.length) return { assigned: 0, error: null }

  const { error } = await supabase
    .from(TRAINING_TABLE)
    .upsert(rows, { onConflict: 'employee_user_id,skill_id,video_id,review_id', ignoreDuplicates: true })

  if (error) {
    return { assigned: 0, error: error.message || 'Failed to assign the training videos' }
  }

  return { assigned: rows.length, error: null }
}

/**
 * Save how far the employee has watched a video.
 * Uses the existing user_video_progress table so the Video Progress screen stays correct.
 */
export async function saveVideoProgress({ userId, videoId, watchedSeconds, completed }) {
  if (!userId || !videoId) return { error: null }

  const payload = {
    watched_duration: Math.round(watchedSeconds) || 0,
    completed: Boolean(completed),
    last_watched_at: new Date().toISOString(),
  }

  const { data: existing, error: readError } = await supabase
    .from('user_video_progress')
    .select('id, watched_duration')
    .eq('user_id', userId)
    .eq('video_id', videoId)
    .limit(1)
    .maybeSingle()

  if (readError) return { error: readError.message || 'Failed to read video progress' }

  const { error } = existing
    ? await supabase
      .from('user_video_progress')
      .update({ ...payload, watched_duration: Math.max(payload.watched_duration, existing.watched_duration || 0) })
      .eq('id', existing.id)
    : await supabase
      .from('user_video_progress')
      .insert({ user_id: userId, video_id: videoId, ...payload })

  return { error: error ? (error.message || 'Failed to save video progress') : null }
}

/**
 * Mark the video of one training row as watched. The assessment opens after this.
 */
export async function markVideoCompleted(trainingRowId) {
  const { data, error } = await supabase
    .from(TRAINING_TABLE)
    .update({
      video_completed: true,
      video_completed_at: new Date().toISOString(),
      status: 'video_done',
      updated_at: new Date().toISOString(),
    })
    .eq('id', trainingRowId)
    .eq('video_completed', false)
    .select('id, employee_user_id, skill_id, video_id, review_id, rating_given, video_completed, assessment_score, assessment_passed, assessment_attempts, status, completed_at')
    .maybeSingle()

  if (error) return { row: null, error: error.message || 'Failed to update the video status' }
  return { row: data ? mapTrainingRow(data) : null, error: null }
}

/**
 * Assessment of one video: the quiz linked to it, with its questions.
 */
export async function fetchAssessment(videoId) {
  const { data: quiz, error: quizError } = await supabase
    .from('quizzes')
    .select('id, title, passing_score, video_id, module_id')
    .eq('video_id', videoId)
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (quizError) return { quiz: null, questions: [], error: quizError.message || 'Failed to load the assessment' }
  if (!quiz) return { quiz: null, questions: [], error: null }

  const { data: questions, error: questionError } = await supabase
    .from('questions')
    .select('id, question_text, options, correct_option')
    .eq('quiz_id', quiz.id)

  if (questionError) return { quiz: null, questions: [], error: questionError.message || 'Failed to load the questions' }

  return {
    quiz: {
      id: quiz.id,
      title: quiz.title || 'Assessment',
      passingScore: Number(quiz.passing_score) || DEFAULT_PASSING_SCORE,
    },
    questions: (questions || []).map(question => ({
      id: question.id,
      text: question.question_text || '',
      options: Array.isArray(question.options) ? question.options : [],
      correctOption: question.correct_option,
    })),
    error: null,
  }
}

/**
 * Which of these videos already have an assessment, and how many questions it holds.
 * Returns a Map of videoId to { quizId, title, questionCount, passingScore }.
 */
export async function fetchQuizzesForVideos(videoIds = []) {
  const ids = videoIds.filter(Boolean)
  if (!ids.length) return { quizzesByVideo: new Map(), error: null }

  const { data: quizzes, error } = await supabase
    .from('quizzes')
    .select('id, title, video_id, passing_score')
    .in('video_id', ids)

  if (error) return { quizzesByVideo: new Map(), error }

  const quizIds = (quizzes || []).map(quiz => quiz.id)
  const counts = new Map()

  if (quizIds.length) {
    const { data: questions, error: questionError } = await supabase
      .from('questions')
      .select('id, quiz_id')
      .in('quiz_id', quizIds)

    if (questionError) return { quizzesByVideo: new Map(), error: questionError }
    ;(questions || []).forEach((question) => {
      counts.set(question.quiz_id, (counts.get(question.quiz_id) || 0) + 1)
    })
  }

  const quizzesByVideo = new Map()
  ;(quizzes || []).forEach((quiz) => {
    quizzesByVideo.set(quiz.video_id, {
      quizId: quiz.id,
      title: quiz.title || 'Assessment',
      questionCount: counts.get(quiz.id) || 0,
      passingScore: Number(quiz.passing_score) || DEFAULT_PASSING_SCORE,
    })
  })

  return { quizzesByVideo, error: null }
}

/**
 * Score an assessment, store the attempt and move the training row forward.
 */
export async function submitAssessment({ trainingRow, quiz, questions, answers, userId }) {
  const total = questions.length
  if (!total) return { result: null, error: 'This assessment has no questions' }

  const correct = questions.reduce((sum, question) => (
    answers[question.id] === question.correctOption ? sum + 1 : sum
  ), 0)

  const score = Math.round((correct / total) * 100)
  const passingScore = quiz.passingScore || DEFAULT_PASSING_SCORE
  const passed = score >= passingScore
  const now = new Date().toISOString()

  const { error: resultError } = await supabase
    .from('user_quiz_results')
    .insert({
      user_id: userId,
      quiz_id: quiz.id,
      score,
      completed_at: now,
    })

  if (resultError) {
    return { result: null, error: resultError.message || 'Failed to save the assessment result' }
  }

  const { error: trainingError } = await supabase
    .from(TRAINING_TABLE)
    .update({
      assessment_score: score,
      assessment_passed: passed,
      assessment_attempts: (trainingRow.assessmentAttempts || 0) + 1,
      last_attempt_at: now,
      status: passed ? 'completed' : 'video_done',
      completed_at: passed ? now : null,
      updated_at: now,
    })
    .eq('id', trainingRow.id)

  if (trainingError) {
    return { result: null, error: trainingError.message || 'Failed to update the training status' }
  }

  return { result: { score, passed, correct, total, passingScore }, error: null }
}

/**
 * Roll the per video rows of one skill into a single picture.
 * The skill is cleared when every mandatory video has an assessment score
 * and the average of those scores is at or above the passing score.
 */
export function summariseSkill(rows = [], passingScore = DEFAULT_PASSING_SCORE) {
  const total = rows.length
  const videosWatched = rows.filter(row => row.videoCompleted).length
  const attempted = rows.filter(row => row.assessmentScore !== null)
  const allAttempted = total > 0 && attempted.length === total

  const averageScore = attempted.length
    ? attempted.reduce((sum, row) => sum + row.assessmentScore, 0) / attempted.length
    : null

  const cleared = allAttempted && averageScore !== null && averageScore >= passingScore

  return {
    total,
    videosWatched,
    assessmentsDone: attempted.length,
    averageScore,
    cleared,
    passingScore,
  }
}
