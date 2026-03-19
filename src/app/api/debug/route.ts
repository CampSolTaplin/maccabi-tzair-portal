import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET() {
  const cookieStore = await cookies();
  const allCookies = cookieStore.getAll();
  
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  
  let profile = null;
  let profileError = null;
  if (user) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();
    profile = data;
    profileError = error;
  }

  return NextResponse.json({
    cookieNames: allCookies.map(c => ({ name: c.name, valueLength: c.value.length })),
    user: user ? { id: user.id, email: user.email } : null,
    userError: userError?.message || null,
    profile,
    profileError: profileError?.message || null,
  });
}
