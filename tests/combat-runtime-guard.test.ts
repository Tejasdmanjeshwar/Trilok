import { describe, expect, it } from "vitest";
import { BufferedDefense, defenseOpeningTick } from "../apps/web/src/combat/BufferedDefense";
import { CombatRuntimeGuard, type RuntimeSnapshot } from "../apps/web/src/combat/CombatRuntimeGuard";
import { EncounterSession } from "../apps/web/src/combat/EncounterSession";

function pendingFixture() {
  const session=new EncounterSession();
  session.end("hero");
  session.attack("enemy","hero","overhead_slash",6,1000);
  return {session, pending:session.state.pending!,
    dodge:session.legalReactions().find(o=>o.technique==="dodge")!};
}
const s=(changes:Partial<RuntimeSnapshot>={}):RuntimeSnapshot=>({
  nowMs:1000,phaseAtMs:0,presentation:"windup",
  domainPhase:"reaction",turn:2,actorId:"enemy",
  pendingImpactTick:1850,counterImpactTick:null,
  projectileImpactTick:null,sequenceId:"enemy-strike",
  ...changes,
});
describe("D10 buffered defensive input",()=>{
  it("holds only a first input within 110ms before the real defense window",()=>{
    const {pending,dodge}=pendingFixture(),b=new BufferedDefense();
    const opening=defenseOpeningTick(pending,dodge);
    expect(b.offer("dodge",pending,dodge,opening-111)).toBe(false);
    expect(b.offer("dodge",pending,dodge,opening-80)).toBe(true);
    expect(b.offer("parry",pending,dodge,opening-20)).toBe(false);
    expect(b.take(pending,opening-1)).toBeNull();
    const ready=b.take(pending,opening);
    expect(ready).toMatchObject({kind:"dodge",executeTick:opening});
    expect(b.take(pending,opening+30)).toBeNull();
  });
  it("cannot resurrect a stale hit or a reaction after its true late deadline",()=>{
    const {pending,dodge}=pendingFixture(),b=new BufferedDefense();
    const opening=defenseOpeningTick(pending,dodge);
    expect(b.offer("dodge",pending,dodge,opening-45)).toBe(true);
    expect(b.take(null,opening)).toBeNull();
    expect(b.pending).toBeNull();
    expect(b.offer("dodge",pending,dodge,opening-45)).toBe(true);
    expect(b.take(pending,dodge.targetTick+dodge.timing.lateTicks+1)).toBeNull();
    expect(b.pending).toBeNull();
  });
  it("rejects invalid buffer policy and does not shift the domain grade",()=>{
    expect(()=>new BufferedDefense(-1)).toThrow();
    const {session,pending,dodge}=pendingFixture();
    const opening=defenseOpeningTick(pending,dodge),b=new BufferedDefense();
    expect(b.offer("dodge",pending,dodge,opening-20)).toBe(true);
    const action=b.take(pending,opening)!;
    expect(session.captureDefense("dodge",action.executeTick).accepted).toBe(true);
    expect(session.activeDefense?.tick).toBe(opening);
  });
});
describe("D10 runtime phase supervision",()=>{
  it("does not punish a player deciding for minutes",()=>{
    const guard=new CombatRuntimeGuard();
    expect(guard.inspect(s({presentation:"choice",nowMs:900_000}))).toBeNull();
  });
  it("detects a stuck attack while preserving useful local diagnostics",()=>{
    const guard=new CombatRuntimeGuard(3);
    guard.record(100,"phase","windup");
    guard.record(200,"input","parry");
    guard.record(300,"impact","head");
    guard.record(400,"phase","reaction");
    expect(guard.inspect(s({nowMs:1000}))).toBeNull();
    const stuck=s({nowMs:7600});
    // 6600ms wall gap is interpreted as a tab suspension, not a freeze.
    expect(guard.inspect(stuck)).toBeNull();
    expect(guard.inspect(s({nowMs:10000}))).toBeNull();
    expect(guard.inspect(s({nowMs:12500}))).toBeNull();
    expect(guard.inspect(s({nowMs:13000}))).toContain("stalled");
    guard.fail(new Error("stalled"),stuck);
    const report=JSON.parse(guard.report("preview-test",stuck));
    expect(report.events.length).toBe(3);
    expect(report.events.at(-1).kind).toBe("fatal");
    expect(report.fault).toBe("stalled");
    guard.reset();
    expect(guard.fault).toBeNull();
  });
  it("allows non-fatal long breaks on background-tab resume",()=>{
    const guard=new CombatRuntimeGuard();
    expect(guard.inspect(s({nowMs:1000}))).toBeNull();
    expect(guard.inspect(s({nowMs:90_000}))).toBeNull();
  });
  it("gives projectile and counter their own deadlines",()=>{
    const guard=new CombatRuntimeGuard();
    guard.inspect(s({presentation:"projectile",nowMs:1000,projectileImpactTick:2200}));
    expect(guard.inspect(s({presentation:"projectile",nowMs:3000,projectileImpactTick:2200}))).toBeNull();
    expect(guard.inspect(s({presentation:"projectile",nowMs:5000,projectileImpactTick:2200}))).toBeNull();
    expect(guard.inspect(s({presentation:"projectile",nowMs:6000,projectileImpactTick:2200}))).toContain("stalled");
  });
});
