/**
 * Skill Matrix Reviews Service
 * Reads and writes the review the reporting manager gives to an employee.
 */

import { supabase } from '../supabaseClient'

export const REVIEWS_TABLE = 'skill_matrix_reviews'

const REVIEW_COLUMNS = 'id, employee_user_id, employee_code, employee_name, department, designation, branch, reviewer_user_id, reviewer_code, reviewer_name, rating_period, ratings, average_rating, status, retraining_required, retraining_parameters, remarks, created_at, updated_at'

// Postgres / PostgREST codes returned when the table has not been created yet
const MISSING_TABLE_CODES = ['42P01', 'PGRST205']

const isMissingTable = (error) => {
  if (!error) return false
  if (MISSING_TABLE_CODES.includes(error.code)) return true
  return /skill_matrix_reviews/i.test(error.message || '') && /not exist|not find/i.test(error.message || '')
}

const mapReviewRow = (row) => {
  if (!row) return null
  return {
    id: row.id,
    employeeUserId: row.employee_user_id,
    employeeCode: row.employee_code || '',
    employeeName: row.employee_name || '',
    department: row.department || '',
    designation: row.designation || '',
    branch: row.branch || '',
    reviewerUserId: row.reviewer_user_id,
    reviewerCode: row.reviewer_code || '',
    reviewerName: row.reviewer_name || '',
    ratingPeriod: row.rating_period || '',
    ratings: row.ratings || {},
    averageRating: Number(row.average_rating) || 0,
    status: row.status || '',
    retrainingRequired: Boolean(row.retraining_required),
    retrainingParameters: row.retraining_parameters || [],
    remarks: row.remarks || '',
    reviewedOn: row.updated_at || row.created_at || null,
  }
}

/**
 * Latest review for one employee.
 * Returns { review, missingTable, error } - missingTable is true until the
 * migration has been run, so the screen can show an empty state instead of an error.
 */
export async function fetchLatestReview(employeeUserId) {
  if (!employeeUserId) return { review: null, missingTable: false, error: null }

  const { data, error } = await supabase
    .from(REVIEWS_TABLE)
    .select(REVIEW_COLUMNS)
    .eq('employee_user_id', employeeUserId)
    .order('created_at', { ascending: false })
    .limit(1)

  if (error) {
    return { review: null, missingTable: isMissingTable(error), error: isMissingTable(error) ? null : error }
  }

  return { review: mapReviewRow((data || [])[0]), missingTable: false, error: null }
}

/**
 * Latest review for each of the given employees, as a Map keyed by user id.
 */
export async function fetchLatestReviewsFor(employeeUserIds = []) {
  const ids = employeeUserIds.filter(Boolean)
  if (!ids.length) return { reviews: new Map(), missingTable: false, error: null }

  const { data, error } = await supabase
    .from(REVIEWS_TABLE)
    .select(REVIEW_COLUMNS)
    .in('employee_user_id', ids)
    .order('created_at', { ascending: false })

  if (error) {
    return { reviews: new Map(), missingTable: isMissingTable(error), error: isMissingTable(error) ? null : error }
  }

  const reviews = new Map()
  ;(data || []).forEach((row) => {
    if (!reviews.has(row.employee_user_id)) {
      reviews.set(row.employee_user_id, mapReviewRow(row))
    }
  })

  return { reviews, missingTable: false, error: null }
}

/**
 * Save a review. A second submit for the same employee and rating period
 * updates the existing row instead of adding another one.
 */
export async function saveReview(record) {
  const payload = {
    employee_user_id: record.employeeUserId,
    employee_code: record.employeeCode || null,
    employee_name: record.employeeName || null,
    department: record.department || null,
    designation: record.designation || null,
    branch: record.branch || null,
    reviewer_user_id: record.reviewerUserId || null,
    reviewer_code: record.reviewerCode || null,
    reviewer_name: record.reviewerName || null,
    rating_period: record.ratingPeriod,
    ratings: record.ratings,
    average_rating: record.averageRating,
    status: record.status,
    retraining_required: record.retrainingRequired,
    retraining_parameters: record.retrainingParameters || [],
    remarks: record.remarks || null,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from(REVIEWS_TABLE)
    .upsert(payload, { onConflict: 'employee_user_id,rating_period' })
    .select(REVIEW_COLUMNS)
    .maybeSingle()

  if (error) {
    if (isMissingTable(error)) {
      return {
        review: null,
        error: 'Reviews table is missing. Run the migration supabase/migrations/20260910000100_create_skill_matrix_reviews.sql first.',
      }
    }
    return { review: null, error: error.message || 'Failed to save the review' }
  }

  return { review: mapReviewRow(data), error: null }
}
