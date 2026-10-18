import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { I18nProvider, useI18n } from './src/i18n';
import { NavigationProvider, useNav } from './src/navigation';
import { Loading, ToastProvider } from './src/ui';
import { colors } from './src/theme';
import HomeScreen from './src/screens/HomeScreen';
import EditorScreen from './src/screens/EditorScreen';
import ExportScreen from './src/screens/ExportScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import HelpScreen from './src/screens/HelpScreen';
import AiToolsScreen from './src/screens/AiToolsScreen';
import TemplatesScreen from './src/screens/TemplatesScreen';

const SCREENS = {
  home: HomeScreen,
  editor: EditorScreen,
  export: ExportScreen,
  settings: SettingsScreen,
  help: HelpScreen,
  ai: AiToolsScreen,
  templates: TemplatesScreen,
};

function Root() {
  const { ready, dir } = useI18n();
  const { stack } = useNav();
  if (!ready) return <Loading />;
  // Yığındaki tüm ekranlar bağlı kalır (editör, dışa aktarma ekranı açıkken
  // kapanmaz); yalnızca en üstteki görünür.
  return (
    <View style={[styles.root, { direction: dir }]}>
      {stack.map((route, i) => {
        const Screen = SCREENS[route.name];
        const visible = i === stack.length - 1;
        return (
          <View key={route.key || route.name} style={[StyleSheet.absoluteFill, !visible && styles.hidden]} pointerEvents={visible ? 'auto' : 'none'}>
            <Screen params={route.params || {}} focused={visible} />
          </View>
        );
      })}
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <I18nProvider>
        <ToastProvider>
          <NavigationProvider>
            <StatusBar style="light" />
            <Root />
          </NavigationProvider>
        </ToastProvider>
      </I18nProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  hidden: { opacity: 0 },
});
