import {readFileSync} from "node:fs";
import {describe,it,expect,vi} from "vitest";
import {loadAnatomicalHuman} from "../apps/web/src/characters/geometry/AnatomicalTemplate";

/** Tests the same real pinned MakeHuman topology, weights and semantic rig
 * as Character Studio; the test runner verifies these assets before Vitest. */
describe("Studio immutable source preparation",()=>{
  it("fetches and parses pinned source once, while instantiating independent anatomy",async()=>{
    const names=["makehuman-base.obj","makehuman-default.mhskel",
      "makehuman-default_weights.mhw"] as const;
    const calls:string[]=[];
    const original=globalThis.fetch;
    const fetchMock=vi.fn(async(input:RequestInfo|URL)=>{
      const path=String(input);
      const name=names.find(n=>path==="/anatomy/"+n);
      if(!name)throw new Error("Unexpected source URL "+path);
      calls.push(name);
      const bytes=readFileSync(new URL("../apps/web/public/anatomy/"+name,import.meta.url));
      return new Response(bytes,{status:200});
    });
    globalThis.fetch=fetchMock as typeof fetch;
    let first:Awaited<ReturnType<typeof loadAnatomicalHuman>>|undefined;
    let second:typeof first;
    try{
      const stages:string[]=[];
      first=await loadAnatomicalHuman(undefined,stage=>stages.push(stage));
      const firstPositions=Array.from(first.mesh.geometry.getAttribute("position").array);
      second=await loadAnatomicalHuman(undefined,stage=>stages.push(stage));
      expect(calls.sort()).toEqual([...names].sort());
      expect(stages.filter(s=>s==="obj-parse")).toHaveLength(1);
      expect(stages.filter(s=>s==="source-cache-wait")).toHaveLength(2);
      expect(first.mesh.geometry).not.toBe(second.mesh.geometry);
      expect(first.mesh.geometry.getAttribute("position").array)
        .not.toBe(second.mesh.geometry.getAttribute("position").array);
      expect(Array.from(second.mesh.geometry.getAttribute("position").array))
        .toEqual(firstPositions);
      expect(first.spike.skeleton).not.toBe(second.spike.skeleton);
      const attr=first.mesh.geometry.getAttribute("position");
      attr.setX(0,attr.getX(0)+.123);
      expect(second.mesh.geometry.getAttribute("position").getX(0))
        .toBeCloseTo(firstPositions[0]!,6);
      first.dispose();first=undefined;
      expect(second.mesh.geometry.getAttribute("position").count).toBeGreaterThan(1000);
    }finally{
      first?.dispose();second?.dispose();globalThis.fetch=original;
    }
  });
});
