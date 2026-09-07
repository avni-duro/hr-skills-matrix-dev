// Edge Function: create-user
// Creates an auth user + inserts into public.users table
// Requires SERVICE_ROLE_KEY to bypass RLS and create auth accounts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface CreateUserRequest {
  email: string
  password?: string
  full_name: string
  employee_id: string
  reporting_manager?: string
  role?: string
  phone?: string
  date_of_birth?: string
  date_of_joining?: string
  leaving_date?: string
  status?: string
  region_id?: number
  branch_id?: number
  sub_branch_id?: number
  department_id?: number
  sub_department_id?: number
  grade_id?: number
  designation_id?: number
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get environment variables - updated
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || Deno.env.get('SUPABASE_DB_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !serviceRoleKey) {
      console.error('Missing environment variables')
      throw new Error('Missing SUPABASE_URL/SUPABASE_DB_URL or SUPABASE_SERVICE_ROLE_KEY')
    }

    // Create admin client with service role
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    // Parse request body
    const body: CreateUserRequest = await req.json()
    console.log('Received request to create user:', { email: body.email, employee_id: body.employee_id })
    
    const { email, password, full_name, employee_id, reporting_manager, role, phone, date_of_birth, date_of_joining, leaving_date, status, region_id, branch_id, sub_branch_id, department_id, sub_department_id, grade_id, designation_id } = body

    // Normalize phone to string; we'll store it in metadata/DB only
    const normalizedPhone = phone != null ? String(phone) : undefined
    const normalizedStatus = String(status || '').trim().toLowerCase() === 'inactive' ? 'inactive' : 'active'

    // Validate required fields
    if (!email || !full_name || !employee_id) {
      console.error('Missing required fields:', { email: !!email, full_name: !!full_name, employee_id: !!employee_id })
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Missing required fields. Email, full name, and employee ID are required.' 
        }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      console.error('Invalid email format:', email)
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Invalid email format. Please provide a valid email address.' 
        }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Generate password if not provided
    const userPassword = password || crypto.randomUUID()

    // Step 1: Create auth user
    console.log('Creating auth user for:', email)
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: userPassword,
      // Do NOT send phone to auth to avoid type issues; keep it only in metadata/DB
      email_confirm: true, // Auto-confirm email
      user_metadata: {
        full_name,
        role: role || 'user',
        employee_id,
        phone: normalizedPhone
      }
    })

    if (authError) {
      console.error('Auth creation error:', authError)
      
      // Check for duplicate email error
      let errorMessage = authError.message
      if (errorMessage.includes('already registered') || errorMessage.includes('duplicate') || errorMessage.includes('unique')) {
        errorMessage = 'A user with this email address already exists. Please use a different email.'
      }
      
      return new Response(
        JSON.stringify({ 
          success: false,
          error: errorMessage
        }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    const userId = authData.user.id
    console.log('Auth user created successfully:', userId)

    // Step 2: Insert into public.users table
    console.log('Inserting user profile into database')
    const { data: userData, error: userError} = await supabaseAdmin
      .from('users')
      .insert({
        id: userId,
        full_name: full_name,
        email: email,
        role: role || 'user',
        employee_id: employee_id,
        reporting_manager: reporting_manager || null,
        phone: normalizedPhone || null,
        date_of_birth: date_of_birth || null,
        date_of_joining: date_of_joining || null,
        leaving_date: leaving_date || null,
        status: normalizedStatus,
        region_id: region_id || null,
        branch_id: branch_id || null,
        sub_branch_id: sub_branch_id || null,
        department_id: department_id || null,
        sub_department_id: sub_department_id || null,
        grade_id: grade_id || null,
        designation_id: designation_id || null
      })
      .select()
      .single()

    if (userError) {
      console.error('User profile creation error:', userError)
      // Try to cleanup auth user if profile creation failed
      await supabaseAdmin.auth.admin.deleteUser(userId)
      
      return new Response(
        JSON.stringify({ 
          success: false,
          error: `Failed to create user profile: ${userError.message}` 
        }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    console.log('User created successfully:', userId)
    
    // Return success response
    return new Response(
      JSON.stringify({
        success: true,
        user: {
          id: userId,
          email: email,
          full_name: full_name,
          role: role || 'user',
          employee_id: employee_id,
          reporting_manager: reporting_manager || null,
          phone: phone
        },
        // Return password only if it was auto-generated
        ...(password ? {} : { generatedPassword: userPassword })
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('Unexpected error:', error)
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message || 'Internal server error' 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})
