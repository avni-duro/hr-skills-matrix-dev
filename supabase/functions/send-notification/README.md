# Send Notification Edge Function Setup

This edge function sends push notifications to users via Firebase Cloud Messaging (FCM).

## Prerequisites

1. **Firebase Project Setup**
   - Create a Firebase project in the [Firebase Console](https://console.firebase.google.com/)
   - Enable Cloud Messaging
   - Download the service account key JSON file:
     - Go to Project Settings > Service Accounts
     - Click "Generate New Private Key"
     - Save the JSON file securely

2. **Database Requirements**
   - `users` table must have an `fcm_token` column to store device tokens
   - `notifications` table structure:
     ```sql
     CREATE TABLE notifications (
       id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
       title TEXT NOT NULL,
       body TEXT NOT NULL,
       user_id UUID REFERENCES users(id),
       status TEXT DEFAULT 'pending', -- pending, sent, error
       data JSONB,
       sent_at TIMESTAMPTZ,
       error_message TEXT,
       created_at TIMESTAMPTZ DEFAULT NOW()
     );
     ```

## Environment Variables

Set these in your Supabase project:

```bash
# Your Firebase project ID (from Firebase Console)
FCM_PROJECT_ID=your-project-id

# Service account key as a JSON string
FCM_SERVICE_ACCOUNT_KEY='{"type":"service_account","project_id":"...","private_key_id":"...","private_key":"...","client_email":"...","client_id":"...","auth_uri":"...","token_uri":"...","auth_provider_x509_cert_url":"...","client_x509_cert_url":"..."}'
```

## Deployment

```bash
# Deploy the function
supabase functions deploy send-notification --no-verify-jwt

# Set environment variables
supabase secrets set FCM_PROJECT_ID=your-project-id
supabase secrets set FCM_SERVICE_ACCOUNT_KEY='{"type":"service_account",...}'
```

## Update the Function

Before deploying, update line 11 in `index.ts`:

```typescript
const FCM_ENDPOINT = 'https://fcm.googleapis.com/v1/projects/YOUR_PROJECT_ID/messages:send'
```

Replace `YOUR_PROJECT_ID` with your actual Firebase project ID.

## Usage

The function is automatically called when creating notifications from the admin panel. It:

1. Fetches the notification from the database
2. Gets the user's FCM token
3. Sends the notification via FCM
4. Updates the notification status (sent/error)

## Data Payload

The function properly flattens and converts all data values to strings as required by FCM. The `data` field in notifications table can contain:

```json
{
  "targetType": "single|multi|all",
  "userIds": ["uuid1", "uuid2", ...],
  "customField": "value"
}
```

All fields are automatically converted to strings before sending to FCM.

## Error Handling

- Missing FCM token: Status updated to 'error'
- FCM send failure: Error message stored in database
- The notification status is tracked in the `status` column

## Important Notes

1. **JWT Signing**: The current implementation has a placeholder for JWT signing. For production use, you need to implement proper RS256 JWT signing using the service account private key. Consider using a library like `djwt` for Deno.

2. **Alternative Approach**: Instead of generating access tokens on each request, you can:
   - Use Firebase Admin SDK (if available for Deno)
   - Pre-generate long-lived tokens and refresh them periodically
   - Use a separate service to handle FCM authentication

3. **Rate Limiting**: Implement rate limiting for production to avoid hitting FCM quotas

4. **Batch Sending**: For sending to multiple users, consider implementing batching to improve performance

## Testing

Test the function by:

1. Ensuring a user has an FCM token stored
2. Creating a notification from the admin panel
3. Checking the `status` and `sent_at` fields in the notifications table
4. Viewing logs: `supabase functions logs send-notification`
