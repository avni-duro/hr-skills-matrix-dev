# Global Notification System Implementation Guide

The admin panel now uses a modern premium notification/toast system instead of browser alerts.

## How to Use

### 1. Import the hook in your component:
```jsx
import { useNotification } from '../contexts/NotificationContext'
```

### 2. Get the showNotification function:
```jsx
function MyComponent() {
  const { showNotification } = useNotification()
  // ...
}
```

### 3. Replace alerts with notifications:

**Before (old way):**
```jsx
alert('User created successfully!')
alert('Error: Something went wrong')
```

**After (new way):**
```jsx
showNotification('User created successfully!', 'success')
showNotification('Error: Something went wrong', 'error')
```

## Notification Types

- `'success'` - Green gradient, check icon (default)
- `'error'` - Red gradient, exclamation icon
- `'info'` - Blue gradient, info icon
- `'warning'` - Orange gradient, warning icon

## Duration

Notifications auto-dismiss after 3.5 seconds. You can customize:
```jsx
showNotification('Message here', 'warning', 5000) // 5 seconds
```

## Files to Update (Priority Order)

### High Priority (Most Alerts)
- [ ] src/screens/Users.jsx (15+ alerts)
- [ ] src/screens/AssignModules.jsx (17+ alerts)
- [ ] src/screens/AssignPerformanceDashboard.jsx (10+ alerts)

### Medium Priority
- [ ] src/screens/CategoryAccess.jsx (5 alerts)
- [ ] src/screens/Assessments.jsx (2 alerts)
- [ ] src/screens/AdminPermissions.jsx (1 alert)

### Lower Priority
- [ ] src/screens/ExcelUpload.jsx (2 alerts)
- [ ] src/screens/SalesDataDownload.jsx (2 alerts)
- [ ] src/screens/Banners.jsx (9 alerts)
- [ ] src/components/SalesDataScreen.jsx (1 alert)

## Already Updated
- ✅ src/screens/PerformanceBranchAccess.jsx (now uses notification system)

## Setup Already Complete
- ✅ NotificationContext created in src/contexts/NotificationContext.jsx
- ✅ App.jsx wrapped with NotificationProvider
- ✅ Global notification CSS added to App.css
- ✅ Notifications container displays at top-right of screen
