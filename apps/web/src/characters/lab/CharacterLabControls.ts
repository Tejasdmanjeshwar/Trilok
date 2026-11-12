import { ANATOMICAL_POSE_MATRIX, type AnatomicalPoseV1 } from "../geometry/AnatomicalPoseMatrix";

/** Presentation-only C2 diagnostic controls. No FK or render state belongs here. */
export type PoseGroup = "all" | "whole" | "upper" | "hands" | "lower" | "head";
export const POSE_GROUPS: readonly { id: PoseGroup; label: string }[] = [
  { id: "all", label: "All regions" },
  { id: "whole", label: "Whole body" },
  { id: "upper", label: "Shoulders & arms" },
  { id: "hands", label: "Hands & wrists" },
  { id: "lower", label: "Hips & legs" },
  { id: "head", label: "Head & neck" },
];
export function poseGroup(pose: AnatomicalPoseV1): Exclude<PoseGroup, "all"> {
  const regions = pose.regions;
  if (pose.id.startsWith("whole-") || pose.id === "crouch-reach" ||
      (regions.includes("shoulder") && regions.includes("hip"))) return "whole";
  if (regions.includes("hand") && !regions.includes("shoulder") &&
      !regions.includes("hip")) return "hands";
  if (regions.includes("hip") || regions.includes("knee") ||
      regions.includes("ankle") || regions.includes("foot")) return "lower";
  if (regions.includes("head") || regions.includes("jaw")) return "head";
  if (regions.includes("spine") && regions.includes("shoulder")) return "whole";
  return "upper";
}
export function findDiagnosticPoses(group: PoseGroup, query: string):
  readonly AnatomicalPoseV1[] {
  const q = query.trim().toLocaleLowerCase();
  return ANATOMICAL_POSE_MATRIX.filter(pose =>
    (group === "all" || poseGroup(pose) === group) &&
    (!q || [pose.id, pose.label, pose.expected, ...pose.regions]
      .join(" ").toLocaleLowerCase().includes(q)));
}

type CameraGroup = "Overview" | "Shoulders & arms" | "Hands" | "Hips & legs" | "Head";
export const LAB_CAMERA_VIEWS: readonly { id: string; label: string; group: CameraGroup }[] = [
  { id: "front", label: "Front", group: "Overview" },
  { id: "side", label: "Side", group: "Overview" },
  { id: "rear", label: "Rear", group: "Overview" },
  { id: "shoulder-left", label: "Left shoulder", group: "Shoulders & arms" },
  { id: "shoulder-right", label: "Right shoulder", group: "Shoulders & arms" },
  { id: "axilla-left", label: "Left armpit", group: "Shoulders & arms" },
  { id: "axilla-right", label: "Right armpit", group: "Shoulders & arms" },
  { id: "elbow-left", label: "Left elbow", group: "Shoulders & arms" },
  { id: "elbow-right", label: "Right elbow", group: "Shoulders & arms" },
  { id: "hand-left", label: "Left hand close-up", group: "Hands" },
  { id: "hand-right", label: "Right hand close-up", group: "Hands" },
  { id: "thumb-web-left", label: "Left thumb web", group: "Hands" },
  { id: "thumb-web-right", label: "Right thumb web", group: "Hands" },
  { id: "hip-left", label: "Left hip / groin", group: "Hips & legs" },
  { id: "hip-right", label: "Right hip / groin", group: "Hips & legs" },
  { id: "knee-left", label: "Left knee", group: "Hips & legs" },
  { id: "knee-right", label: "Right knee", group: "Hips & legs" },
  { id: "ankle-left", label: "Left ankle", group: "Hips & legs" },
  { id: "ankle-right", label: "Right ankle", group: "Hips & legs" },
  { id: "head-front", label: "Face close-up", group: "Head" },
  { id: "head-side", label: "Jaw side close-up", group: "Head" },
];

function requireElement<T extends HTMLElement>(selector: string): T {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error("Character Lab missing control " + selector);
  return node;
}
export interface CharacterLabControls {
  setPose(id: string): void;
  setView(id: string): void;
  dispose(): void;
}
/** Keeps the viewport always visible: 54 pose buttons live in a temporary,
 * searchable, keyboard-operable dialog instead of taking a page of space. */
export function createCharacterLabControls(
  onPose: (id: string) => void, onView: (id: string) => void,
): CharacterLabControls {
  const poseSelect = requireElement<HTMLSelectElement>("#pose-select");
  const viewSelect = requireElement<HTMLSelectElement>("#view-select");
  const browser = requireElement<HTMLElement>("#pose-browser");
  const openButton = requireElement<HTMLButtonElement>("#pose-browser-open");
  const closeButton = requireElement<HTMLButtonElement>("#pose-browser-close");
  const backdrop = requireElement<HTMLElement>("#pose-browser-backdrop");
  const search = requireElement<HTMLInputElement>("#pose-search");
  const group = requireElement<HTMLSelectElement>("#pose-group");
  const list = requireElement<HTMLElement>("#pose-results");
  const empty = requireElement<HTMLElement>("#pose-empty");
  const count = requireElement<HTMLElement>("#pose-result-count");
  const poseLabel = requireElement<HTMLElement>("#active-pose-label");
  const viewLabel = requireElement<HTMLElement>("#active-view-label");
  const reset = requireElement<HTMLButtonElement>("#reset-pose");
  const cleanup: Array<() => void> = [];
  const listen = <T extends EventTarget>(
    target: T, event: string, fn: EventListener,
  ) => {
    target.addEventListener(event, fn);
    cleanup.push(() => target.removeEventListener(event, fn));
  };

  for (const { id, label } of POSE_GROUPS) {
    group.add(new Option(label, id));
    if (id === "all") continue;
    const optgroup = document.createElement("optgroup");
    optgroup.label = label;
    for (const pose of ANATOMICAL_POSE_MATRIX.filter(p => poseGroup(p) === id))
      optgroup.append(new Option(pose.label, pose.id));
    poseSelect.add(optgroup);
  }
  for (const category of ["Overview", "Shoulders & arms", "Hands", "Hips & legs", "Head"] as const) {
    const optgroup = document.createElement("optgroup");
    optgroup.label = category;
    for (const view of LAB_CAMERA_VIEWS.filter(v => v.group === category))
      optgroup.append(new Option(view.label, view.id));
    viewSelect.add(optgroup);
  }
  const buttons = new Map<string, HTMLButtonElement>();
  for (const pose of ANATOMICAL_POSE_MATRIX) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "pose-result";
    button.dataset.pose = pose.id;
    button.setAttribute("aria-pressed", String(pose.id === "neutral"));
    const text = document.createElement("span");
    text.className = "pose-result-label";
    text.textContent = pose.label;
    const description = document.createElement("span");
    description.className = "pose-result-description";
    description.textContent = pose.expected;
    button.append(text, description);
    list.append(button);
    buttons.set(pose.id, button);
  }
  let currentPose = "neutral";
  let currentView = "front";
  let previousFocus: HTMLElement | null = null;

  const refreshList = () => {
    const visible = new Set(findDiagnosticPoses(group.value as PoseGroup, search.value)
      .map(p => p.id));
    for (const [id, button] of buttons) button.hidden = !visible.has(id);
    count.textContent = visible.size + " of " + ANATOMICAL_POSE_MATRIX.length + " poses";
    empty.hidden = visible.size !== 0;
  };
  const close = () => {
    if (browser.hidden) return;
    browser.hidden = true;
    backdrop.hidden = true;
    document.body.classList.remove("pose-browser-open");
    openButton.setAttribute("aria-expanded", "false");
    (previousFocus?.isConnected ? previousFocus : openButton)
      .focus({ preventScroll: true });
    previousFocus = null;
  };
  const open = () => {
    if (!browser.hidden) return;
    previousFocus = document.activeElement instanceof HTMLElement ?
      document.activeElement : openButton;
    browser.hidden = false;
    backdrop.hidden = false;
    document.body.classList.add("pose-browser-open");
    openButton.setAttribute("aria-expanded", "true");
    refreshList();
    search.focus({ preventScroll: true });
  };
  const setPose = (id: string) => {
    const pose = ANATOMICAL_POSE_MATRIX.find(p => p.id === id);
    if (!pose) throw new Error("Unknown Character Lab pose " + id);
    currentPose = id;
    poseSelect.value = id;
    poseLabel.textContent = pose.label;
    for (const [key, button] of buttons)
      button.setAttribute("aria-pressed", String(key === id));
    for (const quick of document.querySelectorAll<HTMLButtonElement>("[data-quick-pose]"))
      quick.setAttribute("aria-pressed", String(quick.dataset.quickPose === id));
  };
  const setView = (id: string) => {
    const view = LAB_CAMERA_VIEWS.find(v => v.id === id);
    if (!view) throw new Error("Unknown Character Lab camera view " + id);
    currentView = id;
    viewSelect.value = id;
    viewLabel.textContent = view.label;
    for (const quick of document.querySelectorAll<HTMLButtonElement>("[data-quick-view]"))
      quick.setAttribute("aria-pressed", String(quick.dataset.quickView === id));
  };
  const choosePose = (id: string) => {
    if (id === currentPose) { close(); return; }
    onPose(id);
    setPose(id);
    close();
  };
  const chooseView = (id: string) => {
    if (id === currentView) return;
    onView(id);
    setView(id);
  };
  listen(openButton, "click", () => open());
  listen(closeButton, "click", () => close());
  listen(backdrop, "click", () => close());
  listen(search, "input", refreshList);
  listen(group, "change", refreshList);
  listen(poseSelect, "change", () => choosePose(poseSelect.value));
  listen(viewSelect, "change", () => chooseView(viewSelect.value));
  listen(reset, "click", () => choosePose("neutral"));
  listen(list, "click", (event: Event) => {
    const node = event.target;
    if (!(node instanceof Element)) return;
    const button = node.closest<HTMLButtonElement>("[data-pose]");
    if (button && !button.hidden) choosePose(button.dataset.pose!);
  });
  for (const quick of document.querySelectorAll<HTMLButtonElement>("[data-quick-pose]"))
    listen(quick, "click", () => choosePose(quick.dataset.quickPose!));
  for (const quick of document.querySelectorAll<HTMLButtonElement>("[data-quick-view]"))
    listen(quick, "click", () => chooseView(quick.dataset.quickView!));

  listen(document, "keydown", (event: Event) => {
    const key = event as KeyboardEvent;
    if (browser.hidden) return;
    if (key.key === "Escape") { key.preventDefault(); close(); return; }
    if (key.key !== "Tab") return;
    const focusable = [closeButton, search, group, ...buttons.values()].filter(
      node => !node.hidden && !node.hasAttribute("disabled"));
    if (!focusable.length) return;
    const first = focusable[0]!, last = focusable.at(-1)!;
    if (key.shiftKey && document.activeElement === first) {
      key.preventDefault(); last.focus();
    } else if (!key.shiftKey && document.activeElement === last) {
      key.preventDefault(); first.focus();
    }
  });
  refreshList();
  setPose(currentPose);
  setView(currentView);
  return {
    setPose, setView,
    dispose() {
      close();
      for (const remove of cleanup.reverse()) remove();
      buttons.clear();
      list.replaceChildren();
      poseSelect.replaceChildren();
      viewSelect.replaceChildren();
      group.replaceChildren();
    },
  };
}
