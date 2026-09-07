# Video Progress Report Scheduler - Implementation Guide

## Overview
The Video Progress Report Scheduler allows admins to create automated email schedules for sending video progress reports to designated recipients. Reports can be scheduled daily, weekly, or monthly with customizable send times and target users.

---

## Features

### 1. **Flexible Scheduling**
- **Daily**: Reports sent every day at a specified time
- **Weekly**: Reports sent on selected days of the week
- **Monthly**: Reports sent on a specific day of the month

### 2. **Customizable Report Content**
- User name and email
- Total videos watched
- Completed videos count
- Average progress percentage
- Detailed video list with individual progress bars
- Status indicators (In Progress / Completed)
- Last watched timestamps
- Branch filtering (optional)

### 3. **Email Management**
- Multiple recipient support (comma-separated emails)
- Professional HTML formatted emails
- Automatic scheduling based on frequency
- Prevent duplicate sends within time period

### 4. **Admin Controls**
- Create, edit, and delete schedules
- Enable/disable schedules without deletion
- View schedule history (last sent, next scheduled)
- Branch-specific filtering
- Bulk schedule management

---

## Database Schema

### Table: `video_progress_report_schedules`

```sql
Columns:
- id (UUID)                    - Primary key
- created_by (UUID)            - Admin who created the schedule
- target_user_id (UUID)        - User whose video progress to report
- frequency (VARCHAR)          - 'daily', 'weekly', or 'monthly'
- schedule_days (VARCHAR)      - Days to send (varies by frequency)
- send_time (TIME)             - Time of day to send (HH:MM)
- recipient_emails (TEXT)      - Comma-separated recipient emails
- branch_id (UUID)             - Optional branch filter
- is_active (BOOLEAN)          - Enable/disable schedule
- last_sent_at (TIMESTAMP)     - When report was last sent
- next_send_at (TIMESTAMP)     - When next report will be sent
- created_at (TIMESTAMP)       - Record creation time
- updated_at (TIMESTAMP)       - Last modification time
```

### Indexes
- `idx_video_progress_schedules_created_by` - For admin queries
- `idx_video_progress_schedules_target_user` - For user lookups
- `idx_video_progress_schedules_active` - For filtering active schedules
- `idx_video_progress_schedules_next_send` - For scheduler queries

### Row Level Security (RLS)
- **Super Admins**: Can view and manage all schedules
- **Regular Admins**: Can only view and manage their own schedules
- **Insert**: Only admins can create schedules
- **Update**: Only admins can update their own schedules
- **Delete**: Only admins can delete their own schedules

---

## UI Components

### VideoProgressScheduler Screen Location
- **Route**: `/video-progress-scheduler`
- **Menu**: "Video Progress Scheduler" under main navigation
- **Access**: Admins and Super Admins only

### Screen Layout

#### Header Section
- Screen title
- "New Schedule" button

#### Form Section (Create/Edit)
**Form Fields:**
1. **Target User** (Required)
   - Dropdown of active users
   - Shows user name and email
   - Formatted: "Full Name (email@example.com)"

2. **Frequency** (Required)
   - Daily
   - Weekly (shows day picker)
   - Monthly (shows day selector)

3. **Schedule Days** (Required if Weekly/Monthly)
   - Weekly: Checkboxes for Mon-Sun
   - Monthly: Number input (1-31)

4. **Send Time** (Required)
   - Time picker (HH:MM format)
   - Default: 09:00

5. **Recipient Emails** (Required)
   - Textarea for comma-separated emails
   - Example: "email1@example.com, email2@example.com"
   - Email validation on submit

6. **Branch Filter** (Optional)
   - Dropdown of available branches
   - Leave empty for all branches

7. **Active Status** (Checked by default)
   - Toggle to enable/disable schedule

#### Schedules List
**Schedule Cards Display:**
- User name and active/inactive status badge
- Report details (user name, schedule, recipients)
- Branch information (if set)
- Timestamps (created by, date, last sent, next scheduled)
- Edit and Delete action buttons

---

## Supabase Edge Function

### Function: `send_video_progress_reports`
**Location**: `/supabase/functions/send_video_progress_reports/index.ts`

### How It Works

1. **Triggering** (Should be called via cron job)
   ```bash
   curl -X POST https://your-project.supabase.co/functions/v1/send_video_progress_reports \
     -H "Authorization: Bearer YOUR_ANON_KEY"
   ```

2. **Processing Steps**
   - Fetch all active schedules
   - Check which schedules should send based on:
     - Current time matches scheduled time window (±5 minutes)
     - Frequency requirements met (daily/weekly/monthly)
     - Schedule hasn't been sent yet today/this week/this month
   - Generate HTML report for each schedule
   - Send emails to recipients
   - Update `last_sent_at` and `next_send_at` timestamps

3. **Email Service Configuration**
   - **Default**: Resend (ResendEmail service)
   - **Environment Variables Required**:
     ```
     EMAIL_SERVICE=resend
     RESEND_API_KEY=your_resend_api_key
     ```
   - **Note**: Can be modified to use any email service (SendGrid, AWS SES, etc.)

### Response Format
```json
{
  "success": true,
  "sentReports": 5,
  "failedReports": 0,
  "details": {
    "sent": [
      {
        "scheduleId": "uuid",
        "targetUser": "uuid",
        "recipients": ["email@example.com"]
      }
    ],
    "failed": []
  }
}
```

---

## Setup Instructions

### 1. Deploy Database Migration
```bash
# Run from project root
supabase migration up
# Or manually run the migration:
# supabase/migrations/20260706000100_create_video_progress_report_schedule.sql
```

### 2. Deploy Supabase Function
```bash
# Deploy the Edge Function
supabase functions deploy send_video_progress_reports

# Set environment variables
supabase secrets set EMAIL_SERVICE=resend
supabase secrets set RESEND_API_KEY=your_resend_api_key
```

### 3. Configure Cron Job (Production)
**Option A: Supabase Cron Extension**
```sql
-- Create cron job to run daily at specific times
SELECT cron.schedule(
  'send-video-progress-reports',
  '0 9 * * *', -- Every day at 9:00 AM (UTC)
  'SELECT http_post(''https://your-project.supabase.co/functions/v1/send_video_progress_reports'', ''{}'')'
);
```

**Option B: External Scheduler (GitHub Actions, Vercel Cron, etc.)**
```yaml
# GitHub Actions example (.github/workflows/schedule-reports.yml)
name: Send Video Progress Reports
on:
  schedule:
    - cron: '0 9 * * *'  # Daily at 9 AM UTC
jobs:
  send-reports:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger report sending
        run: |
          curl -X POST ${{ secrets.SUPABASE_FUNCTION_URL }} \
            -H "Authorization: Bearer ${{ secrets.SUPABASE_ANON_KEY }}"
```

### 4. Update Permissions (Already Done)
- `VIDEO_PROGRESS_SCHEDULER` screen added to admin permissions
- Route configured in `App.jsx`
- Navigation item added to sidebar

---

## Usage Workflow

### For Admin Users

1. **Navigate** to "Video Progress Scheduler" in the sidebar
2. **Click** "+ New Schedule" button
3. **Fill in** the form:
   - Select target user
   - Choose frequency and schedule days/time
   - Enter recipient emails
   - Optionally select branch filter
4. **Submit** to create schedule

### Editing Existing Schedule
1. Click the **"Edit"** button on any schedule card
2. Modify desired fields
3. Click **"Update Schedule"**

### Deleting a Schedule
1. Click **"Delete"** button on schedule card
2. Confirm deletion in popup

### Disabling Without Deletion
1. Click **"Edit"** on schedule card
2. Uncheck the **"Active"** checkbox
3. Click **"Update Schedule"**

---

## Email Report Format

### Email Components

**Header Section**
- Logo/branding
- Title: "📊 Video Progress Report"
- User name and date

**Statistics Cards**
- Total Videos
- Completed Videos
- Average Progress %

**Video List**
- Video title
- Progress bar (visual)
- Progress percentage
- Status badge (Completed/In Progress)

**Footer**
- Generation timestamp
- Disclaimer: "Automated report from DURO Academy Admin Panel"

### Design Features
- Responsive HTML (works on all email clients)
- Gradient header with branding colors
- Color-coded status indicators
- Professional typography and spacing
- Mobile-friendly layout

---

## Example Scenarios

### Daily Morning Report
- **Frequency**: Daily
- **Time**: 09:00 AM
- **Recipients**: manager@company.com, supervisor@company.com
- **Result**: Report sent every morning showing that user's progress

### Weekly Performance Review
- **Frequency**: Weekly
- **Days**: Monday
- **Time**: 08:00 AM
- **Recipients**: admin@company.com
- **Result**: Weekly review every Monday morning

### Monthly Consolidated Report
- **Frequency**: Monthly
- **Day**: 1st (of each month)
- **Time**: 10:00 AM
- **Recipients**: ceo@company.com, head@company.com
- **Result**: Month-end consolidated report on 1st of each month

---

## Error Handling

### Common Issues

1. **Email Not Sending**
   - Check `RESEND_API_KEY` is set correctly
   - Verify recipient email formats are valid
   - Check email service status

2. **Schedule Not Running**
   - Verify cron job is configured
   - Check edge function URL is correct
   - Review edge function logs in Supabase dashboard

3. **Incorrect Time Zone**
   - Edge function uses server time
   - Ensure send_time is in desired timezone
   - Consider UTC offset for scheduling

### Debug Information
- All edge function logs are available in Supabase Dashboard
- Check `last_sent_at` and `next_send_at` timestamps
- Review schedule details in database directly

---

## Performance Considerations

1. **Query Optimization**
   - Indexes on `created_by`, `target_user_id`, `is_active`, `next_send_at`
   - Filter by `is_active = true` before processing

2. **Email Rate Limiting**
   - Stagger scheduled sends across time windows
   - Monitor email service rate limits
   - Implement exponential backoff for failures

3. **Scalability**
   - Pagination for large schedule lists in UI
   - Batch processing for edge function (limit 50 concurrent reports)
   - Cache generated reports temporarily if many recipients

---

## Future Enhancements

Potential improvements for future versions:

1. **Report Customization**
   - Select specific videos/modules
   - Custom metric selection
   - Threshold alerts (e.g., alert if progress < 50%)

2. **Distribution Methods**
   - SMS notifications
   - In-app notifications
   - Slack integration

3. **Advanced Scheduling**
   - Time zone support
   - Holiday exclusions
   - Conditional sending (only if progress changed)

4. **Analytics**
   - Delivery success rates
   - Email open tracking
   - Click-through analytics

---

## Support

For issues or questions:
1. Check Supabase function logs
2. Review email service configuration
3. Verify RLS policies are correctly applied
4. Check user permissions and access_type column

---

**Last Updated**: July 6, 2026  
**Version**: 1.0  
**Status**: Production Ready
