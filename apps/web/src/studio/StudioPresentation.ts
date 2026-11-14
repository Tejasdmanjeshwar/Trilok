/** Camera framing is explicit: switching editor sections never changes the view. */
export const STUDIO_VIEWS = {
  "three-quarter": {label:"Three-quarter",position:[2.12,1.48,2.58],target:[0,.95,0]},
  front: {label:"Front",position:[0,1.45,3.15],target:[0,.95,0]},
  side: {label:"Side",position:[3.15,1.45,0],target:[0,.95,0]},
  rear: {label:"Rear",position:[0,1.45,-3.15],target:[0,.95,0]},
} as const;
export type StudioView = keyof typeof STUDIO_VIEWS;

export const STUDIO_LIGHTS = {
  daylight:{label:"Daylight",background:0x28323a,hemisphere:2.1,
    keyColor:0xffead6,key:2.4,fillColor:0xd5e8ff,fill:1.0,rimColor:0xe9efff,rim:1.8},
  warm:{label:"Golden hour",background:0x302922,hemisphere:1.8,
    keyColor:0xffd4a0,key:2.7,fillColor:0xb6d6ed,fill:1.0,rimColor:0xffe0bb,rim:1.8},
  dusk:{label:"Twilight",background:0x1d2535,hemisphere:1.8,
    keyColor:0xc7d7ff,key:2.3,fillColor:0x9db4df,fill:1.1,rimColor:0xf3d0b0,rim:1.9},
} as const;
export type StudioLight = keyof typeof STUDIO_LIGHTS;
