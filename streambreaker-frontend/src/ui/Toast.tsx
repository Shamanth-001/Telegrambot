import { useSyncExternalStore } from 'react';
import { Check } from 'lucide-react';
import { currentToast, subscribeToast } from '../lib/toast';

export function Toaster() {
  const text = useSyncExternalStore(subscribeToast, currentToast, () => null);
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex justify-center px-4 md:bottom-6"
    >
      {text && (
        <div className="fade-up flex items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-bg shadow-2xl">
          <Check className="h-4 w-4" strokeWidth={3} />
          {text}
        </div>
      )}
    </div>
  );
}
