import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { SafeHerProvider } from '@/context/SafeHerContext';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeHerProvider>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Info' }} />
            <Stack.Screen
              name="sos"
              options={{ headerShown: false, presentation: 'fullScreenModal' }}
            />
            <Stack.Screen
              name="fake-call"
              options={{ headerShown: false, presentation: 'fullScreenModal' }}
            />
            <Stack.Screen
              name="add-contact"
              options={{
                headerShown: true,
                title: 'Add Contact',
                headerStyle: { backgroundColor: '#E8547A' },
                headerTintColor: '#fff',
              }}
            />
            <Stack.Screen
              name="add-safe-zone"
              options={{
                headerShown: true,
                title: 'Add Safe Zone',
                headerStyle: { backgroundColor: '#E8547A' },
                headerTintColor: '#fff',
              }}
            />
            <Stack.Screen
              name="guardian-setup"
              options={{
                headerShown: false,
              }}
            />
            <Stack.Screen
              name="safe-route"
              options={{
                headerShown: false,
              }}
            />
          </Stack>
          <StatusBar style="auto" />
        </ThemeProvider>
      </SafeHerProvider>
    </GestureHandlerRootView>
  );
}
