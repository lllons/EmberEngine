/**
 * @ember/editor/native/win32 — the smallest Win32 surface the native editor needs.
 *
 * Owner: this file owns "how the editor becomes a real window". It binds user32/gdi32/
 * kernel32 through Deno FFI, creates one top-level window, pumps its message loop and
 * hands painting to a GDI canvas. No browser, no server, no webview.
 *
 * The bindings are deliberately narrow: if a control or message is not used by the editor,
 * it is not declared here. Everything runs on the UI thread, so message handlers may call
 * back into editor state directly.
 */

import { GdiCanvas } from "./gdi.ts";

export const WM_PAINT = 0x000f;
export const WM_DESTROY = 0x0002;
export const WM_CLOSE = 0x0010;
export const WM_ERASEBKGND = 0x0014;
export const WM_SIZE = 0x0005;
export const WM_MOUSEMOVE = 0x0200;
export const WM_LBUTTONDOWN = 0x0201;
export const WM_LBUTTONUP = 0x0202;
export const WM_RBUTTONDOWN = 0x0204;
export const WM_RBUTTONUP = 0x0205;
export const WM_MBUTTONDOWN = 0x0207;
export const WM_MBUTTONUP = 0x0208;
export const WM_MOUSEWHEEL = 0x020a;
export const WM_KEYDOWN = 0x0100;
export const WM_KEYUP = 0x0101;
export const WM_CHAR = 0x0102;
export const WM_KILLFOCUS = 0x0008;
export const WM_QUIT = 0x0012;

export const VK_BACK = 0x08;
export const VK_TAB = 0x09;
export const VK_RETURN = 0x0d;
export const VK_SHIFT = 0x10;
export const VK_CONTROL = 0x11;
export const VK_ESCAPE = 0x1b;
export const VK_END = 0x23;
export const VK_HOME = 0x24;
export const VK_LEFT = 0x25;
export const VK_UP = 0x26;
export const VK_RIGHT = 0x27;
export const VK_DOWN = 0x28;
export const VK_DELETE = 0x2e;

export interface Message {
  hwnd: Deno.PointerValue;
  msg: number;
  wParam: number;
  lParam: number;
  /** Mouse position in client coordinates for mouse messages. */
  mouseX: number;
  mouseY: number;
  /** Wheel delta divided by WHEEL_DELTA (usually 120). */
  wheelDelta: number;
}

export interface WindowOptions {
  title: string;
  width?: number;
  height?: number;
  onPaint: (canvas: GdiCanvas, width: number, height: number) => void;
  onMessage: (message: Message) => boolean;
  /** Return false to veto closing (for example, to confirm unsaved work). */
  onClose?: () => boolean;
}

export interface ClientSize {
  width: number;
  height: number;
}

type WndProc = (hwnd: Deno.PointerValue, msg: number, wParam: number, lParam: number) => number;

const use = Deno.UnsafePointer;

function wide(text: string): Uint16Array {
  const buffer = new Uint16Array(text.length + 1);
  for (let index = 0; index < text.length; index++) buffer[index] = text.charCodeAt(index);
  return buffer;
}

function pointerValue(pointer: Deno.PointerValue): bigint {
  return pointer === null ? 0n : BigInt(Deno.UnsafePointer.value(pointer));
}

function signedWord(value: number): number {
  const word = value & 0xffff;
  return word > 0x7fff ? word - 0x10000 : word;
}

export class Win32Window {
  readonly user32 = Deno.dlopen("user32.dll", {
    RegisterClassExW: { parameters: ["pointer"], result: "u16" },
    CreateWindowExW: {
      parameters: [
        "u32",
        "pointer",
        "pointer",
        "u32",
        "i32",
        "i32",
        "i32",
        "i32",
        "pointer",
        "pointer",
        "pointer",
        "pointer",
      ],
      result: "pointer",
    },
    ShowWindow: { parameters: ["pointer", "i32"], result: "i32" },
    UpdateWindow: { parameters: ["pointer"], result: "i32" },
    DefWindowProcW: { parameters: ["pointer", "u32", "usize", "isize"], result: "isize" },
    DestroyWindow: { parameters: ["pointer"], result: "i32" },
    PostQuitMessage: { parameters: ["i32"], result: "void" },
    PeekMessageW: { parameters: ["pointer", "pointer", "u32", "u32", "u32"], result: "i32" },
    TranslateMessage: { parameters: ["pointer"], result: "i32" },
    DispatchMessageW: { parameters: ["pointer"], result: "isize" },
    LoadCursorW: { parameters: ["pointer", "pointer"], result: "pointer" },
    BeginPaint: { parameters: ["pointer", "pointer"], result: "pointer" },
    EndPaint: { parameters: ["pointer", "pointer"], result: "i32" },
    GetClientRect: { parameters: ["pointer", "pointer"], result: "i32" },
    InvalidateRect: { parameters: ["pointer", "pointer", "i32"], result: "i32" },
    ScreenToClient: { parameters: ["pointer", "pointer"], result: "i32" },
    SetCapture: { parameters: ["pointer"], result: "pointer" },
    ReleaseCapture: { parameters: [], result: "i32" },
    SetWindowTextW: { parameters: ["pointer", "pointer"], result: "i32" },
    MessageBoxW: { parameters: ["pointer", "pointer", "pointer", "u32"], result: "i32" },
    GetSystemMetrics: { parameters: ["i32"], result: "i32" },
    SetProcessDPIAware: { parameters: [], result: "i32" },
  });

  readonly gdi32 = Deno.dlopen("gdi32.dll", {
    CreateCompatibleDC: { parameters: ["pointer"], result: "pointer" },
    CreateCompatibleBitmap: { parameters: ["pointer", "i32", "i32"], result: "pointer" },
    DeleteDC: { parameters: ["pointer"], result: "i32" },
    SelectObject: { parameters: ["pointer", "pointer"], result: "pointer" },
    DeleteObject: { parameters: ["pointer"], result: "i32" },
    BitBlt: {
      parameters: ["pointer", "i32", "i32", "i32", "i32", "pointer", "i32", "i32", "u32"],
      result: "i32",
    },
    CreateSolidBrush: { parameters: ["u32"], result: "pointer" },
    CreatePen: { parameters: ["i32", "i32", "u32"], result: "pointer" },
    GetStockObject: { parameters: ["i32"], result: "pointer" },
    Rectangle: { parameters: ["pointer", "i32", "i32", "i32", "i32"], result: "i32" },
    Ellipse: { parameters: ["pointer", "i32", "i32", "i32", "i32"], result: "i32" },
    Polygon: { parameters: ["pointer", "pointer", "i32"], result: "i32" },
    MoveToEx: { parameters: ["pointer", "i32", "i32", "pointer"], result: "i32" },
    LineTo: { parameters: ["pointer", "i32", "i32"], result: "i32" },
    CreateFontW: {
      parameters: [
        "i32",
        "i32",
        "i32",
        "i32",
        "i32",
        "i32",
        "i32",
        "i32",
        "i32",
        "i32",
        "i32",
        "i32",
        "i32",
        "pointer",
      ],
      result: "pointer",
    },
    SetTextColor: { parameters: ["pointer", "u32"], result: "u32" },
    SetBkMode: { parameters: ["pointer", "i32"], result: "i32" },
    TextOutW: { parameters: ["pointer", "i32", "i32", "pointer", "i32"], result: "i32" },
    GetTextExtentPoint32W: { parameters: ["pointer", "pointer", "i32", "pointer"], result: "i32" },
    SaveDC: { parameters: ["pointer"], result: "i32" },
    RestoreDC: { parameters: ["pointer", "i32"], result: "i32" },
    IntersectClipRect: { parameters: ["pointer", "i32", "i32", "i32", "i32"], result: "i32" },
  });

  readonly kernel32 = Deno.dlopen("kernel32.dll", {
    GetModuleHandleW: { parameters: ["pointer"], result: "pointer" },
    GetConsoleWindow: { parameters: [], result: "pointer" },
    FreeConsole: { parameters: [], result: "i32" },
  });

  readonly hwnd: Deno.PointerValue;
  running = true;
  private readonly wndProc: Deno.UnsafeCallback<{
    parameters: ["pointer", "u32", "usize", "isize"];
    result: "isize";
  }>;
  private readonly options: WindowOptions;
  private readonly messageBuffer = new Uint8Array(48);
  private readonly messageView = new DataView(this.messageBuffer.buffer);
  private paintError: string | null = null;

  constructor(options: WindowOptions) {
    this.options = options;
    // Draw at physical pixels: without this Windows bitmap-stretches the whole window on
    // high-DPI displays, which blurs text and makes mouse hit-testing drift.
    this.user32.symbols.SetProcessDPIAware();
    const screenWidth = this.user32.symbols.GetSystemMetrics(0);
    const screenHeight = this.user32.symbols.GetSystemMetrics(1);
    const width = Math.min(options.width ?? 1440, Math.max(900, screenWidth - 60));
    const height = Math.min(options.height ?? 900, Math.max(640, screenHeight - 90));

    const className = wide(`EmberEditorWindow${Deno.pid}`);
    this.wndProc = new Deno.UnsafeCallback(
      { parameters: ["pointer", "u32", "usize", "isize"], result: "isize" },
      (hwnd, msg, wParam, lParam) =>
        BigInt(this.handleMessage(hwnd, msg, Number(wParam), Number(lParam))),
    );

    const windowClass = new Uint8Array(80);
    const view = new DataView(windowClass.buffer);
    view.setUint32(0, 80, true);
    view.setUint32(4, 3, true);
    view.setBigUint64(8, pointerValue(this.wndProc.pointer), true);
    view.setBigUint64(
      24,
      pointerValue(this.kernel32.symbols.GetModuleHandleW(null)),
      true,
    );
    view.setBigUint64(
      40,
      pointerValue(this.user32.symbols.LoadCursorW(null, use.create(32512n))),
      true,
    );
    view.setBigUint64(48, 6n, true);
    view.setBigUint64(64, pointerValue(use.of(className)), true);

    this.user32.symbols.RegisterClassExW(use.of(windowClass));
    this.hwnd = this.user32.symbols.CreateWindowExW(
      0,
      use.of(className),
      use.of(wide(options.title)),
      0x00cf0000 | 0x10000000,
      30,
      30,
      width,
      height,
      null,
      null,
      this.kernel32.symbols.GetModuleHandleW(null),
      null,
    );
    if (!this.hwnd) throw new Error("CreateWindowExW failed");
    this.user32.symbols.ShowWindow(this.hwnd, 5);
    this.user32.symbols.UpdateWindow(this.hwnd);
  }

  /**
   * Detaches the console a compiled Deno binary opens by default. FreeConsole closes the
   * throwaway console on double-click but leaves an inherited terminal (cmd/PowerShell)
   * running, which ShowWindow would hide out from under the user.
   */
  hideConsole(): void {
    if (this.kernel32.symbols.GetConsoleWindow()) this.kernel32.symbols.FreeConsole();
  }

  clientSize(): ClientSize {
    const rect = new Uint8Array(16);
    this.user32.symbols.GetClientRect(this.hwnd, use.of(rect));
    const view = new DataView(rect.buffer);
    return { width: view.getInt32(8, true), height: view.getInt32(12, true) };
  }

  setTitle(title: string): void {
    this.user32.symbols.SetWindowTextW(this.hwnd, use.of(wide(title)));
  }

  /** Invalidates and immediately repaints the window. */
  repaint(): void {
    this.user32.symbols.InvalidateRect(this.hwnd, null, 0);
    this.user32.symbols.UpdateWindow(this.hwnd);
  }

  /** Processes every pending message; returns false once the window has closed. */
  pump(): boolean {
    while (
      this.user32.symbols.PeekMessageW(use.of(this.messageBuffer), null, 0, 0, 1) // PM_REMOVE
    ) {
      const message = this.messageView.getUint32(8, true);
      if (message === WM_QUIT) {
        this.running = false;
        break;
      }
      this.user32.symbols.TranslateMessage(use.of(this.messageBuffer));
      this.user32.symbols.DispatchMessageW(use.of(this.messageBuffer));
    }
    return this.running;
  }

  captureMouse(): void {
    this.user32.symbols.SetCapture(this.hwnd);
  }

  releaseMouse(): void {
    this.user32.symbols.ReleaseCapture();
  }

  messageBox(text: string, caption = "EmberEngine"): void {
    this.user32.symbols.MessageBoxW(this.hwnd, use.of(wide(text)), use.of(wide(caption)), 0x10);
  }

  /** Yes/no question; true when the user chose Yes. */
  confirm(text: string, caption = "EmberEngine"): boolean {
    // MB_YESNO (0x04) | MB_ICONQUESTION (0x20); IDYES is 6.
    return this.user32.symbols.MessageBoxW(
      this.hwnd,
      use.of(wide(text)),
      use.of(wide(caption)),
      0x04 | 0x20,
    ) === 6;
  }

  dispose(): void {
    if (this.hwnd) this.user32.symbols.DestroyWindow(this.hwnd);
    this.wndProc.close();
    this.user32.close();
    this.gdi32.close();
    this.kernel32.close();
  }

  private handleMessage(
    hwnd: Deno.PointerValue,
    msg: number,
    wParam: number,
    lParam: number,
  ): number {
    if (msg === WM_PAINT) {
      this.paint(hwnd);
      return 0;
    }
    if (msg === WM_ERASEBKGND) return 1;
    if (msg === WM_DESTROY) {
      this.running = false;
      this.user32.symbols.PostQuitMessage(0);
      return 0;
    }
    if (msg === WM_CLOSE) {
      if (this.options.onClose && !this.options.onClose()) return 0;
      this.user32.symbols.DestroyWindow(hwnd);
      return 0;
    }

    const isMouse = msg === WM_MOUSEMOVE || msg === WM_LBUTTONDOWN || msg === WM_LBUTTONUP ||
      msg === WM_RBUTTONDOWN || msg === WM_RBUTTONUP || msg === WM_MBUTTONDOWN ||
      msg === WM_MBUTTONUP;
    const message: Message = {
      hwnd,
      msg,
      wParam,
      lParam,
      mouseX: isMouse ? signedWord(lParam) : 0,
      mouseY: isMouse ? signedWord(lParam >> 16) : 0,
      wheelDelta: 0,
    };
    if (msg === WM_MOUSEWHEEL) {
      const delta = signedWord(wParam >> 16);
      message.wheelDelta = delta / 120;
      const point = new Uint8Array(8);
      const view = new DataView(point.buffer);
      view.setInt32(0, signedWord(lParam), true);
      view.setInt32(4, signedWord(lParam >> 16), true);
      this.user32.symbols.ScreenToClient(hwnd, use.of(point));
      message.mouseX = view.getInt32(0, true);
      message.mouseY = view.getInt32(4, true);
    }
    if (this.options.onMessage(message)) return 0;
    return Number(
      this.user32.symbols.DefWindowProcW(hwnd, msg, BigInt(wParam), BigInt(lParam)),
    );
  }

  private paint(hwnd: Deno.PointerValue): void {
    const paintStruct = new Uint8Array(72);
    const hdc = this.user32.symbols.BeginPaint(hwnd, use.of(paintStruct));
    const size = this.clientSize();
    if (!hdc || size.width <= 0 || size.height <= 0) {
      this.user32.symbols.EndPaint(hwnd, use.of(paintStruct));
      return;
    }

    const memory = this.gdi32.symbols.CreateCompatibleDC(hdc);
    const bitmap = this.gdi32.symbols.CreateCompatibleBitmap(hdc, size.width, size.height);
    const previous = this.gdi32.symbols.SelectObject(memory, bitmap);
    const canvas = new GdiCanvas(this.gdi32, memory);
    try {
      this.options.onPaint(canvas, size.width, size.height);
      if (this.paintError) {
        canvas.fillRect(0, 0, size.width, 24, "#5a1622");
        canvas.text(8, 4, this.paintError, 12, "#ffd7de");
        this.paintError = null;
      }
    } catch (error) {
      this.paintError = `paint error: ${(error as Error).message}`;
    } finally {
      canvas.dispose();
      this.gdi32.symbols.BitBlt(
        hdc,
        0,
        0,
        size.width,
        size.height,
        memory,
        0,
        0,
        0x00cc0020,
      );
      this.gdi32.symbols.SelectObject(memory, previous);
      this.gdi32.symbols.DeleteObject(bitmap);
      this.gdi32.symbols.DeleteDC(memory);
      this.user32.symbols.EndPaint(hwnd, use.of(paintStruct));
    }
  }
}

/** A window class plus its message loop, suitable for a long-lived editor process. */
export function openWindow(options: WindowOptions): Win32Window {
  const window = new Win32Window(options);
  let debug = false;
  try {
    debug = Deno.env.get("EMBER_DEBUG") === "1";
  } catch {
    // No env permission: keep the console visible so startup errors are readable.
  }
  if (!debug) window.hideConsole();
  window.repaint();
  return window;
}

export type { WndProc };
