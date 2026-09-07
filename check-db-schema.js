import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config()

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkDatabaseSchema() {
  console.log('🔍 Checking Supabase Database Schema...\n')
  
  // Check modules table structure
  console.log('📦 MODULES TABLE:')
  const { data: modules, error: modulesError } = await supabase
    .from('modules')
    .select('*')
    .limit(1)
  
  if (modulesError) {
    console.error('Error fetching modules:', modulesError.message)
  } else {
    if (modules && modules.length > 0) {
      console.log('Columns:', Object.keys(modules[0]).join(', '))
    } else {
      console.log('No data, checking with raw query...')
    }
  }
  
  // Check for module_department_access table
  console.log('\n🏢 MODULE_DEPARTMENT_ACCESS TABLE:')
  const { data: deptAccess, error: deptError } = await supabase
    .from('module_department_access')
    .select('*')
    .limit(1)
  
  if (deptError) {
    console.log('❌ Table does not exist:', deptError.message)
  } else {
    console.log('✅ Table exists!')
    if (deptAccess && deptAccess.length > 0) {
      console.log('Columns:', Object.keys(deptAccess[0]).join(', '))
    }
  }
  
  // Check for module_user_access table
  console.log('\n👤 MODULE_USER_ACCESS TABLE:')
  const { data: userAccess, error: userError } = await supabase
    .from('module_user_access')
    .select('*')
    .limit(1)
  
  if (userError) {
    console.log('❌ Table does not exist:', userError.message)
  } else {
    console.log('✅ Table exists!')
    if (userAccess && userAccess.length > 0) {
      console.log('Columns:', Object.keys(userAccess[0]).join(', '))
    }
  }
  
  // Check for module_access_requests table
  console.log('\n📋 MODULE_ACCESS_REQUESTS TABLE:')
  const { data: requests, error: requestsError } = await supabase
    .from('module_access_requests')
    .select('*')
    .limit(1)
  
  if (requestsError) {
    console.log('❌ Table does not exist:', requestsError.message)
  } else {
    console.log('✅ Table exists!')
    if (requests && requests.length > 0) {
      console.log('Columns:', Object.keys(requests[0]).join(', '))
    }
  }
  
  // Check departments table
  console.log('\n🏛️ DEPARTMENTS TABLE:')
  const { data: departments, error: deptTableError } = await supabase
    .from('departments')
    .select('*')
    .limit(1)
  
  if (deptTableError) {
    console.log('❌ Table does not exist:', deptTableError.message)
  } else {
    console.log('✅ Table exists!')
    if (departments && departments.length > 0) {
      console.log('Columns:', Object.keys(departments[0]).join(', '))
      console.log('Sample data:', departments[0])
    }
  }
  
  // Check users table structure
  console.log('\n👥 USERS TABLE:')
  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('*')
    .limit(1)
  
  if (usersError) {
    console.error('Error fetching users:', usersError.message)
  } else {
    if (users && users.length > 0) {
      console.log('Columns:', Object.keys(users[0]).join(', '))
    }
  }
  
  console.log('\n✅ Schema check complete!')
}

checkDatabaseSchema()
