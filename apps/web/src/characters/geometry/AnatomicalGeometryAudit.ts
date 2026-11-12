import * as THREE from "three";
import type { AnatomicalHuman } from "./AnatomicalTemplate";

/**
 * C2.5 immutable whole-body diagnostic reference, based on the exact indexed
 * pinned CC0 body surface. No WebGL; evaluates Three.js CPU skinning.
 * Surface area/absolute enclosed signed volume are descriptive statistics,
 * not an anatomical-quality threshold or reliable self-intersection detector.
 */
export const ANATOMICAL_GEOMETRY_AUDIT_VERSION = 1 as const;
interface SourceEdge {
  readonly a: number;
  readonly b: number;
  readonly sourceA: number;
  readonly sourceB: number;
  readonly restMeters: number;
}
export interface AnatomicalGeometryMetricsV1 {
  readonly version: typeof ANATOMICAL_GEOMETRY_AUDIT_VERSION;
  readonly poseId: string;
  readonly triangles: number;
  readonly measuredSourceEdges: number;
  readonly surfaceAreaSquareMeters: number;
  readonly absoluteEnclosedVolumeCubicMeters: number;
  readonly areaRatioFromRest: number;
  readonly volumeRatioFromRest: number;
  readonly edgeRmsPercent: number;
  readonly edgeP95Percent: number;
  readonly edgeMaxPercent: number;
  readonly edgeMaxAbsoluteMm: number;
  readonly worstSourceEdge: readonly [number, number];
  readonly sampledSourceEdgeOver100Percent: number;
  readonly nonfiniteVertices: number;
  readonly degenerateTriangles: number;
}
interface SurfaceStat {
  readonly area: number;
  readonly volume: number;
  readonly degenerate: number;
}

function point(positions: Float64Array, id: number) {
  const offset = id * 3;
  return [positions[offset]!, positions[offset + 1]!, positions[offset + 2]!] as const;
}
function lengthBetween(positions: Float64Array, a: number, b: number): number {
  const ia = a * 3, ib = b * 3;
  return Math.hypot(positions[ia]! - positions[ib]!,
    positions[ia + 1]! - positions[ib + 1]!,
    positions[ia + 2]! - positions[ib + 2]!);
}
function surface(positions: Float64Array, indices: Uint32Array): SurfaceStat {
  let area = 0, signedVolume = 0, degenerate = 0;
  for (let i = 0; i < indices.length; i += 3) {
    const a = point(positions, indices[i]!);
    const b = point(positions, indices[i + 1]!);
    const c = point(positions, indices[i + 2]!);
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const triangleArea = Math.hypot(nx, ny, nz) * .5;
    if (!Number.isFinite(triangleArea))
      throw new Error("Nonfinite CPU-skinned triangle area " + i / 3);
    if (triangleArea < 1e-12) degenerate++;
    area += triangleArea;
    signedVolume += (a[0] * (b[1] * c[2] - b[2] * c[1]) +
      a[1] * (b[2] * c[0] - b[0] * c[2]) +
      a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
  }
  if (!Number.isFinite(area) || !Number.isFinite(signedVolume))
    throw new Error("Nonfinite CPU-skinned whole-body area/volume");
  return { area, volume: Math.abs(signedVolume), degenerate };
}
function captureRest(human: AnatomicalHuman): Float64Array {
  const pos = human.mesh.geometry.getAttribute("position");
  const values = new Float64Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++)
    for (let k = 0; k < 3; k++) values[3 * i + k] = pos.getComponent(i, k);
  return values;
}
function captureSkinned(human: AnatomicalHuman): Float64Array {
  const count = human.mesh.geometry.getAttribute("position").count;
  const values = new Float64Array(count * 3);
  const p = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    human.mesh.getVertexPosition(i, p);
    values[i * 3] = p.x;
    values[i * 3 + 1] = p.y;
    values[i * 3 + 2] = p.z;
  }
  return values;
}
export class AnatomicalGeometryAuditor {
  private readonly edges: readonly SourceEdge[];
  private readonly triangles: Uint32Array;
  private readonly rest: SurfaceStat;

  constructor(private readonly human: AnatomicalHuman) {
    const geometry = human.mesh.geometry;
    const index = geometry.getIndex();
    if (!index || index.count % 3) throw new Error("C2.5 audit requires indexed triangles");
    const position = geometry.getAttribute("position");
    if (!position || position.itemSize !== 3 ||
        human.template.sourceVertexIds.length !== position.count)
      throw new Error("C2.5 audit missing original vertex correspondence");
    this.triangles = Uint32Array.from(Array.from({length:index.count},(_,i)=>index.getX(i)));
    const rest = captureRest(human);
    if (rest.some(v => !Number.isFinite(v)))
      throw new Error("Nonfinite pinned CC0 rest vertices");
    this.rest = surface(rest, this.triangles);
    if (!(this.rest.area > 0 && this.rest.volume > 0))
      throw new Error("Pinned CC0 body rest surface lacks enclosed volume");
    const edgeLookup = new Set<string>();
    const edges: SourceEdge[] = [];
    const sourceIds = human.template.sourceVertexIds;
    const addEdge = (a: number, b: number) => {
      const sourceA = sourceIds[a]!, sourceB = sourceIds[b]!;
      if (sourceA === sourceB) return;
      const key = Math.min(sourceA, sourceB) + ":" + Math.max(sourceA, sourceB);
      if (edgeLookup.has(key)) return;
      edgeLookup.add(key);
      const restMeters = lengthBetween(rest, a, b);
      // An edge shorter than 3mm cannot support stable relative strain
      // interpretation; tiny edges remain in area/volume measurements.
      if (restMeters < .003) return;
      edges.push({a,b,sourceA,sourceB,restMeters});
    };
    for (let i = 0; i < this.triangles.length; i += 3) {
      const a = this.triangles[i]!, b = this.triangles[i + 1]!,
        c = this.triangles[i + 2]!;
      addEdge(a,b); addEdge(b,c); addEdge(c,a);
    }
    if (!edges.length) throw new Error("Missing measurable CC0 source topology edges");
    this.edges = edges;
  }

  measure(poseId: string): AnatomicalGeometryMetricsV1 {
    const values = captureSkinned(this.human);
    const nonfiniteVertices = values.reduce((sum,v)=>sum + Number(!Number.isFinite(v)),0);
    if (nonfiniteVertices) throw new Error("Nonfinite skinned geometry in " + poseId);
    const current = surface(values, this.triangles);
    const changes = this.edges.map(edge => {
      const deformed = lengthBetween(values, edge.a, edge.b);
      return { relative: Math.abs(deformed / edge.restMeters - 1),
        absolute: Math.abs(deformed - edge.restMeters), edge };
    }).sort((a,b)=>a.relative-b.relative ||
      a.edge.sourceA-b.edge.sourceA || a.edge.sourceB-b.edge.sourceB);
    const worst = changes.at(-1)!;
    const rms = Math.sqrt(changes.reduce((total, x) =>
      total + x.relative ** 2, 0) / changes.length);
    return Object.freeze({
      version: ANATOMICAL_GEOMETRY_AUDIT_VERSION, poseId,
      triangles: this.triangles.length / 3,
      measuredSourceEdges: this.edges.length,
      surfaceAreaSquareMeters: current.area,
      absoluteEnclosedVolumeCubicMeters: current.volume,
      areaRatioFromRest: current.area / this.rest.area,
      volumeRatioFromRest: current.volume / this.rest.volume,
      edgeRmsPercent: 100 * rms,
      edgeP95Percent: 100 * changes[Math.min(changes.length - 1,
        Math.floor(changes.length * .95))]!.relative,
      edgeMaxPercent: 100 * worst.relative,
      edgeMaxAbsoluteMm: 1000 * Math.max(...changes.map(x => x.absolute)),
      worstSourceEdge: [worst.edge.sourceA, worst.edge.sourceB] as const,
      sampledSourceEdgeOver100Percent: changes.filter(x => x.relative > 1).length,
      nonfiniteVertices, degenerateTriangles: current.degenerate,
    });
  }
}
