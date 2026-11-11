import { describe, expect, it } from "vitest";
import { AimCursor, DEFAULT_AIM_PREFERENCES } from "../packages/input/src/index";

describe("cross-platform free-aim cursor", () => {
  it("uses actual mouse coordinates without auto snapping", () => {
    const cursor = new AimCursor();
    cursor.absolute(.2,-.67,"mouse");
    expect(cursor.value).toEqual({x:.2,y:-.67,device:"mouse"});
    cursor.absolute(4,-5,"mouse");
    expect(cursor.value).toEqual({x:1,y:-1,device:"mouse"});
  });
  it("touch drag uses relative displacement and shared normalized screen coordinates", () => {
    const cursor = new AimCursor({ ...DEFAULT_AIM_PREFERENCES,touchSensitivity:1 });
    cursor.relative(40,-20,400,200,"touch");
    expect(cursor.value.x).toBeCloseTo(.2);
    expect(cursor.value.y).toBeCloseTo(.2);
    cursor.relative(-800,0,400,200,"touch");
    expect(cursor.value.x).toBe(-1);
    expect(cursor.value.device).toBe("touch");
  });
  it("analog input is delta-time scaled and insensitive to small drift", () => {
    const cursor = new AimCursor();
    cursor.axis(.12,0,.016,"gamepad");
    expect(cursor.value.x).toBe(0);
    cursor.axis(1,-1,.05,"gamepad");
    expect(cursor.value.x).toBeCloseTo(.0725);
    expect(cursor.value.y).toBeCloseTo(.0725);
    expect(cursor.value.device).toBe("gamepad");
  });
  it("keyboard uses the same axis control and can recenter", () => {
    const cursor = new AimCursor();
    cursor.axis(-1,1,.05,"keyboard");
    expect(cursor.value.x).toBeLessThan(0);
    expect(cursor.value.y).toBeLessThan(0);
    cursor.recenter();
    expect(cursor.value).toEqual({x:0,y:0,device:"programmatic"});
  });
  it("rejects malformed settings, invalid coordinates and zero-size viewports", () => {
    expect(() => new AimCursor({...DEFAULT_AIM_PREFERENCES, deadzone:1})).toThrow();
    const cursor = new AimCursor();
    expect(() => cursor.absolute(Number.NaN,0)).toThrow();
    expect(() => cursor.relative(3,3,0,320)).toThrow();
    expect(() => cursor.axis(Number.POSITIVE_INFINITY,0,0.016)).toThrow();
    expect(() => cursor.axis(1,1,-1)).toThrow();
  });
});
