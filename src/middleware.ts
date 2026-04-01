import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

// Only truly public routes (no /api/ blanket access)
const PUBLIC_ROUTES = ['/login', '/signup', '/reset-password', '/update-password', '/auth/callback', '/mfa-verify'];
// API routes that need to be public (auth callback only)
const PUBLIC_API_ROUTES = ['/api/auth/'];
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
      // Check if user needs MFA verification
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      const needsMfa = aal?.nextLevel === 'aal2' && aal?.currentLevel !== 'aal2';

      // Stay on /mfa-verify if MFA is still needed
      if (path.startsWith('/mfa-verify') && needsMfa) {
        return supabaseResponse;
      }

      // Stay on /update-password (user just reset their password)
      if (path.startsWith('/update-password')) {
        return supabaseResponse;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (profile?.role) {
        // If admin needs MFA, send to /mfa-verify instead of /admin (avoids redirect loop)
        if (profile.role === 'admin' && needsMfa) {
          if (!path.startsWith('/mfa-verify')) {
            return NextResponse.redirect(new URL('/mfa-verify', request.url));
          }
          return supabaseResponse;
        }
        return NextResponse.redirect(new URL(getRoleRoute(profile.role), request.url));
      }
    }
    return supabaseResponse;
  }

  // Allow specific public API routes
  if (PUBLIC_API_ROUTES.some(r => path.startsWith(r))) {
    return supabaseResponse;
  }

  // API routes: require authentication but skip role-based redirect
  if (path.startsWith('/api/')) {
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // Admin API routes require admin role
    if (path.startsWith('/api/admin/')) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
      if (profile?.role !== 'admin') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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

  // For admin routes, enforce AAL2 if user has MFA enrolled
  if (path.startsWith('/admin') || path.startsWith('/api/admin')) {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.nextLevel === 'aal2' && aal?.currentLevel !== 'aal2') {
      // MFA required but not verified
      if (path.startsWith('/api/')) {
        return NextResponse.json({ error: 'MFA verification required' }, { status: 403 });
      }
      return NextResponse.redirect(new URL('/mfa-verify', request.url));
    }
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

  // Root path -> redirect based on role
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
    '/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
