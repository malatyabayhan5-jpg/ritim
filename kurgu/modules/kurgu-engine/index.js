// Kurgu yerel motoru (Android, Media3). Önizleme ve dışa aktarma aynı render
// tanımını (src/engine/renderSpec.js) kullanır.
import { requireNativeModule, requireNativeView } from 'expo';
import { Platform } from 'react-native';

const available = Platform.OS === 'android';

export const KurguEngine = available ? requireNativeModule('KurguEngine') : null;
export const KurguPreview = available ? requireNativeView('KurguEngine') : null;
export const isEngineAvailable = available;
