let toastContainer: HTMLDivElement | null = null;

function getToastContainer() {
  if (toastContainer) return toastContainer;
  toastContainer = document.createElement('div');
  toastContainer.id = 'toast-container';
  toastContainer.style.cssText = `
    position: fixed; top: 16px; right: 16px; z-index: 99999;
    display: flex; flex-direction: column; gap: 8px; pointer-events: none;
  `;
  document.body.appendChild(toastContainer);
  return toastContainer;
}

export function showToast(title: string, body: string, duration = 4000) {
  const container = getToastContainer();
  const toast = document.createElement('div');
  toast.style.cssText = `
    background: var(--bg-floating, #2b2d31); color: var(--text-primary, #fff);
    border: 1px solid var(--border, #3f4147); border-radius: 8px;
    padding: 12px 16px; min-width: 280px; max-width: 360px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.4); pointer-events: auto;
    animation: slideIn 0.3s ease; font-family: inherit;
  `;
  toast.innerHTML = `
    <div style="font-weight:600;font-size:14px;margin-bottom:2px">${escapeHtml(title)}</div>
    <div style="font-size:13px;color:var(--text-secondary,#b5bac1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(body)}</div>
  `;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'fadeOut 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

function escapeHtml(str: string) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

export function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

export function showDesktopNotification(title: string, body: string) {
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  if (document.hasFocus()) return; // Don't show if app is focused

  const notification = new Notification(title, {
    body,
    icon: '/favicon.ico',
    silent: false,
  });
  notification.onclick = () => {
    window.focus();
    notification.close();
  };
  setTimeout(() => notification.close(), 5000);
}

export function playNotificationSound() {
  try {
    const audio = new Audio('data:audio/wav;base64,UklGRl9vT19teleXBldm10AAAAEABAAEARKAA//8AAIABAAAAAAP//AAAA');
    audio.volume = 0.3;
    audio.play().catch(() => {});
  } catch { /* ignore */ }
}

export function notify(title: string, body: string) {
  showToast(title, body);
  showDesktopNotification(title, body);
}

// Add CSS animation for toasts
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
    @keyframes fadeOut { from { opacity: 1; } to { opacity: 0; transform: translateY(-10px); } }
  `;
  document.head.appendChild(style);
}
