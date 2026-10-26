import { useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Bug, Check, Clapperboard, Lightbulb, Loader2, MessageCircle } from 'lucide-react';
import { api, ApiError, type FeedbackKind } from '../lib/api';

const KINDS: { value: FeedbackKind; label: string; icon: typeof Bug }[] = [
  { value: 'idea', label: 'Idea', icon: Lightbulb },
  { value: 'bug', label: 'Bug', icon: Bug },
  { value: 'request', label: 'Request', icon: Clapperboard },
  { value: 'other', label: 'Other', icon: MessageCircle },
];

const field =
  'w-full rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink placeholder:text-dim focus:border-accent focus:outline-none';

export default function Feedback() {
  const from = (useLocation().state as { from?: string } | null)?.from;
  const [kind, setKind] = useState<FeedbackKind>('idea');
  const [message, setMessage] = useState('');
  const [contact, setContact] = useState('');
  const [website, setWebsite] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (message.trim().length < 3) {
      setError('Please write a little more.');
      return;
    }
    setStatus('sending');
    setError('');
    try {
      await api.feedback({ kind, message: message.trim(), contact: contact.trim(), page: from, website });
      setStatus('sent');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't send feedback. Check your connection and try again.");
      setStatus('idle');
    }
  }

  if (status === 'sent') {
    return (
      <div className="mx-auto max-w-sm px-4 pt-40 text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-surface-2">
          <Check className="h-7 w-7 text-accent" />
        </div>
        <p className="mt-4 text-lg font-semibold">Thanks for the feedback!</p>
        <p className="mt-1 text-sm text-muted">Every message gets read.</p>
        <div className="mt-6 flex justify-center gap-3">
          <Link to="/" className="rounded-full bg-accent px-5 py-2.5 text-sm font-bold text-accent-ink">
            Go home
          </Link>
          <button
            type="button"
            onClick={() => {
              setMessage('');
              setStatus('idle');
            }}
            className="rounded-full bg-surface-2 px-5 py-2.5 text-sm font-semibold text-ink hover:bg-line"
          >
            Send another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl px-4 pt-24 sm:px-8">
      <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">Feedback</h1>
      <p className="mt-1 text-sm text-dim">Found a bug, missing a title, or have an idea? Tell us.</p>

      <form onSubmit={submit} className="mt-8 space-y-5">
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-muted">What's it about?</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {KINDS.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                aria-pressed={kind === value}
                onClick={() => setKind(value)}
                className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
                  kind === value ? 'border-accent bg-accent/10 text-accent' : 'border-line bg-surface text-muted hover:text-ink'
                }`}
              >
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-muted">Message</span>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={6}
            maxLength={2000}
            required
            placeholder={kind === 'request' ? 'Which movie or series should we add?' : 'Tell us what you think…'}
            className={`${field} resize-y`}
          />
          <span className="mt-1 block text-right text-xs text-dim">{message.length}/2000</span>
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-muted">
            Telegram username or email <span className="font-normal text-dim">(optional, if you want a reply)</span>
          </span>
          <input value={contact} onChange={(e) => setContact(e.target.value)} maxLength={200} placeholder="@username" className={field} />
        </label>

        {/* Honeypot: hidden from people, filled in by spam bots */}
        <input
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          name="website"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          className="hidden"
        />

        {error && <p className="text-sm font-semibold text-bad">{error}</p>}

        <button
          type="submit"
          disabled={status === 'sending'}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-accent px-5 py-3 text-sm font-bold text-accent-ink hover:bg-accent-hover disabled:opacity-60 sm:w-auto"
        >
          {status === 'sending' && <Loader2 className="h-4 w-4 animate-spin" />}
          Send feedback
        </button>
      </form>
    </div>
  );
}
