export async function loadTracker() {
  const [{ default: url }, { createTracker }] = await Promise.all([
    import('./vendor/facefinder.bin?url&inline'),
    import('./tracker.mjs'),
  ]);
  const response = await fetch(url);
  if (!response.ok) throw new Error('Не удалось загрузить модель pico');
  return createTracker(await response.arrayBuffer());
}
