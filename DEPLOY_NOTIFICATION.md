# Send Notification Function - Deployment Guide

## Quick Deploy

```bash
# Navigate to project directory
cd "d:\DuroAcademy Admin Pannel\duroacademy-admin-pannel"

# Deploy the function
supabase functions deploy send-notification --no-verify-jwt
```

## Configure Environment Variables

You need to set up Firebase Cloud Messaging credentials:

```bash
# Set FCM Project ID
supabase secrets set FCM_PROJECT_ID=your-firebase-project-id

# Set FCM Client Email (from Firebase service account)
supabase secrets set FCM_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com

# Set FCM Private Key (replace \n with actual newlines)
supabase secrets set FCM_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY_HERE\n-----END PRIVATE KEY-----"

# SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are automatically set
```

## Database Schema Setup

Create the required tables:

```sql
-- Create user_device_tokens table
CREATE TABLE IF NOT EXISTS user_device_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  fcm_token TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_device_tokens_user_id 
ON user_device_tokens(user_id);

CREATE INDEX IF NOT EXISTS idx_user_device_tokens_fcm_token 
ON user_device_tokens(fcm_token);

-- Update notifications table structure
ALTER TABLE notifications 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS error_message TEXT;
```

## How It Works

This function uses **Database Webhooks** triggered on INSERT to the notifications table:

1. Admin creates notification → Inserted into `notifications` table
2. Database webhook triggers send-notification function
3. Function fetches user's device tokens from `user_device_tokens` table
4. Generates OAuth2 access token using service account JWT
5. Sends notification via FCM v1 API
6. Updates notification status (sent/error)

## Setup Database Webhook

Go to Supabase Dashboard > Database > Webhooks and create:

- **Name**: send-notification-webhook
- **Table**: notifications
- **Events**: INSERT
- **Type**: Edge Function
- **Edge Function**: send-notification

## Test the Function

1. Add an FCM token to a test user:
   ```sql
   INSERT INTO user_device_tokens (user_id, fcm_token)
   VALUES ('user-uuid-here', 'test-fcm-token');
   ```

2. Send a notification from the admin panel

3. Check function logs:
   ```bash
   supabase functions logs send-notification
   ```

## Features

✅ **RS256 JWT Signing**: Fully implemented using Web Crypto API
✅ **OAuth2 Token Generation**: Automatic access token generation
✅ **Multi-device Support**: Uses `user_device_tokens` table for multiple devices per user
✅ **Broadcast Support**: Can send to all users if `user_id` is null
✅ **Data Flattening**: Automatically converts all data values to strings for FCM
✅ **Status Tracking**: Updates notification status in database

## Firebase Console Setup

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Go to Project Settings > Service Accounts
4. Click "Generate New Private Key"
5. Download the JSON file
6. Extract the values:
   - `project_id` → FCM_PROJECT_ID
   - `client_email` → FCM_CLIENT_EMAIL
   - `private_key` → FCM_PRIVATE_KEY
