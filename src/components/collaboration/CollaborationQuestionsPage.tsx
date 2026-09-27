import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, Loader2, Sparkles } from 'lucide-react';
import type { CreatorProfile } from '../../types';
import affilApi from '../../lib/affilApi';

type Q = {
  id: string;
  prompt: string;
  type: 'single' | 'multi';
  maxSelect?: number;
  options: string[];
  signalTags?: string[];
};

interface Props {
  currentUser: CreatorProfile;
  onBack: () => void;
  onCompletedSet?: () => void;
}

export const CollaborationQuestionsPage: React.FC<Props> = ({
  currentUser,
  onBack,
  onCompletedSet,
}) => {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Q[]>([]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [done, setDone] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await affilApi.getNextCollaborationQuestionSet();
        if (cancelled) return;
        const qs = Array.isArray(data?.questions) ? data.questions : [];
        setQuestions(qs);
        setHasMore((data?.remaining ?? 0) > qs.length);
        setIndex(0);
        setAnswers({});
        if (qs.length === 0) setDone(true);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Could not load questions.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentUser?.id]);

  const current = questions[index];
  const progressLabel = questions.length ? `${index + 1} / ${questions.length}` : '0 / 0';

  const canProceed = useMemo(() => {
    if (!current) return false;
    const a = answers[current.id];
    if (current.type === 'multi') return Array.isArray(a) && a.length > 0;
    return typeof a === 'string' && a.length > 0;
  }, [current, answers]);

  const toggleMulti = (opt: string) => {
    if (!current) return;
    const max = current.maxSelect || 3;
    const prev = Array.isArray(answers[current.id]) ? [...(answers[current.id] as string[])] : [];
    const i = prev.indexOf(opt);
    if (i >= 0) prev.splice(i, 1);
    else if (prev.length < max) prev.push(opt);
    setAnswers((s) => ({ ...s, [current.id]: prev }));
  };

  const selectSingle = (opt: string) => {
    if (!current) return;
    setAnswers((s) => ({ ...s, [current.id]: opt }));
  };

  const handleNext = async () => {
    if (!current || !canProceed) return;
    if (index < questions.length - 1) {
      setIndex((i) => i + 1);
      return;
    }
    // Submit set
    setSubmitting(true);
    setError(null);
    try {
      const res = await affilApi.submitCollaborationQuestionSet({
        questionIds: questions.map((q) => q.id),
        answers,
      });
      setHasMore(!!res?.hasMore);
      setDone(true);
      onCompletedSet?.();
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Could not save answers.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[70vh] max-w-2xl mx-auto px-4 py-8">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)] mb-6 cursor-pointer"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back
      </button>

      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="w-4 h-4 text-[var(--accent-amber)]" />
        <h1 className="font-editorial text-2xl font-bold text-[var(--text-primary)]">
          Collaboration Profile
        </h1>
      </div>
      <p className="text-xs text-[var(--text-secondary)] mb-6 max-w-lg">
        Optional questions about how you like to work. Answers help Afflatus understand compatibility —
        they never block Explore.
      </p>

      {loading && (
        <div className="flex flex-col items-center py-16 gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--accent-amber)]" />
          <p className="text-xs text-[var(--text-muted)]">Choosing useful questions for you…</p>
        </div>
      )}

      {error && (
        <div className="p-3 rounded-xl border border-red-500/30 bg-red-500/10 text-xs text-red-600 mb-4">
          {error}
        </div>
      )}

      {!loading && done && (
        <div className="card-warm-white rounded-3xl border border-[var(--card-border)] p-8 text-center space-y-3">
          <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
          <h2 className="font-editorial text-lg font-bold text-[var(--text-primary)]">Set saved</h2>
          <p className="text-xs text-[var(--text-secondary)]">
            {hasMore
              ? 'Thanks — more questions may appear later when they help Afflatus understand you better.'
              : 'You have answered the full progressive set. Signals will keep complementing your profile.'}
          </p>
          <button
            type="button"
            onClick={onBack}
            className="amber-pill-btn mt-2 px-5 py-2.5 rounded-full text-xs font-bold cursor-pointer"
          >
            Done
          </button>
        </div>
      )}

      {!loading && !done && current && (
        <div className="card-warm-white rounded-3xl border border-[var(--card-border)] p-6 sm:p-8 space-y-5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[var(--accent-amber)]">
              Question {progressLabel}
            </span>
            {current.type === 'multi' && (
              <span className="text-[10px] text-[var(--text-muted)]">
                Select up to {current.maxSelect || 3}
              </span>
            )}
          </div>

          <h2 className="text-base sm:text-lg font-semibold text-[var(--text-primary)] leading-snug">
            {current.prompt}
          </h2>

          <div className="space-y-2">
            {current.options.map((opt) => {
              const selected =
                current.type === 'multi'
                  ? Array.isArray(answers[current.id]) && (answers[current.id] as string[]).includes(opt)
                  : answers[current.id] === opt;
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => (current.type === 'multi' ? toggleMulti(opt) : selectSingle(opt))}
                  className={`w-full text-left px-4 py-3 rounded-2xl border text-xs sm:text-sm transition-colors cursor-pointer ${
                    selected
                      ? 'border-[var(--accent-amber)] bg-[color-mix(in_srgb,var(--accent-amber)_14%,transparent)] text-[var(--text-primary)] font-semibold'
                      : 'border-[var(--card-border)] bg-[var(--card-inner-bg)] text-[var(--text-secondary)] hover:border-[var(--accent-amber)]/50'
                  }`}
                >
                  {opt}
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between pt-2 gap-3">
            <button
              type="button"
              disabled={index === 0}
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
              className="px-4 py-2 rounded-full text-xs font-semibold border border-[var(--card-border)] text-[var(--text-muted)] disabled:opacity-40 cursor-pointer"
            >
              Back
            </button>
            <button
              type="button"
              disabled={!canProceed || submitting}
              onClick={handleNext}
              className="amber-pill-btn px-5 py-2.5 rounded-full text-xs font-bold disabled:opacity-50 cursor-pointer inline-flex items-center gap-2"
            >
              {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {index < questions.length - 1 ? 'Next' : 'Save set'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
