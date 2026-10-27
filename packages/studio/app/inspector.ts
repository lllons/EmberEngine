/**
 * @ember/studio/app/inspector.ts — the component inspector.
 *
 * Owner: this file owns how a component's data becomes editable UI. A schema table describes
 * the engine's components; anything without a schema (including game-defined components) gets
 * a JSON editor built from its live value, so new components are inspectable for free.
 */

import { componentByName, componentNames, Theme } from "@ember/core";
import {
  button,
  checkbox,
  clear,
  colorField,
  el,
  jsonArea,
  numberField,
  row,
  select,
  textField,
} from "./dom.ts";
import type { EditorSession } from "./session.ts";

type FieldKind =
  | { kind: "number"; path: string; label: string; step?: number; min?: number; max?: number }
  | { kind: "text"; path: string; label: string }
  | { kind: "color"; path: string; label: string }
  | { kind: "bool"; path: string; label: string }
  | { kind: "select"; path: string; label: string; options: readonly string[] }
  | { kind: "json"; path: string; label: string };

const SCHEMA: Record<string, FieldKind[]> = {
  Name: [{ kind: "text", path: "value", label: "value" }],
  Tag: [{ kind: "text", path: "value", label: "value" }],
  Visibility: [{ kind: "bool", path: "visible", label: "visible" }],
  Parent: [{ kind: "number", path: "entity", label: "entity", step: 1 }],
  Transform: [
    { kind: "number", path: "position.x", label: "x", step: 1 },
    { kind: "number", path: "position.y", label: "y", step: 1 },
    { kind: "number", path: "rotation", label: "rotation°", step: 5 },
    { kind: "number", path: "scale.x", label: "scale x", step: 0.1 },
    { kind: "number", path: "scale.y", label: "scale y", step: 0.1 },
  ],
  Transform3D: [
    { kind: "number", path: "position.x", label: "x", step: 1 },
    { kind: "number", path: "position.y", label: "y", step: 1 },
    { kind: "number", path: "position.z", label: "z", step: 1 },
    { kind: "number", path: "rotation.y", label: "yaw°", step: 5 },
    { kind: "number", path: "scale.x", label: "scale", step: 0.1 },
  ],
  Sprite: [
    { kind: "text", path: "texture", label: "texture" },
    { kind: "number", path: "width", label: "width", step: 1, min: 1 },
    { kind: "number", path: "height", label: "height", step: 1, min: 1 },
    { kind: "color", path: "tint", label: "tint" },
    { kind: "number", path: "layer", label: "layer", step: 1 },
    { kind: "number", path: "alpha", label: "alpha", step: 0.1, min: 0, max: 1 },
    { kind: "bool", path: "flipX", label: "flip x" },
    { kind: "number", path: "frameCount", label: "frames", step: 1, min: 1 },
    { kind: "number", path: "framesPerSecond", label: "fps", step: 1 },
  ],
  RectShape: [
    { kind: "number", path: "width", label: "width", step: 1, min: 1 },
    { kind: "number", path: "height", label: "height", step: 1, min: 1 },
    { kind: "color", path: "color", label: "color" },
    { kind: "number", path: "layer", label: "layer", step: 1 },
    { kind: "bool", path: "filled", label: "filled" },
    { kind: "number", path: "strokeWidth", label: "stroke", step: 1 },
    { kind: "number", path: "alpha", label: "alpha", step: 0.1, min: 0, max: 1 },
  ],
  CircleShape: [
    { kind: "number", path: "radius", label: "radius", step: 1, min: 0 },
    { kind: "color", path: "color", label: "color" },
    { kind: "number", path: "layer", label: "layer", step: 1 },
    { kind: "bool", path: "filled", label: "filled" },
    { kind: "number", path: "alpha", label: "alpha", step: 0.1, min: 0, max: 1 },
  ],
  TextLabel: [
    { kind: "text", path: "text", label: "text" },
    { kind: "number", path: "size", label: "size", step: 1, min: 1 },
    { kind: "color", path: "color", label: "color" },
    { kind: "select", path: "align", label: "align", options: ["left", "center", "right"] },
    { kind: "select", path: "baseline", label: "baseline", options: ["top", "middle", "bottom"] },
    { kind: "number", path: "layer", label: "layer", step: 1 },
  ],
  Velocity: [
    { kind: "number", path: "x", label: "x", step: 10 },
    { kind: "number", path: "y", label: "y", step: 10 },
    { kind: "number", path: "angular", label: "angular", step: 1 },
  ],
  RigidBody: [
    { kind: "select", path: "type", label: "type", options: ["dynamic", "kinematic", "static"] },
    { kind: "number", path: "gravityScale", label: "gravity", step: 0.1 },
    { kind: "number", path: "friction", label: "friction", step: 0.05, min: 0, max: 1 },
    { kind: "number", path: "maxSpeed", label: "max speed", step: 10, min: 0 },
    { kind: "number", path: "restitution", label: "restitution", step: 0.05, min: 0, max: 1 },
    { kind: "bool", path: "grounded", label: "grounded (runtime)" },
  ],
  BoxCollider: [
    { kind: "number", path: "width", label: "width", step: 1, min: 1 },
    { kind: "number", path: "height", label: "height", step: 1, min: 1 },
    { kind: "number", path: "offset.x", label: "offset x", step: 1 },
    { kind: "number", path: "offset.y", label: "offset y", step: 1 },
    { kind: "bool", path: "solid", label: "solid" },
    { kind: "bool", path: "trigger", label: "trigger" },
    { kind: "bool", path: "enabled", label: "enabled" },
  ],
  Script: [
    { kind: "text", path: "name", label: "script" },
    { kind: "json", path: "props", label: "props" },
  ],
  Lifetime: [
    { kind: "number", path: "ttl", label: "ttl (s)", step: 0.1, min: 0 },
    { kind: "number", path: "remaining", label: "remaining", step: 0.1 },
  ],
  MeshRenderer: [
    { kind: "text", path: "mesh", label: "mesh" },
    { kind: "color", path: "color", label: "color" },
    { kind: "number", path: "layer", label: "layer", step: 1 },
  ],
};

export interface InspectorCallbacks {
  onField(component: string, path: string, value: unknown): void;
  onReplace(component: string, value: object): void;
  onAddComponent(name: string): void;
  onRemoveComponent(name: string): void;
  onRename(name: string): void;
}

function readPath(value: object, path: string): unknown {
  let cursor: unknown = value;
  for (const key of path.split(".")) {
    if (!cursor || typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string, unknown>)[key];
  }
  return cursor;
}

/** Renders the selection's components into `container`. */
export function renderInspector(
  container: HTMLElement,
  session: EditorSession,
  callbacks: InspectorCallbacks,
  options: { scriptNames?: readonly string[] } = {},
): void {
  clear(container);
  const entity = session.selection;
  if (entity === null) {
    container.append(el("p", { className: "muted", text: "no entity selected" }));
    return;
  }

  container.append(
    el("div", { className: "entity-head" }, [
      el("span", { className: "entity-id", text: `#${entity}` }),
      textField(session.selectedName, (name) => callbacks.onRename(name), { placeholder: "name" }),
    ]),
  );

  for (const component of session.selectedComponents()) {
    const section = el("div", { className: "component" });
    const header = el("div", { className: "component-head" }, [
      el("span", { className: "component-title", text: component.name }),
      button("×", () => callbacks.onRemoveComponent(component.name), {
        title: `remove ${component.name}`,
        kind: "danger",
      }),
    ]);
    section.append(header);

    const fields = SCHEMA[component.name];
    if (fields) {
      for (const field of fields) {
        section.append(renderField(component.name, component.value, field, callbacks, options));
      }
    } else {
      section.append(
        row(
          "json",
          jsonArea(component.value, (parsed) => callbacks.onReplace(component.name, parsed as object)),
          { hint: "this component has no schema; edit its JSON directly" },
        ),
      );
    }
    container.append(section);
  }

  // Add-component menu: every registered component the entity does not already have.
  const present = new Set(session.scene.world.componentsOf(entity));
  const missing = componentNames().filter((name) => !present.has(name));
  if (missing.length > 0) {
    const add = el("select", { className: "field" });
    add.append(el("option", { text: "add component…" }));
    for (const name of missing) {
      const option = el("option", { text: name });
      option.value = name;
      add.append(option);
    }
    add.addEventListener("change", () => {
      if (add.value) callbacks.onAddComponent(add.value);
    });
    container.append(el("div", { className: "component add" }, [add]));
  }
}

function renderField(
  componentName: string,
  value: object,
  field: FieldKind,
  callbacks: InspectorCallbacks,
  options: { scriptNames?: readonly string[] },
): HTMLElement {
  const current = readPath(value, field.path);
  switch (field.kind) {
    case "number": {
      const number = typeof current === "number" ? current : 0;
      const display = field.label.includes("°") && componentName.startsWith("Transform")
        ? Math.round((number * 180) / Math.PI * 100) / 100
        : number;
      return row(
        field.label,
        numberField(display, (next) => {
          const isDegrees = field.label.includes("°");
          callbacks.onField(componentName, field.path, isDegrees ? (next * Math.PI) / 180 : next);
        }, { step: field.step, min: field.min, max: field.max }),
      );
    }
    case "text":
      return row(
        field.label,
        field.path === "name" && componentName === "Script"
          ? scriptNameField(String(current ?? ""), callbacks, options, componentName)
          : textField(String(current ?? ""), (next) => callbacks.onField(componentName, field.path, next)),
      );
    case "color":
      return row(
        field.label,
        colorField(String(current ?? Theme.highlight), (next) => callbacks.onField(componentName, field.path, next)),
      );
    case "bool":
      return row(
        field.label,
        checkbox(Boolean(current), (next) => callbacks.onField(componentName, field.path, next)),
      );
    case "select":
      return row(
        field.label,
        select(
          String(current ?? field.options[0]),
          field.options,
          (next) => callbacks.onField(componentName, field.path, next),
        ),
      );
    case "json":
      return row(
        field.label,
        jsonArea(current ?? {}, (parsed) => callbacks.onField(componentName, field.path, parsed)),
        { hint: "JSON must stay valid; invalid text is marked red" },
      );
  }
}

/** Script names come from the game's registry, offered as a datalist. */
function scriptNameField(
  current: string,
  callbacks: InspectorCallbacks,
  options: { scriptNames?: readonly string[] },
  componentName: string,
): HTMLInputElement {
  const listId = "script-names";
  let list = document.getElementById(listId) as HTMLDataListElement | null;
  if (!list) {
    list = el("datalist");
    list.id = listId;
    document.body.append(list);
  }
  clear(list);
  for (const name of options.scriptNames ?? []) {
    const option = el("option");
    option.value = name;
    list.append(option);
  }
  const input = textField(current, (next) => callbacks.onField(componentName, "name", next), {
    placeholder: "script name",
  });
  input.setAttribute("list", listId);
  return input;
}

/** Component names with a schema (used by tests and the panel's docs line). */
export function schemaComponentNames(): string[] {
  return Object.keys(SCHEMA).sort();
}

/** True when the component can be inspected without falling back to JSON. */
export function hasSchema(name: string): boolean {
  return name in SCHEMA;
}

/** Registry-backed lookup so panels can list components without importing core directly. */
export function registeredComponents(): string[] {
  return componentNames();
}

export function componentExists(name: string): boolean {
  return componentByName(name) !== undefined;
}
