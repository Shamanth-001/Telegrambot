// Tiny global toast store, rendered by <Toaster />.
let message: string | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

export function toast(text: string) {
  message = text;
  listeners.forEach((l) => l());
  clearTimeout(timer);
  timer = setTimeout(() => {
    message = null;
    listeners.forEach((l) => l());
  }, 2200);
}

export const subscribeToast = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export const currentToast = () => message;

export async function copyText(text: string, done = 'Copied') {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  toast(done);
}
