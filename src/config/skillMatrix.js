// ============================================
// Skill Matrix Configuration
// ============================================
// Shared rating parameters and helpers used by
// the Skill Matrix screen and the review form.
// ============================================

// Parameters the reporting manager rates (1 - 5 each).
// icon and description are only for display; edit the wording here in one place.
export const SKILL_PARAMETERS = [
  {
    key: 'productKnowledge',
    label: 'Product Knowledge',
    icon: 'fa-box',
    description: 'Understanding of the product range and its features.',
  },
  {
    key: 'leadConversion',
    label: 'Lead Conversion',
    icon: 'fa-users',
    description: 'Turning leads into closed business.',
  },
  {
    key: 'dmiUpgradation',
    label: 'DMI Upgradation',
    icon: 'fa-arrow-trend-up',
    description: 'Moving DMIs up to the next level.',
  },
  {
    key: 'siteWorking',
    label: 'Site Working',
    icon: 'fa-location-dot',
    description: 'Work done at sites and with site contacts.',
  },
  {
    key: 'loyaltyAwareness',
    label: 'Awareness of Loyalty Programme',
    icon: 'fa-award',
    description: 'Knowledge of loyalty programme rules and process.',
  },
  {
    key: 'sfaApp',
    label: 'SFA APP',
    icon: 'fa-mobile-screen',
    description: 'Regular and correct use of the SFA app.',
  },
  {
    key: 'complaintHandling',
    label: 'Complaint Handling',
    icon: 'fa-headset',
    description: 'Handling customer complaints on time.',
  },
  {
    key: 'marketKnowledge',
    label: 'Market Knowledge',
    icon: 'fa-chart-simple',
    description: 'Understanding of the market and the territory.',
  },
  {
    key: 'competitorKnowledge',
    label: 'Competitor Knowledge',
    icon: 'fa-binoculars',
    description: 'Awareness of competitors and their offerings.',
  },
  {
    key: 'dmiManagement',
    label: 'DMI Management',
    icon: 'fa-gear',
    description: 'Day to day handling of DMIs.',
  },
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

// Date and time together, for a review history entry ("11 Sept 2026, 4:32 pm")
export const formatDateTime = (dateText) => {
  if (!dateText) return '-'
  const parsed = new Date(dateText)
  if (Number.isNaN(parsed.getTime())) return dateText
  const datePart = parsed.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  const timePart = parsed.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })
  return `${datePart}, ${timePart}`
}

// "YYYY-MM" rating period as a readable label ("July 2026")
export const formatRatingPeriod = (period) => {
  if (!period) return '-'
  const [year, month] = period.split('-').map(Number)
  if (!year || !month) return period
  const parsed = new Date(year, month - 1, 1)
  if (Number.isNaN(parsed.getTime())) return period
  return parsed.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
}
