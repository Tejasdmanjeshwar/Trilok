import * as THREE from "three";
import type { AnatomicalGraphV1 } from "@trilok/character-core";

/** C2-only diagnostics: canonical C1 joints, never synthetic skin helpers. */
type Filter = "all" | "left-arm" | "right-arm" | "left-hand" | "right-hand" | "legs" | "spine";
const FILTERS: readonly { id: Filter; title: string }[] = [
  { id: "all", title: "All bones" }, { id: "left-arm", title: "Left arm" },
  { id: "right-arm", title: "Right arm" }, { id: "left-hand", title: "Left hand" },
  { id: "right-hand", title: "Right hand" }, { id: "legs", title: "Legs" },
  { id: "spine", title: "Spine/head" },
];
function sideOf(role: string, id: string): "left" | "right" | undefined {
  const match = /(?:arm|leg)\[(left|right),/.exec(id);
  return (match?.[1] ?? (role.endsWith("_left") ? "left" :
    role.endsWith("_right") ? "right" : undefined)) as "left" | "right" | undefined;
}
function region(role: string, id: string): Filter {
  const side = sideOf(role, id);
  if (role.startsWith("finger_") || role.startsWith("palm_"))
    return side === "left" ? "left-hand" : "right-hand";
  if (/^(clavicle|shoulder|elbow|wrist)_/.test(role))
    return side === "left" ? "left-arm" : "right-arm";
  if (/^(hip|knee|ankle|foot|toe)_/.test(role)) return "legs";
  return "spine";
}
function nameOf(role: string, id: string): string {
  const side = sideOf(role, id);
  const label = role.replace(/^finger_/, "").replace(/_([0-2])$/, " phalanx $1")
    .replace(/_/g, " ");
  return side ? side[0]!.toUpperCase() + side.slice(1) + " " +
    (label.endsWith(" " + side) ? label.slice(0, -side.length - 1) : label) :
    label[0]!.toUpperCase() + label.slice(1);
}
export interface BoneInspectorOptions {
  readonly graph: AnatomicalGraphV1;
  readonly bones: ReadonlyMap<string, THREE.Bone>;
  readonly scene: THREE.Scene;
  readonly camera: THREE.Camera;
  readonly viewport: HTMLElement;
  readonly panel: HTMLElement;
  readonly labels: HTMLElement;
  readonly markerToggle: HTMLInputElement;
  readonly connectionToggle: HTMLInputElement;
}
/** Owns diagnostic geometry, DOM and listeners; call update() after a pose and every orbit frame. */
export class BoneInspector {
  private readonly entries: {
    id: string; role: string; name: string; side: string; category: Filter;
    parentId: string | null; bone: THREE.Bone; marker: THREE.Mesh;
    label: HTMLDivElement; item: HTMLButtonElement;
  }[] = [];
  private readonly markerGeometry = new THREE.SphereGeometry(0.007, 8, 6);
  private readonly leftMaterial = new THREE.MeshBasicMaterial({
    color: 0x47d5f5, depthTest: false, transparent: true, opacity: 0.96,
  });
  private readonly rightMaterial = new THREE.MeshBasicMaterial({
    color: 0xffad63, depthTest: false, transparent: true, opacity: 0.96,
  });
  private readonly centerMaterial = new THREE.MeshBasicMaterial({
    color: 0xe6db9c, depthTest: false,
  });
  private readonly selectedMaterial = new THREE.MeshBasicMaterial({
    color: 0xfff56b, depthTest: false,
  });
  private readonly positions: Float32Array;
  private readonly connectionGeometry = new THREE.BufferGeometry();
  private readonly connectionMaterial = new THREE.LineBasicMaterial({
    color: 0xa4b4c5, transparent: true, opacity: 0.52, depthTest: false,
  });
  private readonly selectionGeometry = new THREE.BufferGeometry();
  private readonly selectionMaterial = new THREE.LineBasicMaterial({
    color: 0xfff56b, depthTest: false,
  });
  private readonly connectionLines: THREE.LineSegments;
  private readonly selectionLine: THREE.Line;
  private readonly pickRay = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly temp = new THREE.Vector3();
  private readonly world = new Map<string, THREE.Vector3>();
  private readonly search: HTMLInputElement;
  private readonly filter: HTMLSelectElement;
  private readonly selectedDetails: HTMLElement;
  private readonly copyButton: HTMLButtonElement;
  private readonly copyIdButton: HTMLButtonElement;
  private readonly list: HTMLElement;
  private readonly onPointerDown = (event: PointerEvent): void => {
    this.pointerStart = { x: event.clientX, y: event.clientY };
  };
  private readonly onPointerUp = (event: PointerEvent): void => {
    if (!this.pointerStart || Math.hypot(event.clientX - this.pointerStart.x,
      event.clientY - this.pointerStart.y) > 7) return;
    this.pointerStart = undefined;
    if (!this.options.markerToggle.checked) return;
    const rect = this.options.viewport.getBoundingClientRect();
    this.pointer.set((event.clientX - rect.left) / rect.width * 2 - 1,
      1 - (event.clientY - rect.top) / rect.height * 2);
    this.pickRay.setFromCamera(this.pointer, this.options.camera);
    const hits = this.pickRay.intersectObjects(this.entries.filter(e =>
      e.marker.visible).map(e => e.marker), false);
    const chosen = this.entries.find(e => e.marker === hits[0]?.object);
    if (chosen) this.select(chosen.id);
  };
  private readonly onSearch = (): void => this.filterList();
  private readonly onToggle = (): void => this.update();
  private readonly onListClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const button = target.closest<HTMLButtonElement>("button[data-bone-id]");
    if (button) this.select(button.dataset.boneId!);
  };
  private readonly onCopy = (): void => { void this.copy(false); };
  private readonly onCopyId = (): void => { void this.copy(true); };
  private pointerStart?: { x: number; y: number };
  private selectedId?: string;
  private disposed = false;

  constructor(private readonly options: BoneInspectorOptions) {
    const { graph, bones, scene, panel, labels } = options;
    panel.replaceChildren();
    labels.replaceChildren();
    const filterLabel = document.createElement("label");
    filterLabel.textContent = "Region ";
    this.filter = document.createElement("select");
    this.filter.setAttribute("aria-label", "Filter bones by region");
    for (const f of FILTERS) this.filter.add(new Option(f.title, f.id));
    filterLabel.append(this.filter);
    const searchLabel = document.createElement("label");
    searchLabel.textContent = "Find bone ";
    this.search = document.createElement("input");
    this.search.type = "search";
    this.search.placeholder = "Wrist, palm, jaw, ID…";
    this.search.setAttribute("aria-label", "Search bone name or semantic ID");
    searchLabel.append(this.search);
    this.list = document.createElement("div");
    this.list.className = "bone-list";
    this.list.setAttribute("role", "group");
    this.list.setAttribute("aria-label", "Selectable semantic bones");
    this.selectedDetails = document.createElement("div");
    this.selectedDetails.className = "bone-details";
    this.selectedDetails.setAttribute("aria-live", "polite");
    this.copyIdButton = document.createElement("button");
    this.copyIdButton.type = "button";
    this.copyIdButton.textContent = "Copy ID";
    this.copyButton = document.createElement("button");
    this.copyButton.type = "button";
    this.copyButton.textContent = "Copy bone report";
    panel.append(filterLabel, searchLabel, this.list, this.selectedDetails,
      this.copyIdButton, this.copyButton);

    const lineVertices = graph.joints.filter(j => j.parentId).length * 6;
    this.positions = new Float32Array(lineVertices);
    this.connectionGeometry.setAttribute("position",
      new THREE.BufferAttribute(this.positions, 3));
    this.connectionLines = new THREE.LineSegments(this.connectionGeometry,
      this.connectionMaterial);
    this.connectionLines.frustumCulled = false;
    this.connectionLines.renderOrder = 9;
    scene.add(this.connectionLines);
    this.selectionGeometry.setAttribute("position",
      new THREE.Float32BufferAttribute(new Float32Array(6), 3));
    this.selectionLine = new THREE.Line(this.selectionGeometry, this.selectionMaterial);
    this.selectionLine.frustumCulled = false;
    this.selectionLine.renderOrder = 12;
    scene.add(this.selectionLine);
    for (const joint of graph.joints) {
      const bone = bones.get(joint.id);
      if (!bone) throw new Error("Inspector missing semantic joint " + joint.id);
      const side = sideOf(joint.role, joint.id);
      const marker = new THREE.Mesh(this.markerGeometry,
        side === "left" ? this.leftMaterial :
        side === "right" ? this.rightMaterial : this.centerMaterial);
      marker.userData.semanticId = joint.id;
      marker.renderOrder = 10;
      scene.add(marker);
      const label = document.createElement("div");
      label.className = "bone-marker-label";
      label.setAttribute("aria-hidden", "true");
      labels.append(label);
      const name = nameOf(joint.role, joint.id);
      const item = document.createElement("button");
      item.type = "button";
      item.dataset.boneId = joint.id;
      item.textContent = name + " · " + joint.role;
      item.title = joint.id;
      this.list.append(item);
      this.entries.push({ id: joint.id, role: joint.role, name, parentId: joint.parentId,
        side: side ?? "center", category: region(joint.role, joint.id),
        bone, marker, label, item });
    }
    this.filter.addEventListener("change", this.onSearch);
    this.search.addEventListener("input", this.onSearch);
    this.list.addEventListener("click", this.onListClick);
    this.copyButton.addEventListener("click", this.onCopy);
    this.copyIdButton.addEventListener("click", this.onCopyId);
    options.viewport.addEventListener("pointerdown", this.onPointerDown);
    options.viewport.addEventListener("pointerup", this.onPointerUp);
    options.markerToggle.addEventListener("change", this.onToggle);
    options.connectionToggle.addEventListener("change", this.onToggle);
    this.filterList();
    const wrist = this.entries.find(e => e.role === "wrist_left");
    if (wrist) this.select(wrist.id);
  }

  private filterList(): void {
    const query = this.search.value.trim().toLowerCase();
    const filter = this.filter.value as Filter;
    for (const entry of this.entries) {
      const visible = (filter === "all" || filter === entry.category ||
        (filter === "left-arm" && entry.category === "left-hand") ||
        (filter === "right-arm" && entry.category === "right-hand")) &&
        (!query || (entry.id + " " + entry.name + " " + entry.role)
          .toLowerCase().includes(query));
      entry.item.hidden = !visible;
    }
    this.update();
  }

  private select(id: string): void {
    const entry = this.entries.find(e => e.id === id);
    if (!entry) return;
    this.selectedId = id;
    for (const e of this.entries) {
      e.item.setAttribute("aria-pressed", String(e.id === id));
      e.marker.material = e.id === id ? this.selectedMaterial :
        e.side === "left" ? this.leftMaterial :
        e.side === "right" ? this.rightMaterial : this.centerMaterial;
    }
    const parent = this.entries.find(e => e.id === entry.parentId);
    this.selectedDetails.replaceChildren();
    for (const [title, value] of [
      ["Name", entry.name], ["Role", entry.role], ["Canonical ID", entry.id],
      ["Side", entry.side], ["Parent", parent?.name ?? "None"],
      ["Parent ID", entry.parentId ?? "None"],
    ]) {
      const line = document.createElement("div");
      const strong = document.createElement("strong");
      strong.textContent = title + ": ";
      const valueText = document.createElement("span");
      valueText.textContent = value ?? "";
      line.append(strong, valueText);
      this.selectedDetails.append(line);
    }
    this.update();
  }

  private async copy(idOnly: boolean): Promise<void> {
    const e = this.entries.find(item => item.id === this.selectedId);
    if (!e) return;
    const parent = this.entries.find(item => item.id === e.parentId);
    const report = idOnly ? e.id :
      e.name + " — " + e.role + " — " + e.id +
      " — parent: " + (parent?.name ?? "none") +
      " (" + (e.parentId ?? "none") + ") — skin issue: ";
    try {
      await navigator.clipboard.writeText(report);
      this.copyButton.textContent = "Copied";
    } catch {
      this.copyButton.textContent = "Clipboard unavailable";
    }
  }

  update(): void {
    if (this.disposed) return;
    const { viewport, camera, markerToggle, connectionToggle } = this.options;
    let offset = 0;
    for (const entry of this.entries) {
      const position = entry.bone.getWorldPosition(this.temp).clone();
      this.world.set(entry.id, position);
      entry.marker.position.copy(position);
      entry.marker.visible = markerToggle.checked &&
        (entry.id === this.selectedId || !entry.item.hidden);
      entry.marker.scale.setScalar(entry.id === this.selectedId ? 1.9 : 1);
    }
    for (const entry of this.entries) {
      if (!entry.parentId) continue;
      const a = this.world.get(entry.parentId)!;
      const b = this.world.get(entry.id)!;
      this.positions.set([a.x, a.y, a.z, b.x, b.y, b.z], offset);
      offset += 6;
    }
    this.connectionGeometry.attributes.position!.needsUpdate = true;
    this.connectionLines.visible = connectionToggle.checked;
    const selected = this.entries.find(e => e.id === this.selectedId);
    const parent = selected?.parentId ? this.world.get(selected.parentId) : undefined;
    const tip = selected ? this.world.get(selected.id) : undefined;
    this.selectionLine.visible = !!(tip && parent);
    if (tip && parent) {
      const p = this.selectionGeometry.getAttribute("position");
      p.setXYZ(0, parent.x, parent.y, parent.z);
      p.setXYZ(1, tip.x, tip.y, tip.z);
      p.needsUpdate = true;
    }
    let shown = 0;
    const bounds = viewport.getBoundingClientRect();
    for (const entry of this.entries) {
      const point = this.world.get(entry.id)!.clone().project(camera);
      const picked = entry.id === this.selectedId;
      // Selected bone always receives a label. Other labels are capped to
      // avoid obscuring the CC0 skin, and follow region/search filtering.
      const visible = markerToggle.checked && (picked ||
        (!entry.item.hidden && shown < 14)) &&
        point.z >= -1 && point.z <= 1 &&
        point.x >= -1 && point.x <= 1 && point.y >= -1 && point.y <= 1;
      entry.label.hidden = !visible;
      if (visible) {
        entry.label.textContent = entry.name + " · " + entry.role;
        entry.label.classList.toggle("selected", picked);
        entry.label.style.left = ((point.x + 1) * 0.5 * bounds.width) + "px";
        entry.label.style.top = ((1 - point.y) * 0.5 * bounds.height) + "px";
        if (!picked) shown++;
      }
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.filter.removeEventListener("change", this.onSearch);
    this.search.removeEventListener("input", this.onSearch);
    this.list.removeEventListener("click", this.onListClick);
    this.copyButton.removeEventListener("click", this.onCopy);
    this.copyIdButton.removeEventListener("click", this.onCopyId);
    this.options.viewport.removeEventListener("pointerdown", this.onPointerDown);
    this.options.viewport.removeEventListener("pointerup", this.onPointerUp);
    this.options.markerToggle.removeEventListener("change", this.onToggle);
    this.options.connectionToggle.removeEventListener("change", this.onToggle);
    for (const entry of this.entries) {
      entry.marker.removeFromParent();
      entry.label.remove();
    }
    this.markerGeometry.dispose();
    this.leftMaterial.dispose();
    this.rightMaterial.dispose();
    this.centerMaterial.dispose();
    this.selectedMaterial.dispose();
    this.connectionLines.removeFromParent();
    this.connectionGeometry.dispose();
    this.connectionMaterial.dispose();
    this.selectionLine.removeFromParent();
    this.selectionGeometry.dispose();
    this.selectionMaterial.dispose();
    this.options.panel.replaceChildren();
  }
}
