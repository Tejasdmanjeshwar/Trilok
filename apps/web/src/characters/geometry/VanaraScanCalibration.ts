/**
 * C3.5: measured external-shape envelope from Smithsonian NMNH USNM 334797.
 *
 * Sampling method: exact-coordinate-welded ASCII PLYs, translated mandible
 * approximately to paired cranium condyle boxes (-1,-27,+13 mm), stratified
 * horizontal sections, 0.5%-99.5% sagittal and 99.5% absolute lateral
 * quantiles. Each station: [vertical fraction, lateral radius normalized by
 * 36.5 mm, sagittal radius normalized by 52.0 mm, sagittal center offset mm].
 * The final zero-radius station closes the soft-tissue apex intentionally.
 *
 * These are scan-derived *skeletal* envelopes, not measured skin thickness.
 * Scanner PLY has no explicit unit field; millimetres are consistent with
 * museum-scale macaque cranium (110.415 mm sagittal bounding extent).
 * Jaw pairing is an anatomical proxy alignment, NOT verified condyle ICP.
 * Do not embed raw high-poly scans in production builds.
 */
export const VANARA_SCAN_ID = "USNM334797-bonnet-macaque-envelope-v1" as const;
export const VANARA_SCAN_PROVENANCE = Object.freeze({
  specimen: "USNM 334797",
  taxon: "Macaca radiata",
  source: "Smithsonian NMNH 3D collection",
  craniumFile: "USNM334797_cranium_-600_dec.ply",
  craniumSHA256: "11492e50f9ad9593d5437d9cffaeaf825fd14311f639b3f5506437aed1b8b81e",
  craniumFaces: 750000,
  craniumWeldedVertices: 372999,
  craniumBoundaryEdges: 320,
  mandibleFile: "USNM334797_mandible_-400.ply",
  mandibleSHA256: "9b5ea19a9e92bad1f2026f9f7e1eaeeb599bd77ddc289d7ce5eeba33f6db91dc",
  mandibleFaces: 241727,
  mandibleWeldedVertices: 120332,
  mandibleBoundaryEdges: 243,
  scanVerticalMinMm: -45.814,
  scanVerticalMaxMm: 30.631,
  scanSagittalSpanMm: 110.415,
  scanCranialZygomaticWidthMm: 75.392,
  approximateMandibleTranslationMm: [-1.009,-26.892,13.113] as const,
  condyleRegistrationResidualMm: 3.817,
});
/** Ratios scanned from combined skull and provisionally registered jaw. */
export const VANARA_SCAN_ENVELOPE: readonly (readonly [number,number,number,number])[] = Object.freeze([
  [0,.521,.478,11.6],
  [.05,.567,.561,12.2],
  [.10,.592,.610,13.1],
  [.15,.622,.639,13.8],
  [.20,.649,.778,8.6],
  [.25,.685,.878,5.4],
  [.30,.805,.943,2.2],
  [.35,.932,.999,-1.0],
  [.40,.984,.989,-1.1],
  [.45,1,.971,-.7],
  [.50,.921,.978,-.6],
  [.55,.822,.992,.2],
  [.60,.830,.975,.3],
  [.65,.858,.879,-3.5],
  [.70,.899,.809,-5.9],
  [.75,.882,.777,-6.0],
  [.80,.852,.639,-11.3],
  [.85,.786,.579,-11.7],
  [.90,.737,.522,-10.6],
  [.95,.614,.450,-8.2],
  [1,0,0,-4.7],
]);
/**
 * Landmark proxies are medians within documented scan-space bounding boxes,
 * not definitive manually annotated anatomical landmark picks.
 */
export const VANARA_SCAN_LANDMARKS_MM = Object.freeze({
  craniumCrown: [-1.563,29.150,-14.352] as const,
  occiput: [-.593,-13.960,-51.829] as const,
  rostrum: [-2.130,-3.323,51.242] as const,
  leftZygomatic: [-35.303,-15.137,-9.163] as const,
  rightZygomatic: [35.090,-13.719,-6.008] as const,
  leftOrbitRimProxy: [-11.075,23.349,13.411] as const,
  rightOrbitRimProxy: [15.377,22.686,11.454] as const,
  leftCranialJointProxy: [-24.437,-16.048,-21.415] as const,
  rightCranialJointProxy: [22.071,-15.840,-18.983] as const,
  leftMandibleCondyleUnaligned: [-24.474,11.146,-32.620] as const,
  rightMandibleCondyleUnaligned: [24.125,10.749,-34.004] as const,
  mandibularSymphysisUnaligned: [-.591,-4.201,31.926] as const,
});
