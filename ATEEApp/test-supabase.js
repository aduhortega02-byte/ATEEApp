const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://nvffvxdoyfiqcsfiedlc.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im52ZmZ2eGRveWZpcWNzZmllZGxjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5ODM0ODUsImV4cCI6MjA5MDU1OTQ4NX0.O42TWOOhvG4uksnWNQ3uKadh881X2zLH-TeYtmPHK6Y';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testConnection() {
  const { data, error } = await supabase.from('users').select('*');
  if (error) {
    console.log('Error:', error);
  } else {
    console.log('Connection works! Data:', data);
  }
}

testConnection();