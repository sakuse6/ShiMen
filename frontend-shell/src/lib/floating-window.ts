const floatingWindows = new Map<string, Window>();
const FLOAT_WIDTH = 320;
const FLOAT_HEIGHT = 120;
const FLOAT_GAP = 8;

export async function openFloatingSession(
  sessionId: string,
  sessionName: string,
  agentId: string,
  projectEncoded: string,
  agentName?: string,
) {
  // If already open, focus it
  const existing = floatingWindows.get(sessionId);
  if (existing) {
    try {
      existing.focus();
      return;
    } catch {
      floatingWindows.delete(sessionId);
    }
  }

  // Calculate position: outside main window's left edge, stacked vertically
  let x = 20, y = 20;
  if (typeof window !== "undefined") {
    x = Math.max(window.screenX - FLOAT_WIDTH - FLOAT_GAP, 20);
    y = Math.max(window.screenY, 20);
  }

  // Stack multiple floating windows vertically
  const existingCount = floatingWindows.size;
  y += existingCount * (FLOAT_HEIGHT + FLOAT_GAP);

  const url = `index.html?floating=${sessionId}&name=${encodeURIComponent(sessionName)}&agent=${encodeURIComponent(agentId)}&project=${encodeURIComponent(projectEncoded)}&agentName=${encodeURIComponent(agentName ?? agentId)}`;
  const features = [
    `popup=yes`,
    `width=${FLOAT_WIDTH}`,
    `height=${FLOAT_HEIGHT}`,
    `left=${x}`,
    `top=${y}`,
    `resizable=yes`,
  ].join(",");
  const popup = typeof window !== "undefined" ? window.open(url, `floating-${sessionId.slice(0, 8)}`, features) : null;

  if (!popup) {
    throw new Error("Failed to open floating session window in phase 0 shell.");
  }

  popup.document.title = sessionName;
  floatingWindows.set(sessionId, popup);
}

export function closeFloatingSession(sessionId: string) {
  const win = floatingWindows.get(sessionId);
  if (win) {
    win.close();
    floatingWindows.delete(sessionId);
  }
}

export function isFloatingOpen(sessionId: string): boolean {
  return floatingWindows.has(sessionId);
}
