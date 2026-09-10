// ============================================
// Skill Matrix Configuration
// ============================================
// Shared rating parameters and helpers used by
// the Skill Matrix screen and the review form.
// ============================================

// Parameters the reporting manager rates (1 - 5 each)
export const SKILL_PARAMETERS = [
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

export const RATING_SCALE = [1, 2, 3, 4, 5]

// At or above this the employee is Good, below it retraining is due
export const PASS_MARK = 3

export const scoreClass = (score) => {
  if (score >= 4) return 'strong'
  if (score >= PASS_MARK) return 'meets'
  return 'below'
}

export const averageOf = (ratings) => {
  const values = SKILL_PARAMETERS
    .map(parameter => Number(ratings?.[parameter.key]) || 0)
    .filter(value => value > 0)
  if (!values.length) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export const initialsOf = (name) => (name || '')
  .split(' ')
  .filter(Boolean)
  .slice(0, 2)
  .map(part => part[0]?.toUpperCase())
  .join('') || 'U'

export const formatDate = (dateText) => {
  if (!dateText) return '-'
  const parsed = new Date(dateText)
  if (Number.isNaN(parsed.getTime())) return dateText
  return parsed.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}
