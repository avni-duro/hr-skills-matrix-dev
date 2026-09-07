# Fix FCM Environment Variables

## The Issue
The FCM_PROJECT_ID has extra spaces causing "PERMISSION_DENIED" error.
Error shows: `" duroacademy"` instead of `"duroacademy"`

## Solution

Run these commands to update your Supabase secrets (make sure to remove any extra spaces):

```bash
# Update FCM Project ID (remove any spaces)
supabase secrets set FCM_PROJECT_ID=duroacademy

# Verify other secrets don't have spaces
supabase secrets set FCM_CLIENT_EMAIL=your-client-email@duroacademy.iam.gserviceaccount.com

# Update private key (ensure no extra spaces at start/end)
supabase secrets set FCM_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----
YOUR_ACTUAL_PRIVATE_KEY_CONTENT_HERE
-----END PRIVATE KEY-----"
```

## Verify Secrets

After updating, check the function logs:
```bash
supabase functions logs send-notification
```

## Test Again

1. Send a test notification from the admin panel
2. Check if the notification is received on the mobile app
3. Monitor the logs for any errors

## Important Notes

- Make sure there are NO spaces before or after the project ID
- The project ID should match exactly what's in your Firebase Console
- The function has been updated to automatically trim whitespace from all environment variables
