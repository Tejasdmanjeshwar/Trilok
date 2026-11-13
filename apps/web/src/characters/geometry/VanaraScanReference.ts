/**
 * Smithsonian NMNH Macaca radiata USNM 334797: compressed, derived *skeletal*
 * envelope data. No scan mesh or skull texture is shipped in the game.
 *
 * Source: matched cranium (-600 decimated PLY) and mandible (-400 PLY).
 * Both are millimetre, +Z rostral, +Y dorsal; specimen-local xyz frames differ.
 * The mandible translation is an estimated condylar/glenoid ROI registration,
 * not a verified occlusal fit. The bony envelope is a shape prior; a separate
 * authored soft-tissue/ear/eyelid treatment remains necessary.
 *
 * Reproduce stations by sampling every fourth XYZ vertex, applying the
 * registered jaw translation, taking a +/-3.1mm Y slice at each station
 * (widen to 5.5mm if <200 points), and calculating abs(X) p99.5 and Z p0.5/
 * p99.5. Source meshes were audited locally; retain only these derived values.
 * See docs/character-studio-c3-5-skull-replacement-audit.md.
 */
export const BONNET_MACAQUE_334797 = Object.freeze({
  specimen: "Smithsonian NMNH USNM 334797, Macaca radiata",
  craniumSha256: "6f0d0e9a128cfd2671a417d8f379be6fd0c347bf79c85e94a69f6a19cabdef3a",
  mandibleSha256: "9b5ea19a9e92bad1f2026f9f7e1eaeeb599bd77ddc289d7ce5eeba33f6db91dc",
  craniumBoundsMm: Object.freeze([75.39165,61.254303,110.41499] as const),
  mandibleBoundsMm: Object.freeze([59.06655,37.61699,75.60341] as const),
  // Anatomical-proxy registration, not ICP and not an accepted dental fit.
  mandibleTranslationMm: Object.freeze([-1.009,-26.892,13.113] as const),
  // Axis + ROI observations from the actual meshes, in cranium-local mm.
  landmarksMm: Object.freeze({
    crown: [-1.563,29.150,-14.352] as const,
    occiput: [-.593,-13.960,-51.829] as const,
    rostrum: [-2.130,-3.323,51.242] as const,
    zygomaLeft: [-35.303,-15.137,-9.163] as const,
    zygomaRight: [35.090,-13.719,-6.008] as const,
    orbitRimLeftProxy: [-11.075,23.349,13.411] as const,
    orbitRimRightProxy: [15.377,22.686,11.454] as const,
    mandibularCondyleLeftRegistered: [-25.483,-15.746,-19.507] as const,
    mandibularCondyleRightRegistered: [23.116,-16.143,-20.891] as const,
    mandibularSymphysisRegistered: [-1.600,-31.093,45.039] as const,
  }),
  // [normalized dorsal height, lateral half-span mm, posterior Z mm, rostral Z mm]
  envelopeStations: Object.freeze([
    [0.00,19.0,-13.3,36.4],[0.05,20.7,-17.0,41.3],
    [0.10,21.6,-18.6,44.8],[0.15,22.7,-19.5,47.0],
    [0.20,23.7,-31.8,49.1],[0.25,25.0,-40.3,51.0],
    [0.30,29.4,-46.9,51.2],[0.35,34.0,-53.0,50.9],
    [0.40,35.9,-52.6,50.3],[0.45,36.5,-51.2,49.8],
    [0.50,33.6,-51.4,50.3],[0.55,30.0,-51.4,51.8],
    [0.60,30.3,-50.4,51.0],[0.65,31.3,-49.2,42.2],
    [0.70,32.8,-48.0,36.1],[0.75,32.2,-46.4,34.4],
    [0.80,31.1,-44.6,21.9],[0.85,28.7,-41.8,18.4],
    [0.90,26.9,-37.7,16.6],[0.95,22.4,-31.6,15.2],
    [1.00,0.0,-4.7,-4.7],
  ] as readonly (readonly [number,number,number,number])[]),
});

export interface MacaqueEnvelope {
  readonly widthRatio: number;
  readonly sagittalRadiusRatio: number;
  readonly sagittalCenterRatio: number;
}

/** Dimensionless, deterministic interpolation of a scan-extracted envelope. */
export function sampleBonnetMacaqueEnvelope(t: number): MacaqueEnvelope {
  if(!Number.isFinite(t)) throw new Error("Nonfinite macaque envelope sample");
  const stations=BONNET_MACAQUE_334797.envelopeStations;
  const bounded=Math.max(0,Math.min(1,t));
  let a=stations[0]!,b=stations[1]!;
  for(let i=1;i<stations.length;i++){
    b=stations[i]!;
    if(bounded<=b[0])break;
    a=b;
  }
  const blend=b[0]===a[0]?0:(bounded-a[0])/(b[0]-a[0]);
  const lerp=(j:1|2|3)=>a[j]+(b[j]-a[j])*blend;
  const halfWidth=lerp(1),posterior=lerp(2),rostral=lerp(3);
  return {
    widthRatio:halfWidth/(BONNET_MACAQUE_334797.craniumBoundsMm[0]/2),
    sagittalRadiusRatio:(rostral-posterior)/BONNET_MACAQUE_334797.craniumBoundsMm[2],
    sagittalCenterRatio:(rostral+posterior)/BONNET_MACAQUE_334797.craniumBoundsMm[2],
  };
}
