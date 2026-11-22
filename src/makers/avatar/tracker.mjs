import pico from './vendor/pico.mjs';

export function createTracker(bytes) {
  const classify = pico.unpack_cascade(new Int8Array(bytes));
  return (pixels, width, height) => {
    const candidates = pico.run_cascade(
      { pixels, nrows: height, ncols: width, ldim: width },
      classify,
      { minsize: 20, maxsize: Math.min(width, height), scalefactor: 1.13, shiftfactor: 0.10 },
    );
    const [face] = pico.cluster_detections(candidates, 0.2).sort((a, b) => b[3] - a[3]);
    if (!face || face[3] < 5) return null;
    return { x: face[1], y: face[0], size: face[2] };
  };
}
