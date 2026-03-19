'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useProfile } from '@/lib/hooks/use-profile';
import { cn } from '@/lib/utils/cn';
import { createClient } from '@/lib/supabase/client';
import { ROLE_LABELS } from '@/lib/utils/constants';
import type { UserRole } from '@/lib/utils/constants';
import {
  LayoutDashboard,
  ClipboardCheck,
  Calendar,
  PartyPopper,
  Clock,
  Users,
  Layers,
  Settings,
  Shield,
  Cloud,
  FileUp,
  BarChart3,
  CalendarCheck,
  Target,
  FileText,
  Bell,
  LogOut,
  Menu,
  X,
  ChevronLeft,
  Loader2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

const NAV_ITEMS: Record<UserRole, NavItem[]> = {
  admin: [
    { label: 'Dashboard', href: '/admin', icon: LayoutDashboard },
    { label: 'Attendance', href: '/admin/attendance', icon: ClipboardCheck },
    { label: 'Sessions', href: '/admin/sessions', icon: Calendar },
    { label: 'Events', href: '/admin/events', icon: PartyPopper },
    { label: 'Community Hours', href: '/admin/hours', icon: Clock },
    { label: 'Users', href: '/admin/users', icon: Users },
    { label: 'Groups', href: '/admin/groups', icon: Layers },
    { label: 'Settings', href: '/admin/settings', icon: Settings },
    { label: 'Security', href: '/admin/security', icon: Shield },
    { label: 'Salesforce', href: '/admin/salesforce', icon: Cloud },
    { label: 'Import', href: '/admin/roster-import', icon: FileUp },
  ],
  madrich: [
    { label: 'My Group', href: '/madrich', icon: LayoutDashboard },
    { label: 'Take Attendance', href: '/madrich/take-attendance', icon: ClipboardCheck },
    { label: 'Group Stats', href: '/madrich/stats', icon: BarChart3 },
  ],
  participant: [
    { label: 'Dashboard', href: '/participant', icon: LayoutDashboard },
    { label: 'My Attendance', href: '/participant/attendance', icon: CalendarCheck },
    { label: 'My Hours', href: '/participant/hours', icon: Clock },
    { label: 'My Goals', href: '/participant/goals', icon: Target },
    { label: 'Self-Evaluation', href: '/participant/evaluation', icon: FileText },
  ],
  parent: [
    { label: 'My Children', href: '/parent', icon: Users },
    { label: 'Notifications', href: '/parent/notifications', icon: Bell },
    { label: 'Settings', href: '/parent/settings', icon: Settings },
  ],
};

function getInitials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

function getRoleBadgeColor(role: UserRole): string {
  switch (role) {
    case 'admin':
      return 'bg-brand-coral text-white';
    case 'madrich':
      return 'bg-amber-500 text-white';
    case 'participant':
      return 'bg-emerald-500 text-white';
    case 'parent':
      return 'bg-sky-500 text-white';
  }
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile, loading } = useProfile();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!loading && !profile) {
      router.replace('/login');
    }
  }, [loading, profile, router]);

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-brand-light-blue">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-brand-navy" />
          <p className="text-sm font-medium text-brand-muted">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return null;
  }

  const navItems = NAV_ITEMS[profile.role] ?? [];
  const mobileNavItems = navItems.slice(0, 5);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace('/login');
  }

  function isActive(href: string): boolean {
    if (href === `/${profile!.role}`) {
      return pathname === href;
    }
    return pathname.startsWith(href);
  }

  return (
    <div className="flex h-screen overflow-hidden bg-brand-light-blue">
      {/* Desktop Sidebar */}
      <aside
        className={cn(
          'hidden md:flex flex-col bg-brand-navy text-white transition-all duration-300 ease-in-out',
          sidebarCollapsed ? 'w-[72px]' : 'w-64'
        )}
      >
        {/* Sidebar Header */}
        <div className="flex h-16 items-center justify-between px-4 border-b border-white/10">
          {!sidebarCollapsed && (
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xl flex-shrink-0">&#x2721;</span>
              <span className="font-bold text-lg truncate">Maccabi Tzair</span>
            </div>
          )}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className={cn(
              'p-1.5 rounded-lg hover:bg-white/10 transition-colors flex-shrink-0',
              sidebarCollapsed && 'mx-auto'
            )}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <ChevronLeft
              className={cn(
                'h-5 w-5 transition-transform duration-300',
                sidebarCollapsed && 'rotate-180'
              )}
            />
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200',
                  active
                    ? 'bg-white/20 text-white shadow-sm'
                    : 'text-white/70 hover:bg-white/10 hover:text-white',
                  sidebarCollapsed && 'justify-center px-2'
                )}
                title={sidebarCollapsed ? item.label : undefined}
              >
                <Icon className="h-5 w-5 flex-shrink-0" />
                {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* User Info */}
        <div className="border-t border-white/10 p-3">
          <div
            className={cn(
              'flex items-center gap-3',
              sidebarCollapsed && 'flex-col'
            )}
          >
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-brand-coral text-sm font-bold text-white">
              {profile.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt=""
                  className="h-9 w-9 rounded-full object-cover"
                />
              ) : (
                getInitials(profile.first_name, profile.last_name)
              )}
            </div>
            {!sidebarCollapsed && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">
                  {profile.display_name || `${profile.first_name} ${profile.last_name}`}
                </p>
                <span
                  className={cn(
                    'inline-block mt-0.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                    getRoleBadgeColor(profile.role)
                  )}
                >
                  {ROLE_LABELS[profile.role]}
                </span>
              </div>
            )}
          </div>
          <button
            onClick={handleSignOut}
            className={cn(
              'mt-3 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-white/70 hover:bg-white/10 hover:text-white transition-colors',
              sidebarCollapsed && 'justify-center px-2'
            )}
          >
            <LogOut className="h-4 w-4 flex-shrink-0" />
            {!sidebarCollapsed && <span>Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* Mobile Sidebar Overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Mobile Sidebar Drawer */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-brand-navy text-white transition-transform duration-300 md:hidden',
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-16 items-center justify-between px-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <span className="text-xl">&#x2721;</span>
            <span className="font-bold text-lg">Maccabi Tzair</span>
          </div>
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className={cn(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200',
                  active
                    ? 'bg-white/20 text-white shadow-sm'
                    : 'text-white/70 hover:bg-white/10 hover:text-white'
                )}
              >
                <Icon className="h-5 w-5 flex-shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-white/10 p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-brand-coral text-sm font-bold text-white">
              {profile.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt=""
                  className="h-9 w-9 rounded-full object-cover"
                />
              ) : (
                getInitials(profile.first_name, profile.last_name)
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">
                {profile.display_name || `${profile.first_name} ${profile.last_name}`}
              </p>
              <span
                className={cn(
                  'inline-block mt-0.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                  getRoleBadgeColor(profile.role)
                )}
              >
                {ROLE_LABELS[profile.role]}
              </span>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-white/70 hover:bg-white/10 hover:text-white transition-colors"
          >
            <LogOut className="h-4 w-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="flex h-16 items-center justify-between border-b border-gray-200/60 bg-white px-4 shadow-sm md:px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="rounded-lg p-2 text-brand-navy hover:bg-brand-light-blue transition-colors md:hidden"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="text-lg font-semibold text-brand-navy md:text-xl">
              {navItems.find((item) => isActive(item.href))?.label ?? 'Dashboard'}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 sm:flex">
              <span className="text-sm text-brand-muted">
                {profile.display_name || `${profile.first_name} ${profile.last_name}`}
              </span>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-navy text-sm font-bold text-white">
              {profile.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt=""
                  className="h-9 w-9 rounded-full object-cover"
                />
              ) : (
                getInitials(profile.first_name, profile.last_name)
              )}
            </div>
            <button
              onClick={handleSignOut}
              className="hidden rounded-lg p-2 text-brand-muted hover:bg-brand-light-blue hover:text-brand-navy transition-colors sm:block"
              aria-label="Sign out"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-4 pb-20 md:p-6 md:pb-6">
          {children}
        </main>

        {/* Mobile Bottom Tab Bar */}
        <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-gray-200/60 bg-white shadow-[0_-2px_10px_rgba(0,0,0,0.05)] md:hidden">
          <div className="flex items-center justify-around px-1 py-1">
            {mobileNavItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex flex-1 flex-col items-center gap-0.5 rounded-xl py-2 text-[10px] font-medium transition-colors',
                    active
                      ? 'text-brand-navy'
                      : 'text-brand-muted hover:text-brand-navy'
                  )}
                >
                  <Icon className={cn('h-5 w-5', active && 'text-brand-coral')} />
                  <span className="truncate max-w-[64px]">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
