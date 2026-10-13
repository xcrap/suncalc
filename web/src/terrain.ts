// Shared by the page and the horizon worker; keep this free of imports.
export const TERRAIN_TILES = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";

export type HorizonJob = { id: number; lat: number; lng: number };
export type HorizonResult = {
  id: number;
  lat: number;
  lng: number;
  elevation: number;
  /** Apparent skyline altitude for every half degree of azimuth. */
  angles: Float32Array;
  /** Distance in metres to the point that forms the skyline. */
  distances: Float32Array;
  /** 1 where the skyline is the open sea rather than land. */
  sea: Uint8Array;
};
