'use client';

import {
  Target,
  Plus,
  CheckCircle2,
  Circle,
  ArrowUpRight,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';

const goals = [
  {
    title: 'Lead a community event',
    category: 'Leadership',
    progress: 60,
    status: 'active' as const,
    dueDate: 'Apr 30, 2026',
    description: 'Organize and lead a community service project for the group',
  },
  {
    title: 'Complete 40 community hours',
    category: 'Community',
    progress: 61,
    status: 'active' as const,
    dueDate: 'Jun 15, 2026',
    description: 'Reach the 40-hour milestone through attendance, events, and volunteering',
  },
  {
    title: 'Mentor a younger member',
    category: 'Personal',
    progress: 30,
    status: 'active' as const,
    dueDate: 'May 20, 2026',
    description: 'Help guide and support a member in the younger age group',
  },
  {
    title: 'Attend 5 consecutive sessions',
    category: 'Community',
    progress: 100,
    status: 'completed' as const,
    dueDate: 'Feb 28, 2026',
    description: 'Maintain perfect attendance for 5 weeks in a row',
  },
];

function categoryColor(category: string) {
  switch (category) {
    case 'Leadership': return 'bg-brand-coral/10 text-brand-coral';
    case 'Community': return 'bg-brand-navy/10 text-brand-navy';
    case 'Personal': return 'bg-emerald-50 text-emerald-700';
    case 'Academic': return 'bg-sky-50 text-sky-700';
    default: return 'bg-gray-50 text-gray-700';
  }
}

export default function MyGoalsPage() {
  const activeGoals = goals.filter((g) => g.status === 'active');
  const completedGoals = goals.filter((g) => g.status === 'completed');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-brand-coral/10 p-3">
            <Target className="h-7 w-7 text-brand-coral" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-brand-navy">My Goals</h1>
            <p className="text-sm text-brand-muted">Set goals and track your personal growth</p>
          </div>
        </div>
        <button className="flex items-center gap-2 rounded-xl bg-brand-coral px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-brand-coral/90 hover:-translate-y-0.5">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">New Goal</span>
        </button>
      </div>

      {/* Active Goals */}
      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-brand-muted">
          Active Goals ({activeGoals.length})
        </h3>
        <div className="space-y-4">
          {activeGoals.map((goal, i) => (
            <div
              key={i}
              className="rounded-xl bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Circle className="h-4 w-4 text-brand-muted flex-shrink-0" />
                    <h4 className="font-semibold text-brand-dark-text">{goal.title}</h4>
                  </div>
                  <p className="ml-6 text-sm text-brand-muted">{goal.description}</p>
                </div>
                <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium flex-shrink-0', categoryColor(goal.category))}>
                  {goal.category}
                </span>
              </div>
              <div className="mt-4 ml-6">
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-brand-muted">Progress</span>
                  <span className="font-medium text-brand-dark-text">{goal.progress}%</span>
                </div>
                <div className="h-2 rounded-full bg-gray-100">
                  <div
                    className="h-2 rounded-full bg-brand-coral transition-all"
                    style={{ width: `${goal.progress}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-brand-muted">Due: {goal.dueDate}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Completed Goals */}
      {completedGoals.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-brand-muted">
            Completed ({completedGoals.length})
          </h3>
          <div className="space-y-3">
            {completedGoals.map((goal, i) => (
              <div
                key={i}
                className="rounded-xl bg-white/70 p-4 shadow-sm"
              >
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-500 flex-shrink-0" />
                  <span className="font-medium text-brand-dark-text line-through decoration-brand-muted/30">
                    {goal.title}
                  </span>
                  <span className={cn('ml-auto rounded-full px-2.5 py-0.5 text-xs font-medium flex-shrink-0', categoryColor(goal.category))}>
                    {goal.category}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
