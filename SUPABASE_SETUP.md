# DuroAcademy Admin Panel - Supabase Setup Instructions

## Overview
This guide covers setting up authentication and database tables for the DuroAcademy Admin Panel.

## Step 1: Enable Email Authentication in Supabase

1. Go to your Supabase Dashboard
2. Navigate to: **Authentication** → **Providers**
3. Make sure **Email** provider is enabled

## Step 2: Create Admin User

Run this SQL in your Supabase SQL Editor:

```sql
-- First, you need to create the user in Supabase Auth
-- This must be done through Supabase Dashboard or Auth API
-- Go to Authentication → Users → Add User
-- Email: admin@duroacademy.com (or your preferred email)
-- Password: (set a secure password)

-- Then, add the user to your users table with admin role
INSERT INTO users (id, full_name, email, employee_id, role, department)
VALUES (
  'paste-the-uuid-from-auth-users-here', -- Get this from Authentication → Users
  'Admin User',
  'admin@duroacademy.com', -- Same email as Auth user
  'ADMIN001',
  'admin',
  'Administration'
);
```

## Step 3: Disable Row Level Security (For Development)

Run this SQL in your Supabase SQL Editor:

```sql
-- Disable RLS on users table (for development)
ALTER TABLE users DISABLE ROW LEVEL SECURITY;

-- Disable RLS on categories table (for development)
ALTER TABLE categories DISABLE ROW LEVEL SECURITY;

-- Disable RLS on modules table (for development)
ALTER TABLE modules DISABLE ROW LEVEL SECURITY;

-- Disable RLS on videos table (for development)
ALTER TABLE videos DISABLE ROW LEVEL SECURITY;

-- Disable RLS on quizzes table (for development)
ALTER TABLE quizzes DISABLE ROW LEVEL SECURITY;

-- Disable RLS on questions table (for development)
ALTER TABLE questions DISABLE ROW LEVEL SECURITY;

-- Disable RLS on banners table (for development)
ALTER TABLE banners DISABLE ROW LEVEL SECURITY;
```

## Step 4: OR Enable RLS with Policies (For Production - Recommended)

If you want to use RLS (more secure), run this SQL instead:

```sql
-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Policy: Allow authenticated users to read all users
CREATE POLICY "Allow authenticated read access" ON users
  FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Allow authenticated users to insert users
CREATE POLICY "Allow authenticated insert access" ON users
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Policy: Allow authenticated users to update users
CREATE POLICY "Allow authenticated update access" ON users
  FOR UPDATE
  TO authenticated
  USING (true);

-- Policy: Allow authenticated users to delete users
CREATE POLICY "Allow authenticated delete access" ON users
  FOR DELETE
  TO authenticated
  USING (true);

-- Same for categories table
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated full access to categories" ON categories
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Same for modules table
ALTER TABLE modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated full access to modules" ON modules
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Same for videos table
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated full access to videos" ON videos
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Same for quizzes table
ALTER TABLE quizzes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated full access to quizzes" ON quizzes
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Same for questions table
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated full access to questions" ON questions
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Same for banners table
ALTER TABLE banners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated full access to banners" ON banners
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
```

## Step 5: Create Admin User Through Supabase Dashboard

### Option A: Using Supabase Dashboard
1. Go to **Authentication** → **Users**
2. Click **Add User**
3. Email: `admin@duroacademy.com`
4. Password: `YourSecurePassword123!`
5. Click **Create User**
6. Copy the User ID (UUID)

### Option B: Using SQL + Auth API
First create in Auth, then run:
```sql
-- Get the auth user ID first from Authentication → Users
-- Then insert into your users table
INSERT INTO users (id, full_name, email, employee_id, role, department, phone)
VALUES (
  '00000000-0000-0000-0000-000000000000', -- Replace with actual UUID from Auth
  'System Administrator',
  'admin@duroacademy.com',
  'ADMIN001',
  'admin',
  'Administration',
  '+1234567890'
)
ON CONFLICT (id) DO UPDATE
SET role = 'admin';
```

## Step 6: Test Login

1. Navigate to: `http://localhost:5173/login`
2. Enter your admin email and password
3. You should be redirected to the dashboard

## Security Notes

### For Development:
- It's OK to disable RLS temporarily
- Make sure your `.env` file is NOT committed to git

### For Production:
- Always use RLS with proper policies
- Use environment variables for sensitive data
- Consider adding rate limiting
- Add password reset functionality
- Enable email confirmation
- Add 2FA for admin account

## Troubleshooting

### "Invalid email or password"
- Check that the user exists in Authentication → Users
- Verify the password is correct
- Check browser console for detailed errors

### "User not found in database"
- Make sure you inserted the user into the `users` table
- Verify the email matches between Auth and users table

### "Access denied. Only admin users can access this panel"
- Check that the user's role is 'admin' in the users table
- Run: `SELECT * FROM users WHERE email = 'admin@duroacademy.com';`

### RLS Policy Issues
- Temporarily disable RLS to test
- Check Supabase logs for policy errors
- Verify you're using the correct anon key in `.env`

## Database Schema Reference

### Categories Table
```sql
-- Table: categories
-- Columns:
--   id (uuid, primary key, auto-generated)
--   name (text, required) - Category name
--   description (text, optional) - Category description
--   created_at (timestamp, auto-generated) - Creation timestamp

-- Sample data for categories:
INSERT INTO categories (name, description) VALUES
  ('Onboarding', 'New employee onboarding modules'),
  ('Sales Training', 'Sales skills and techniques'),
  ('Compliance', 'Regulatory and compliance training'),
  ('Product Knowledge', 'Product features and benefits'),
  ('Leadership', 'Leadership and management skills'),
  ('Technical Skills', 'Technical training and certifications');
```

### Modules Table
```sql
-- Table: modules
-- Columns:
--   id (uuid, primary key, auto-generated)
--   title (text, required) - The module title
--   description (text, optional) - Module description
--   category_id (uuid, optional) - Foreign key to categories.id
--   thumbnail_url (text, optional) - URL to thumbnail image
--   created_at (timestamp, auto-generated) - Creation timestamp

-- Foreign key relationship:
-- modules.category_id -> categories.id
```

### Videos Table
```sql
-- Table: videos
-- Columns:
--   id (uuid, primary key, auto-generated)
--   title (text, required) - Video title
--   description (text, optional) - Video description
--   module_id (uuid, required) - Foreign key to modules.id
--   duration (integer, optional) - Video duration in seconds
--   video_url (text, optional) - URL to the video file
--   thumbnail_url (text, optional) - URL to video thumbnail
--   status (text, optional) - Video status (Published, Draft, Processing, etc.)
--   quiz_id (uuid, optional) - Foreign key to quizzes.id (if linked)
--   created_at (timestamp, auto-generated) - Creation timestamp
--   updated_at (timestamp, auto-generated) - Last update timestamp

-- Foreign key relationships:
-- videos.module_id -> modules.id
-- videos.quiz_id -> quizzes.id (optional)
```

### Quizzes Table
```sql
-- Table: quizzes
-- Columns:
--   id (uuid, primary key, auto-generated)
--   title (text, required) - The quiz title
--   module_id (uuid, optional) - Foreign key to modules.id
--   video_id (uuid, required) - The video UUID this quiz is for
--   passing_score (integer, default 60) - Minimum score to pass (percentage)
--   created_at (timestamp, auto-generated) - Creation timestamp

-- Foreign key relationship:
-- quizzes.module_id -> modules.id
```

### Questions Table
```sql
-- Table: questions
-- Columns:
--   id (uuid, primary key, auto-generated)
--   quiz_id (uuid, optional) - Foreign key to quizzes.id
--   question_text (text, required) - The question text
--   options (jsonb, required) - Array of answer options as JSON
--   correct_option (text, required) - The correct answer text
--   created_at (timestamp, auto-generated) - Creation timestamp

-- Foreign key relationship:
-- questions.quiz_id -> quizzes.id

-- Example options JSONB format:
-- ["Option A text", "Option B text", "Option C text", "Option D text"]
```

### Banners Table
```sql
-- Table: banners
-- Columns:
--   id (uuid, primary key, auto-generated)
--   title (text, required) - Banner title/name
--   image_url (text, required) - URL to the banner image (stored in Supabase Storage)
--   redirect_type (text, required) - Type of redirect: 'video', 'module', or 'category'
--   redirect_id (uuid, optional) - Foreign key to the target entity (video_id, module_id, or category_id)
--   is_active (boolean, default true) - Whether banner is active/visible in mobile app
--   display_order (integer, default 0) - Order of display (lower numbers appear first)
--   created_at (timestamp, auto-generated) - Creation timestamp
--   updated_at (timestamp, auto-generated) - Last update timestamp

-- Foreign key relationships (conditional based on redirect_type):
-- banners.redirect_id -> videos.id (when redirect_type = 'video')
-- banners.redirect_id -> modules.id (when redirect_type = 'module')
-- banners.redirect_id -> categories.id (when redirect_type = 'category')

-- Create the table:
CREATE TABLE banners (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  image_url TEXT NOT NULL,
  redirect_type VARCHAR(50) NOT NULL CHECK (redirect_type IN ('video', 'module', 'category')),
  redirect_id UUID,
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Note: Foreign key constraints are not enforced due to conditional nature
-- You may add triggers or application-level validation if needed
```

### Supabase Storage Setup for Banner Images
```sql
-- Create storage bucket for banner images
-- Run this in Supabase Dashboard: Storage → Create Bucket
-- Bucket name: banner-images
-- Public bucket: Yes (so images are publicly accessible)

-- Or use SQL:
INSERT INTO storage.buckets (id, name, public) 
VALUES ('banner-images', 'banner-images', true);

-- Set up storage policies for banner-images bucket
CREATE POLICY "Allow authenticated uploads" ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'banner-images');

CREATE POLICY "Allow public read access" ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'banner-images');

CREATE POLICY "Allow authenticated updates" ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'banner-images');

CREATE POLICY "Allow authenticated deletes" ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'banner-images');
```

### Users Table
```sql
-- Table: users
-- Columns:
--   id (uuid, primary key, matches auth.users.id)
--   full_name (text, required)
--   email (text, required)
--   phone (text, optional)
--   department (text, optional)
--   role (text, required) - 'admin' for admin users
--   employee_id (text, required)
--   created_at (timestamp, auto-generated)
--   updated_at (timestamp, auto-generated)
```

#### RLS Policies for Admin Management
```sql
-- Enable RLS in production
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Allow admins (role='admin' in public.users) to manage all rows
CREATE POLICY admin_select_users ON public.users
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin'));

CREATE POLICY admin_insert_users ON public.users
FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin'));

CREATE POLICY admin_update_users ON public.users
FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin'));

CREATE POLICY admin_delete_users ON public.users
FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin'));

-- Optionally allow non-admins to read their own profile
CREATE POLICY user_select_own_profile ON public.users
FOR SELECT TO authenticated
USING (id = auth.uid());

-- Development convenience (do not use in production):
-- ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
```

Note: Deleting a row from `public.users` does not delete the account from `auth.users`. To remove an auth account, use a server-side function with the service role key:
```ts
// Example (Edge Function / server):
import { createClient } from '@supabase/supabase-js'
const supabaseAdmin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
await supabaseAdmin.auth.admin.deleteUser('<user_id>')
```

### Edge Function: create-user
Creates an auth user (using service role) then inserts a profile row into public.users.

**Features:**
- Creates auth account with email confirmation
- Inserts profile into public.users table
- Auto-generates password if not provided
- Handles cleanup if profile creation fails
- Returns generated password securely

**Deploy steps:**
1. Set environment variables in Supabase dashboard (Project Settings > Functions):
   - `SUPABASE_URL` - Your project URL
   - `SUPABASE_SERVICE_ROLE_KEY` - Service role key (never expose in frontend)

2. Deploy the function:
```bash
supabase functions deploy create-user --no-verify-jwt
```

3. Client invocation from admin panel:
```js
const { data, error } = await supabase.functions.invoke('create-user', {
  body: {
    email: 'user@example.com',
    password: 'optional-password', // Auto-generated if omitted
    full_name: 'John Doe',
    employee_id: 'EMP001',
    role: 'user', // 'user' | 'admin' | 'trainer'
    department: 'Sales', // optional
    phone: '+1234567890' // optional
  }
});

// Response includes:
// { success: true, user: {...}, generatedPassword: '...' }
```

**Security Notes:**
- Function runs with service role to bypass RLS
- Auto-confirms email for new users
- If password not provided, generates secure UUID password
- Cleans up auth user if profile insertion fails

### Feedback Table
```sql
-- Table: feedback
-- Columns:
--   id (uuid, primary key, auto-generated)
--   type (text, required) - 'module' or 'video'
--   content (text, required) - Feedback text body
--   created_at (timestamp with time zone, default now())
--   module_id (uuid, nullable) - FK to modules.id when type = 'module'
--   video_id (uuid, nullable) - FK to videos.id when type = 'video'
--   user_id (uuid, nullable) - FK to users.id (author of feedback)

CREATE TABLE IF NOT EXISTS feedback (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  type text NOT NULL CHECK (type IN ('module','video')),
  content text NOT NULL,
  created_at timestamptz DEFAULT now(),
  module_id uuid REFERENCES modules(id) ON DELETE SET NULL,
  video_id uuid REFERENCES videos(id) ON DELETE SET NULL,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL
);

-- Disable RLS for development OR enable with policy below
ALTER TABLE feedback DISABLE ROW LEVEL SECURITY; -- dev only
-- Production (example):
-- ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Allow authenticated read feedback" ON feedback FOR SELECT TO authenticated USING (true);
-- CREATE POLICY "Allow authenticated insert feedback" ON feedback FOR INSERT TO authenticated WITH CHECK (true);

-- Sample insert
INSERT INTO feedback (type, content, module_id, user_id)
VALUES ('module','Great module but quiz wording needs clarity', '00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000');

-- Sample query joining related tables
SELECT f.id, f.type, f.content, f.created_at,
       u.full_name AS user_name,
       m.title AS module_title,
       v.title AS video_title
FROM feedback f
LEFT JOIN users u ON u.id = f.user_id
LEFT JOIN modules m ON m.id = f.module_id
LEFT JOIN videos v ON v.id = f.video_id
ORDER BY f.created_at DESC;
```

## Current Admin Panel Features

✅ Login with email/password
✅ Admin role verification
✅ Protected routes (redirect to login if not authenticated)
✅ Logout functionality
✅ Users management (fetch, create from Supabase)
✅ Modules management (fetch, create, delete from Supabase with categories)
✅ Module detail view with videos (fetch videos for selected module)
✅ Assessments/Quizzes management (fetch, create, delete from Supabase)
✅ Quiz Builder (create/edit quizzes with module and video association)
✅ Quiz Builder with questions table integration (JSONB format for options)
✅ User management (view, add, edit, delete)
✅ Modules management with categories integration

### Notifications Table
```sql
-- Table: notifications
-- Columns:
--   id uuid PRIMARY KEY DEFAULT gen_random_uuid()
--   title text NOT NULL
--   body text NOT NULL
--   user_id uuid NULL REFERENCES users(id) ON DELETE CASCADE -- recipient user
--   data jsonb NULL                                     -- metadata (targetType, userIds, etc.)
--   created_at timestamptz DEFAULT now()
--   sent_at timestamptz NULL                            -- when actually sent / delivered
--   status text DEFAULT 'pending'                       -- pending | sent | error
--   error_message text NULL                             -- reason if status=error

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  data jsonb,
  created_at timestamptz DEFAULT now(),
  sent_at timestamptz,
  status text DEFAULT 'pending' CHECK (status IN ('pending','sent','error')),
  error_message text
);

-- Enable RLS (recommended for production)
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Policies
-- 1. Allow admins to manage all notifications
CREATE POLICY "admin_select_notifications" ON notifications
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin'));

CREATE POLICY "admin_insert_notifications" ON notifications
FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin'));

CREATE POLICY "admin_update_notifications" ON notifications
FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin'));

-- 2. Allow users to read their own notifications (optional, if end-users need to fetch)
CREATE POLICY "user_select_own_notifications" ON notifications
FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- (Optional) If end-users should not mark as sent themselves, omit UPDATE policy for non-admins.

-- Development convenience (remove in prod):
-- ALTER TABLE notifications DISABLE ROW LEVEL SECURITY;

-- Sample insert by admin sending one notification to three users
-- INSERT performed once PER USER when using current UI approach
-- (Alternatively you could store a recipients array in data and fan-out in a background worker.)
INSERT INTO notifications (title, body, user_id, data)
VALUES ('System Maintenance', 'Platform will be down at 10 PM UTC', '00000000-0000-0000-0000-000000000001', '{"targetType":"multi","userIds":["00000000-0000-0000-0000-000000000001","00000000-0000-0000-0000-000000000002"]}');
```

#### Troubleshooting RLS Errors for Notifications
- Error: "new row violates row-level security policy" => No INSERT policy matches the current session.
  * Ensure logged-in admin user has role='admin' in `users` table.
  * Confirm policies exist (`Dashboard > Table Editor > notifications > Policies`).
  * If policies newly added, refresh schema or wait a minute for cache.
  * Temporary dev workaround: `ALTER TABLE notifications DISABLE ROW LEVEL SECURITY;` (Do NOT use in production.)
- To verify policies quickly:
```sql
SELECT * FROM pg_policies WHERE schemaname='public' AND tablename='notifications';
```
- If still failing, test session identity:
```sql
SELECT auth.uid();
SELECT role FROM users WHERE id = auth.uid();
```
✅ Module detail view with videos
✅ Banners management with cascading dropdowns (redirect to video/module/category)
✅ Banner image upload to Supabase Storage
✅ Assessments/Quiz management
✅ Dashboard with dynamic statistics and weekly signup graph

## Banner Management Feature

The Banner Management system allows admins to create promotional banners for the mobile app with smart redirects:

### Features:
- **Image Upload**: Upload banner images (recommended: 1200x400px) to Supabase Storage
- **Cascading Dropdowns**: 
  1. Select redirect type (Video, Module, or Category)
  2. Second dropdown automatically loads and displays all available items of that type
- **Dynamic Display**: Control which banners appear in the mobile app with active/inactive toggle
- **Display Order**: Set the order in which banners appear (lower numbers first)
- **Edit & Delete**: Full CRUD operations for banner management

### Mobile App Integration:
When a user clicks a banner in the mobile app:
1. App reads the banner's `redirect_type` and `redirect_id`
2. Navigates to the appropriate screen:
   - `redirect_type: 'video'` → Opens video player with that video
   - `redirect_type: 'module'` → Opens module details page
   - `redirect_type: 'category'` → Opens category listing page
3. Provides seamless navigation to drive engagement with specific content
