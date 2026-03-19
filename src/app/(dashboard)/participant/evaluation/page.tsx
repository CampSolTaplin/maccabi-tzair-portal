'use client';

import {
  FileText,
  Star,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';

const categories = [
  {
    name: 'Leadership Skills',
    description: 'How do you rate your growth as a leader?',
    rating: null as number | null,
  },
  {
    name: 'Community Engagement',
    description: 'How involved have you been in community activities?',
    rating: null as number | null,
  },
  {
    name: 'Personal Growth',
    description: 'How would you rate your personal development?',
    rating: null as number | null,
  },
  {
    name: 'Jewish Identity',
    description: 'How has your connection to Jewish identity evolved?',
    rating: null as number | null,
  },
  {
    name: 'Teamwork',
    description: 'How well have you collaborated with others?',
    rating: null as number | null,
  },
];

const previousEvaluations = [
  { period: 'January 2026', completedDate: 'Jan 28, 2026', overallScore: 4.2 },
  { period: 'October 2025', completedDate: 'Oct 30, 2025', overallScore: 3.8 },
];

export default function SelfEvaluationPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-brand-navy/10 p-3">
          <FileText className="h-7 w-7 text-brand-navy" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-brand-navy">Self-Evaluation</h1>
          <p className="text-sm text-brand-muted">Reflect on your journey and growth</p>
        </div>
      </div>

      {/* Current Evaluation Card */}
      <div className="rounded-2xl bg-gradient-to-br from-brand-navy to-brand-navy/80 p-6 text-white shadow-md">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-white/70">Current Period</p>
            <p className="mt-1 text-xl font-bold">March 2026 Evaluation</p>
            <p className="mt-2 text-sm text-white/70">
              Take a moment to reflect on your growth and experiences this period.
            </p>
          </div>
          <div className="hidden sm:block rounded-xl bg-white/10 p-4">
            <FileText className="h-8 w-8 text-white/80" />
          </div>
        </div>
      </div>

      {/* Evaluation Categories */}
      <div className="rounded-xl bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-lg font-semibold text-brand-navy">Rate Your Growth</h3>
        <div className="space-y-6">
          {categories.map((category, i) => (
            <div key={i}>
              <div className="mb-2">
                <p className="font-medium text-brand-dark-text">{category.name}</p>
                <p className="text-sm text-brand-muted">{category.description}</p>
              </div>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    className="p-1 transition-colors hover:text-amber-400"
                  >
                    <Star
                      className={cn(
                        'h-7 w-7',
                        category.rating && star <= category.rating
                          ? 'fill-amber-400 text-amber-400'
                          : 'text-gray-200'
                      )}
                    />
                  </button>
                ))}
              </div>
              {i < categories.length - 1 && <div className="mt-4 border-t border-gray-100" />}
            </div>
          ))}
        </div>

        {/* Written Reflection */}
        <div className="mt-6 pt-4 border-t border-gray-100">
          <label className="mb-2 block font-medium text-brand-dark-text">
            Written Reflection
          </label>
          <textarea
            placeholder="Share your thoughts about your experience this period..."
            className="w-full rounded-xl border border-gray-200 p-4 text-sm focus:border-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-navy/20"
            rows={4}
          />
        </div>

        <button className="mt-4 flex items-center gap-2 rounded-xl bg-brand-coral px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-brand-coral/90 hover:-translate-y-0.5">
          Submit Evaluation
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>

      {/* Previous Evaluations */}
      <div className="rounded-xl bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-lg font-semibold text-brand-navy">Previous Evaluations</h3>
        <div className="space-y-3">
          {previousEvaluations.map((evaluation, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-lg border border-gray-100 px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-500 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-brand-dark-text">{evaluation.period}</p>
                  <p className="text-xs text-brand-muted">Completed {evaluation.completedDate}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                <span className="text-sm font-bold text-brand-dark-text">{evaluation.overallScore}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
