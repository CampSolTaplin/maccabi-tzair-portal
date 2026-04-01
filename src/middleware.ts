import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

const PUBLIC_API_ROUTES = ['/api/auth/'];
const ROLE_PREFIXES = ['/admin', '/madrich', '/participant', '/parent'];

const ROLE_ROUTES: Record<string, string> = {
  admin: '/admin',
  coordinator: '/admin',
  madrich: '/madrich',
  participant: '/participant',
  parent: '/parent',
};

function getRoleRoute(role: string): string {
  return ROLE_ROUTES[role] || '/login';
}

// Routes that should NEVER redirect, even if logged in
const ALWAYS_ALLOW = ['/reset-password', '/update-password', '/auth/callback', '/signup'];

export async function middleware(request: NextRequest) {
  const { user, supabaseResponse, supabase } = await updateSession(request);
  const path = request.nextUrl.pathname;

  // ─── Always-accessible routes (no redirects ever) ───
  if (ALWAYS_ALLOW.some(r => path.startsWith(r))) {
    return supabaseResponse;
  }

  // ─── /login: redirect logged-in users to their dashboard ───
  if (path.startsWith('/login')) {
    if (user) {
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single();

        if (profile?.role) {
          const dest = getRoleRoute(profile.role);

          // Admin with MFA → check if MFA is verified
          if (profile.role === 'admin') {
            const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
            if (aal?.nextLevel === 'aal2' && aal?.currentLevel !== 'aal2') {
              return NextResponse.redirect(new URL('/mfa-verify', request.url));
            }
          }

          return NextResponse.redirect(new URL(dest, request.url));
        }
      } catch {
        // If anything fails, just show login page
      }
    }
    return supabaseResponse;
  }

  // ─── /mfa-verify: stay if MFA needed, redirect if not ───
  if (path.startsWith('/mfa-verify')) {
    if (user) {
      try {
        const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (aal?.nextLevel === 'aal2' && aal?.currentLevel !== 'aal2') {
          return supabaseResponse; // Stay — MFA still needed
        }
        // MFA done or not required — redirect to dashboard
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single();
        if (profile?.role) {
          return NextResponse.redirect(new URL(getRoleRoute(profile.role), request.url));
        }
      } catch {
        // If anything fails, stay on mfa-verify
      }
    }
    return supabaseResponse;
  }

  // ─── Public API routes ───
  if (PUBLIC_API_ROUTES.some(r => path.startsWith(r))) {
    return supabaseResponse;
  }

  // ─── API routes: require auth ───
  if (path.startsWith('/api/')) {
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (path.startsWith('/api/admin/')) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
      if (profile?.role !== 'admin' && profile?.role !== 'coordinator') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }
    return supabaseResponse;
  }

  // ─── Protected routes: must be logged in ───
  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirect', path);
    return NextResponse.redirect(url);
  }

  // ─── Admin routes: enforce MFA ───
  if (path.startsWith('/admin')) {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.nextLevel === 'aal2' && aal?.currentLevel !== 'aal2') {
      return NextResponse.redirect(new URL('/mfa-verify', request.url));
    }
  }

  // ─── Role-based route protection ───
  if (ROLE_PREFIXES.some(prefix => path.startsWith(prefix))) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile) {
      // No profile found — sign out and send to login
      return NextResponse.redirect(new URL('/login', request.url));
    }

    const requiredRole = ROLE_PREFIXES.find(prefix => path.startsWith(prefix))?.slice(1);
    // mazkirut can access madrich routes
    const roleMatches = profile.role === requiredRole ||
      (profile.role === 'mazkirut' && requiredRole === 'madrich');
    if (!roleMatches && profile.role !== 'admin' && profile.role !== 'coordinator') {
      return NextResponse.redirect(new URL(getRoleRoute(profile.role), request.url));
    }
  }

  // ─── Root path → redirect based on role ───
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
