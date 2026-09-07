# Setup Database Webhook for Notifications

## The CORS Error is Fixed! ✅

The edge function now has proper CORS headers and the Notifications screen no longer calls it directly.

## How It Should Work

1. Admin creates notification → Inserted into `notifications` table
2. **Database webhook** automatically triggers → Calls `send-notification` edge function
3. Function sends notification via FCM
4. Updates notification status in database

## Setup the Database Webhook

### Step 1: Go to Supabase Dashboard

1. Open your project: https://supabase.com/dashboard/project/yuqeafhejdawshsmrebn
2. Navigate to **Database** → **Webhooks**

### Step 2: Create New Webhook

Click "Create a new hook" and configure:

- **Name**: `send-notification-trigger`
- **Table**: `notifications`
- **Events**: Check **INSERT** only
- **Type**: Select **HTTP Request**
- **Method**: POST
- **URL**: `https://yuqeafhejdawshsmrebn.supabase.co/functions/v1/send-notification`
- **HTTP Headers**: 
  ```
  Content-Type: application/json
  Authorization: Bearer YOUR_ANON_KEY_HERE
  ```
  (Get your anon key from Project Settings → API)

### Step 3: Webhook Payload

The payload will automatically be:
```json
{
  "type": "INSERT",
  "table": "notifications",
  "record": {
    "id": "...",
    "title": "...",
    "body": "...",
    "user_id": "...",
    "data": {...}
  }
}
```

### Step 4: Test It

1. Go to your admin panel notifications screen
2. Send a test notification
3. Check Database → Webhooks → View logs
4. Check Functions → send-notification → Logs
5. The notification should be sent automatically!

## Troubleshooting

If notifications still don't send:

1. **Check webhook is enabled**: Database → Webhooks → verify status is "Active"
2. **Check webhook logs**: See if the webhook is triggering
3. **Check function logs**: `supabase functions logs send-notification`
4. **Verify FCM secrets are set correctly**:
   ```bash
   supabase secrets list
   ```

## Alternative: Use Supabase Trigger (Recommended)

Instead of HTTP webhook, you can use a database trigger:

```sql
-- This will be more reliable and faster
CREATE OR REPLACE FUNCTION trigger_send_notification()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://yuqeafhejdawshsmrebn.supabase.co/functions/v1/send-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
    ),
    body := jsonb_build_object(
      'type', 'INSERT',
      'table', 'notifications',
      'record', row_to_json(NEW)
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_notification_created
AFTER INSERT ON notifications
FOR EACH ROW
EXECUTE FUNCTION trigger_send_notification();
```

Run this in SQL Editor for automatic triggering!
