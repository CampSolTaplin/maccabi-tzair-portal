import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

const PUBLIC_ROUTES = ['/login', '/signup', '/reset-password', '/auth/callback', '/api/'];
const ROLE_PREFIXES = ['/admin', '/madrich', '/participant', '/parent'];

const ROLE_ROUTES: Record<string, string> = {
  admin: '/admin',
  madrich: '/madrich',
  participant: '/participant',
  parent: '/parent',
};

function getRoleRoute(role: string): string {
  return ROLE_ROUTES[role] || '/login';
}

export async function middleware(request: NextRequest) {
  const { user, supabaseResponse, supabase } = await updateSession(request);
  const path = request.nextUrl.pathname;

  // Allow public routes
  if (PUBLIC_ROUTES.some(r => path.startsWith(r))) {
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (profile?.role) {
        return NextResponse.redirect(new URL(getRoleRoute(profile.role), request.url));
      }
    }
    return supabaseResponse;
  }

  // Protected routes: must be logged in
  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirect', path);
    return NextResponse.redirect(url);
  }

  // Role-based route protection
  if (ROLE_PREFIXES.some(prefix => path.startsWith(prefix))) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    const requiredRole = ROLE_PREFIXES.find(prefix => path.startsWith(prefix))?.slice(1);
    if (profile.role !== requiredRole && profile.role !== 'admin') {
      return NextResponse.redirect(new URL(getRoleRoute(profile.role), request.url));
    }
  }

  // Root path → redirect based on role
  if (path === '/') {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role) {
      return NextResponse.redirect(new URL(getRoleRoute(profile.role), request.url));
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
