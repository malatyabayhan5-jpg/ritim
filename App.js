import React from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator, BottomTabBar } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { LibraryProvider } from './src/context/LibraryContext';
import { PlayerProvider } from './src/context/PlayerContext';
import MiniPlayer from './src/components/MiniPlayer';
import HomeScreen from './src/screens/HomeScreen';
import SearchScreen from './src/screens/SearchScreen';
import LibraryScreen from './src/screens/LibraryScreen';
import AlbumScreen from './src/screens/AlbumScreen';
import PlaylistScreen from './src/screens/PlaylistScreen';
import PlayerScreen from './src/screens/PlayerScreen';
import { colors } from './src/theme';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.accent,
    background: colors.bg,
    card: colors.bg,
    text: colors.text,
    border: colors.border,
    notification: colors.accent,
  },
};

const TAB_ICONS = {
  Home: ['home', 'home-outline'],
  Search: ['search', 'search-outline'],
  Library: ['library', 'library-outline'],
};

function Tabs() {
  return (
    <Tab.Navigator
      tabBar={(props) => (
        <View style={{ backgroundColor: colors.bg }}>
          <MiniPlayer />
          <BottomTabBar {...props} />
        </View>
      )}
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarStyle: { backgroundColor: colors.bg, borderTopColor: colors.border },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarIcon: ({ focused, color, size }) => {
          const [on, off] = TAB_ICONS[route.name];
          return <Ionicons name={focused ? on : off} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: 'Ana sayfa' }} />
      <Tab.Screen name="Search" component={SearchScreen} options={{ title: 'Ara' }} />
      <Tab.Screen name="Library" component={LibraryScreen} options={{ title: 'Kütüphane' }} />
    </Tab.Navigator>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <LibraryProvider>
        <PlayerProvider>
          <NavigationContainer theme={navTheme}>
            <StatusBar style="light" />
            <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
              <Stack.Screen name="Tabs" component={Tabs} />
              <Stack.Screen name="Album" component={AlbumScreen} />
              <Stack.Screen name="Playlist" component={PlaylistScreen} />
              <Stack.Screen
                name="Player"
                component={PlayerScreen}
                options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }}
              />
            </Stack.Navigator>
          </NavigationContainer>
        </PlayerProvider>
      </LibraryProvider>
    </SafeAreaProvider>
  );
}
