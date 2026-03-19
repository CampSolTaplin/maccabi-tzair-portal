import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ROLE_ROUTES } from '@/lib/utils/constants';
import type { UserRole } from '@/lib/utils/constants';

export default async function DashboardRootPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile) {
    redirect('/login');
  }

  const role = profile.role as UserRole;
  const route = ROLE_ROUTES[role] ?? '/login';

  redirect(route);
}
