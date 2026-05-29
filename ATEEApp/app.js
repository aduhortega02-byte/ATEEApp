import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://nvffvxdoyfiqcsfiedlc.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im52ZmZ2eGRveWZpcWNzZmllZGxjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzI2ODg5ODcsImV4cCI6MjA0ODI2NDk4N30.sb_publishable_mzEIHvhmx_0jJzNEWnYe4A_n--UiW6Z'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)