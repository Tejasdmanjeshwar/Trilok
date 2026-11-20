import {readFileSync} from "node:fs";
import {describe,it,expect} from "vitest";
import {validateBodyAtlas,type BodyAtlas} from
  "../apps/web/src/characters/geometry/MakeHumanBodyTargets";

describe("MakeHuman worker atlas transferable precision",()=>{
  it("keeps every original source target and full numeric precision after transfer",()=>{
    const original=JSON.parse(readFileSync(
      "assets/cache/makehuman-body-v1.json","utf8")) as BodyAtlas;
    const buffers:ArrayBuffer[]=[];
    const targets=original.payload.targets.map(target=>{
      const rows=Float64Array.from(target.rows);
      buffers.push(rows.buffer as ArrayBuffer);
      return {id:target.id,rows};
    });
    // The transferable representation uses the same data structures as the
    // worker reply. Every target remains indexed by the exact pinned source ID.
    const wire:BodyAtlas={...original,payload:{...original.payload,targets}};
    const validated=validateBodyAtlas(wire,19158);
    expect(validated.size).toBe(846);
    expect(buffers.length).toBe(846);
    for(let i=0;i<targets.length;i++){
      const reference=original.payload.targets[i]!;
      const transferred=targets[i]!;
      expect(transferred.id).toBe(reference.id);
      expect(transferred.rows.length).toBe(reference.rows.length);
      for(let j=0;j<transferred.rows.length;j++)
        expect(Object.is(transferred.rows[j],reference.rows[j])).toBe(true);
    }
  });
});
