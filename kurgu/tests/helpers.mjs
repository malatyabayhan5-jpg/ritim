import { createProject } from '../src/model/schema';
import { addMediaToProject } from '../src/model/timeline';

export const video = (id, durationMs, extra = {}) => ({ id, kind: 'video', path: `media/${id}.mp4`, name: `${id}.mp4`, durationMs, width: 1920, height: 1080, hasAudio: true, ...extra });
export const image = (id) => ({ id, kind: 'image', path: `media/${id}.jpg`, name: `${id}.jpg`, durationMs: 0, width: 1080, height: 1350, hasAudio: false });
export const audio = (id, durationMs) => ({ id, kind: 'audio', path: `media/${id}.mp3`, name: `${id}.mp3`, durationMs, hasAudio: true });

export function projectWith(media, opts) {
  return addMediaToProject(createProject({ ratio: '9:16' }), media, null, opts).project;
}
