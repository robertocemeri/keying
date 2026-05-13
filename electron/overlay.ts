import { BrowserWindow, screen } from "electron";
import path from "path";

const WIDTH = 620;
const HEIGHT = 420;

let overlayWindow: BrowserWindow | null = null;
let isDev = false;

export function setOverlayDev(dev: boolean) {
  isDev = dev;
}

function centerOnActiveDisplay(): { x: number; y: number } {
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const { x, y, width, height } = display.workArea;
  return {
    x: Math.round(x + (width - WIDTH) / 2),
    y: Math.round(y + (height - HEIGHT) / 3),
  };
}

export function createOverlay(): void {
  if (overlayWindow && !overlayWindow.isDestroyed()) return;

  overlayWindow = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    frame: false,
    resizable: false,
    movable: false,
    show: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: true,
    backgroundColor: "#0a0a0c",
    title: "Keying Quick Search",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Keep above other apps (including full-screen)
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  if (isDev) {
    overlayWindow.loadURL("http://localhost:5173/#/overlay");
  } else {
    overlayWindow.loadFile(path.join(__dirname, "../dist/index.html"), { hash: "/overlay" });
  }

  overlayWindow.on("blur", () => {
    hideOverlay();
  });

  overlayWindow.on("closed", () => {
    overlayWindow = null;
  });
}

export function showOverlay(): void {
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    createOverlay();
  }
  if (!overlayWindow) return;
  const { x, y } = centerOnActiveDisplay();
  overlayWindow.setBounds({ x, y, width: WIDTH, height: HEIGHT });
  overlayWindow.show();
  overlayWindow.focus();
  overlayWindow.webContents.send("overlay:shown");
}

export function hideOverlay(): void {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  if (overlayWindow.isVisible()) overlayWindow.hide();
}

export function toggleOverlay(): void {
  if (overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.isVisible()) {
    hideOverlay();
  } else {
    showOverlay();
  }
}

export function destroyOverlay(): void {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.destroy();
  }
  overlayWindow = null;
}
