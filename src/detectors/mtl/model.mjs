export const revision = 'bbae7482f28a9d7142a8f122a3bce105106df669';
export const sha256 = 'e0223a229e2100def4c5d638bee16f8a385f048676c0ca155c5cb819ce50a138';
export const modelUrl = `https://huggingface.co/shahriarhd/mtl-face-auth/resolve/${revision}/model_best.onnx`;
export const framesPerClip = 8;
export const size = 224;
const mean = [0.485, 0.456, 0.406];
const std = [0.229, 0.224, 0.225];

export function preprocess(frames) {
  const pixels = size * size;
  if (frames.length !== framesPerClip) throw new Error('Требуются восемь кадров MTL');
  const input = new Float32Array(frames.length * 3 * pixels);
  frames.forEach((rgba, t) => {
    if (rgba.length !== 4 * pixels) throw new Error('Некорректный размер кадра MTL');
    for (let c = 0; c < 3; c++) {
      const base = (t * 3 + c) * pixels;
      for (let i = 0; i < pixels; i++) input[base+i] = (rgba[4*i+c]/255 - mean[c])/std[c];
    }
  });
  return input;
}

export async function classify(ort, session, frames) {
  const tensor = new ort.Tensor('float32', preprocess(frames), [1, framesPerClip, 3, size, size]);
  let output;
  try {
    output = await session.run({frames:tensor}, ['deepfake_logit']);
    const logit = output.deepfake_logit.data;
    if (logit.length !== 1 || !Number.isFinite(logit[0])) throw new Error('Некорректный результат MTL');
    return 1 / (1 + Math.exp(-logit[0]));
  } finally {
    tensor.dispose();
    output?.deepfake_logit.dispose();
  }
}
