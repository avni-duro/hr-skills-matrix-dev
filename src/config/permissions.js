// ============================================
// Role-Based Permission Configuration
// ============================================
// This file controls which screens each role
// can access in the admin panel.
// 
// To modify admin access, edit the ROLE_PERMISSIONS
// object below. super_admin always has full access.
// ============================================

// Screen keys used for permission checks
export const SCREENS = {
  DASHBOARD: 'dashboard',
  MODULES: 'modules',
  VIDEOS: 'videos',
  MODULE_REQUESTS: 'module-requests',
  USERS: 'users',
  BANNERS: 'banners',
  FEEDBACKS: 'feedbacks',
  NOTIFICATIONS: 'notifications',
  ASSESSMENTS: 'assessments',
  QUIZ_BUILDER: 'quiz-builder',
  ASSIGNMENT_RESULTS: 'assignment-results',
  VIDEO_PROGRESS: 'video-progress',
  ACTIVE_LOGINS: 'active-logins',
  VIDEO_PROGRESS_SCHEDULER: 'video-progress-scheduler',
  ORG_CHART: 'org-chart',
  MASTER_DATA: 'master-data',
  ASSIGN_MODULES: 'assign-modules',
  ASSIGN_PERFORMANCE_DASHBOARD: 'assign-performance-dashboard',
  PERFORMANCE_DASHBOARD: 'performance-dashboard',
  ASM_PERFORMANCE_DASHBOARD: 'asm-performance-dashboard',
  PERFORMANCE_BRANCH_ACCESS: 'performance-branch-access',
  CATEGORY_ACCESS: 'category-access',
  ANALYTICS: 'analytics',
  SETTINGS: 'settings',
  ADMIN_PERMISSIONS: 'admin-permissions',
  EXCEL_UPLOAD: 'excel-upload',
  SALES_DATA_DOWNLOAD: 'sales-data-download',
  PERFORMANCE_MASTER: 'performance-master',
  GOAL_MASTER: 'goal-master',
  INFLUENCER_CLAIM: 'influencer-claim',
  INFLUENCER_ENROLLMENT: 'influencer-enrollment',
  INFLUENCER_VISIT: 'influencer-visit',
  LEAD_DETAILS: 'lead-details',
  LEAD_TASK: 'lead-task',
  MASTER_ENROLLMENT: 'master-enrollment',
  HOLIDAY: 'holiday',
  ONROLL_OFFROLE: 'onroll-offrole',
}

// Allowed roles that can access the admin panel
export const ALLOWED_ROLES = ['admin', 'super_admin']

// Role-based screen access permissions
// 'all' = access to every screen (super_admin)
// Array  = access only to listed screens (admin)
//
// To give admin access to more screens, simply add
// the screen key to the admin array below.
export const ROLE_PERMISSIONS = {
  super_admin: 'all',
  admin: [
    SCREENS.DASHBOARD,
    SCREENS.MODULES,
    SCREENS.VIDEOS,
    SCREENS.MODULE_REQUESTS,
    SCREENS.BANNERS,
    SCREENS.FEEDBACKS,
    SCREENS.NOTIFICATIONS,
    SCREENS.ASSESSMENTS,
    SCREENS.QUIZ_BUILDER,
    SCREENS.ASSIGNMENT_RESULTS,
    SCREENS.VIDEO_PROGRESS,
    SCREENS.ASSIGN_MODULES,
    SCREENS.VIDEO_PROGRESS_SCHEDULER,
    SCREENS.ORG_CHART,
    SCREENS.MASTER_DATA,
    SCREENS.ASSIGN_PERFORMANCE_DASHBOARD,
    SCREENS.PERFORMANCE_DASHBOARD,
    SCREENS.ASM_PERFORMANCE_DASHBOARD,
    SCREENS.PERFORMANCE_BRANCH_ACCESS,
    SCREENS.CATEGORY_ACCESS,
    SCREENS.EXCEL_UPLOAD,
    SCREENS.SALES_DATA_DOWNLOAD,
    SCREENS.PERFORMANCE_MASTER,
    SCREENS.GOAL_MASTER,
    SCREENS.INFLUENCER_CLAIM,
    SCREENS.INFLUENCER_ENROLLMENT,
    SCREENS.INFLUENCER_VISIT,
    SCREENS.LEAD_DETAILS,
    SCREENS.LEAD_TASK,
    SCREENS.MASTER_ENROLLMENT,
    SCREENS.HOLIDAY,
    SCREENS.ONROLL_OFFROLE,
  ],
}

// Sidebar navigation items configuration
// Each item maps a route path to a screen permission key
// Order here = order in the sidebar
export const NAV_ITEMS = [
  { path: '/dashboard', label: 'Dashboard', icon: 'fa-solid fa-chart-pie', screen: SCREENS.DASHBOARD },
  { path: '/modules', label: 'Modules', icon: 'fa-solid fa-puzzle-piece', screen: SCREENS.MODULES },
  { path: '/videos', label: 'Videos', icon: 'fa-solid fa-video', screen: SCREENS.VIDEOS },
  { path: '/module-requests', label: 'Module Requests', icon: 'fa-solid fa-user-check', screen: SCREENS.MODULE_REQUESTS },
  { path: '/users', label: 'Users', icon: 'fa-solid fa-users', screen: SCREENS.USERS },
  { path: '/banners', label: 'Banners', icon: 'fa-solid fa-image', screen: SCREENS.BANNERS },
  { path: '/feedbacks', label: 'Feedback', icon: 'fa-solid fa-comment-dots', screen: SCREENS.FEEDBACKS },
  { path: '/notifications', label: 'Notifications', icon: 'fa-regular fa-bell', screen: SCREENS.NOTIFICATIONS },
  { path: '/assessments', label: 'Assessments', icon: 'fa-solid fa-clipboard-question', screen: SCREENS.ASSESSMENTS },
  { path: '/assignment-results', label: 'Assignment Results', icon: 'fa-solid fa-clipboard-list', screen: SCREENS.ASSIGNMENT_RESULTS },
  { path: '/video-progress', label: 'Video Progress', icon: 'fa-solid fa-play-circle', screen: SCREENS.VIDEO_PROGRESS },
  { path: '/video-progress-scheduler', label: 'Video Progress Scheduler', icon: 'fa-solid fa-clock', screen: SCREENS.VIDEO_PROGRESS_SCHEDULER },
  { path: '/org-chart', label: 'Org Chart', icon: 'fa-solid fa-diagram-project', screen: SCREENS.ORG_CHART },
  { path: '/master-data', label: 'Master Data', icon: 'fa-solid fa-table-list', screen: SCREENS.MASTER_DATA },
  { path: '/active-logins', label: 'Active Logins', icon: 'fa-solid fa-right-to-bracket', screen: SCREENS.ACTIVE_LOGINS },
  { path: '/assign-modules', label: 'Assign Modules', icon: 'fa-solid fa-tasks', screen: SCREENS.ASSIGN_MODULES },
  { path: '/assign-performance-dashboard', label: 'Assign Performance', icon: 'fa-solid fa-chart-bar', screen: SCREENS.ASSIGN_PERFORMANCE_DASHBOARD },
  { path: '/performance-dashboard', label: 'DURO Lakshya Dashboard', icon: 'fa-solid fa-chart-bar', screen: SCREENS.PERFORMANCE_DASHBOARD },
  { path: '/asm-performance-dashboard', label: 'DURO Lakshya Dashboard ASM', icon: 'fa-solid fa-users-viewfinder', screen: SCREENS.ASM_PERFORMANCE_DASHBOARD },
  { path: '/performance-branch-access', label: 'Branch Access', icon: 'fa-solid fa-sitemap', screen: SCREENS.PERFORMANCE_BRANCH_ACCESS },
  { path: '/category-access', label: 'Category Access', icon: 'fa-solid fa-layer-group', screen: SCREENS.CATEGORY_ACCESS },
  { path: '/admin-permissions', label: 'Admin Permissions', icon: 'fa-solid fa-shield-halved', screen: SCREENS.ADMIN_PERMISSIONS },
  { path: '/analytics', label: 'Analytics', icon: 'fa-solid fa-chart-line', screen: SCREENS.ANALYTICS },
  { path: '/excel-upload', label: 'Sales Data Upload', icon: 'fa-solid fa-file-excel', screen: SCREENS.EXCEL_UPLOAD },
  { path: '/sales-data-download', label: 'Sales Data Download', icon: 'fa-solid fa-file-arrow-down', screen: SCREENS.SALES_DATA_DOWNLOAD },
  { path: '/performance-master', label: 'Performance Master', icon: 'fa-solid fa-database', screen: SCREENS.PERFORMANCE_MASTER },
  { path: '/goal-master', label: 'Goal Master', icon: 'fa-solid fa-bullseye', screen: SCREENS.GOAL_MASTER },
  { path: '/holiday', label: 'Holiday Calendar', icon: 'fa-solid fa-calendar-days', screen: SCREENS.HOLIDAY },
  { path: '/onroll-offrole', label: 'Onroll-Offrole', icon: 'fa-solid fa-id-card-clip', screen: SCREENS.ONROLL_OFFROLE },
]

export const NAV_ITEM_BY_SCREEN = NAV_ITEMS.reduce((accumulator, item) => {
  accumulator[item.screen] = item.path
  return accumulator
}, {})

export const getRouteForScreen = (screenKey) => {
  return NAV_ITEM_BY_SCREEN[screenKey] || '/dashboard'
}

export const getDefaultRouteForScreens = (screenKeys, role = 'admin') => {
  if (role === 'super_admin') return '/dashboard'

  const screens = Array.isArray(screenKeys) ? screenKeys.filter(Boolean) : []
  if (screens.length === 1) {
    return getRouteForScreen(screens[0])
  }

  if (screens.includes(SCREENS.DASHBOARD)) {
    return '/dashboard'
  }

  const firstAccessible = NAV_ITEMS.find(item => screens.includes(item.screen))
  return firstAccessible ? firstAccessible.path : '/dashboard'
}
