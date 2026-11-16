import {describe,expect,it} from "vitest";
import * as THREE from "three";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {make} from "./helpers/studio-two-hand-fixtures";
import {SOURCE_ARCHER_ROTATIONS_DEGREES,
  SOURCE_ARCHER_REFERENCE_SHA256} from "../apps/web/src/studio/StudioMakeHumanArcherChannels";
import {mirrorSourceRotationX,originalSourceEulerQuaternion,
  retargetSourceArcherPose} from "../apps/web/src/studio/StudioMakeHumanArcherRetarget";

const asset="assets/reference/makehuman/c54-archery/";
describe("C5.4 original MakeHuman archer source rotation retargeting",()=>{
  it.each(["hero","square"] as const)(
    "retains every imported BVH channel verbatim for %s",variant=>{
      const name=variant==="hero"?"callharvey3d_archer_hero":
        "callharvey3d_archer_square_stance";
      const bytes=readFileSync(asset+name+".bvh");
      expect(createHash("sha256").update(bytes).digest("hex"))
        .toBe(SOURCE_ARCHER_REFERENCE_SHA256[variant]);
      const contents=bytes.toString("utf8");
      const [hierarchy,motion]=contents.split("MOTION");
      expect(hierarchy).toBeDefined();
      expect(motion).toBeDefined();
      expect(motion).toContain("Frames: 1");
      const names=[...hierarchy!.matchAll(/^\s*(?:ROOT|JOINT)\s+([^\s{]+)/gm)]
        .map(m=>m[1]!);
      const channels=motion!.trim().split("\n").at(-1)!.trim()
        .split(/\s+/).map(Number);
      expect(names).toHaveLength(163);
      expect(channels).toHaveLength(978);
      for(const [name,xyz] of Object.entries(
        SOURCE_ARCHER_ROTATIONS_DEGREES[variant])){
        const index=names.indexOf(name);
        expect(index,name).toBeGreaterThanOrEqual(0);
        expect(channels.slice(index*6+3,index*6+6),name).toEqual(xyz);
      }
      expect(Object.keys(SOURCE_ARCHER_ROTATIONS_DEGREES[variant]))
        .toHaveLength(50);
      expect(readFileSync(asset+name+".meta","utf8")).toContain("license CC-by");
    });
  it("reflects original source local rotations twice to identity",()=>{
    const sample=SOURCE_ARCHER_ROTATIONS_DEGREES.hero["finger2-2.L"];
    const q=originalSourceEulerQuaternion(sample);
    const mirrored=mirrorSourceRotationX(q);
    expect(mirrorSourceRotationX(mirrored).angleTo(q)).toBeLessThan(1e-9);
    expect(mirrored.length()).toBeCloseTo(1,9);
    expect(q.angleTo(new THREE.Quaternion())).toBeGreaterThan(.1);
  });
  it.each(["left","right"] as const)(
    "produces deterministic legal hand and arm targets on %s",side=>{
      const {human,fk}=make();
      try{
        for(const kind of ["bow-holding","string-drawing"] as const){
          const first=retargetSourceArcherPose(human.spike.graph,fk,
            side,kind,"square",true);
          const second=retargetSourceArcherPose(human.spike.graph,fk,
            side,kind,"square",true);
          expect(first).toEqual(second);
          expect(first.commands).toHaveLength(26);
          expect(first.diagnostics).toHaveLength(18);
          const ids=new Set<string>();
          for(const command of first.commands){
            const limit=fk.frames.get(command.jointId)?.freedoms.get(command.motion);
            expect(limit).toBeDefined();
            expect(command.radians).toBeGreaterThanOrEqual(limit!.min-1e-12);
            expect(command.radians).toBeLessThanOrEqual(limit!.max+1e-12);
            const key=command.jointId+"/"+command.motion;
            expect(ids.has(key),key).toBe(false);
            ids.add(key);
          }
          expect(first.diagnostics.every(d=>Number.isFinite(d.remainingQuaternionRadians)
            &&d.remainingQuaternionRadians>=0)).toBe(true);
          expect(first.diagnostics.every(d=>d.reflected===
            (side==="left"?kind==="bow-holding":kind==="string-drawing")))
            .toBe(true);
          fk.apply(first.commands);
          fk.apply([]);
        }
      }finally{human.dispose();}
    },120_000);
});
