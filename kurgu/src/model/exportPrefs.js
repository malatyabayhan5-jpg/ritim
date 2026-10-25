// Dışa aktarma tercihleri: editördeki çözünürlük seçicisi ile dışa aktarma ekranı paylaşır.
// Cihazın kodlayıcısı seçilen modu desteklemiyorsa dışa aktarma ekranı en yakın moda iner.

export const RESOLUTIONS = [720, 1080, 1440, 2160];
export const FPS = [24, 25, 30, 50, 60];

export function exportPrefs(project) {
  const e = project?.export || {};
  return {
    res: RESOLUTIONS.includes(e.res) ? e.res : 1080,
    fps: FPS.includes(e.fps) ? e.fps : FPS.includes(project?.canvas?.fps) ? project.canvas.fps : 30,
  };
}

export function setExportPrefs(project, patch) {
  return { ...project, updatedAt: Date.now(), export: { ...exportPrefs(project), ...patch } };
}
