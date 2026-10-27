/**
 * @ember/editor — the standalone native editor.
 *
 * `native/` owns the Win32 window, GDI preview and the authoring UI; it is only imported by
 * the editor command and by the compiled `EmberEngine.exe`. Game loading and scene file I/O
 * are owned by `@ember/gameloader`, not duplicated here.
 */

export { NativeEditor, runNativeEditor, type NativeEditorOptions } from "./native/app.ts";
export * from "./examples.ts";
