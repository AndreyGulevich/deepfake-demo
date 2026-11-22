export const revision = '4ea3d66dfb1bedca29727c6a0c6fa061d5f3f9c9';
export const sha256 = '3519c22b9695f99ddc00821228eeac91239065a90bfbdb4917858b3ec1dcfc42';
export const modelUrl = `https://huggingface.co/onnx-community/Deep-Fake-Detector-v2-Model-ONNX/resolve/${revision}/onnx/model_quantized.onnx`;
export const size = 224;

export function preprocess(rgba) {
  const pixels = size * size;
  if (rgba.length !== pixels * 4) throw new Error('Expected a 224 × 224 RGBA frame');
  const input = new Float32Array(pixels * 3);
  for (let channel = 0; channel < 3; channel++) {
    for (let i = 0; i < pixels; i++) input[channel * pixels + i] = rgba[i * 4 + channel] / 127.5 - 1;
  }
  return input;
}

export async function classify(ort, session, rgba) {
  const input = new ort.Tensor('float32', preprocess(rgba), [1, 3, size, size]);
  const { logits } = await session.run({ pixel_values: input });
  try {
    const [real, fake] = logits.data;
    if (logits.data.length !== 2 || !Number.isFinite(real) || !Number.isFinite(fake)) {
      throw new Error('Unexpected classifier output');
    }
    return 1 / (1 + Math.exp(real - fake));
  } finally {
    logits.dispose();
    input.dispose();
  }
}
