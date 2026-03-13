import React from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { ServerListScreen } from './src/screens/ServerListScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';

const Tab = createBottomTabNavigator();

/* ── Dark theme matching desktop ──────────────────────────── */
const DarkTheme = {
  ...DefaultTheme,
  dark: true,
  colors: {
    ...DefaultTheme.colors,
    primary: '#FF6B00',
    background: '#0a0a0f',
    card: '#0f0f18',
    text: '#FFFFFF',
    border: 'rgba(255,255,255,0.06)',
    notification: '#FF6B00',
  },
};

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  const icons: Record<string, string> = {
    'Главная': '🛡️',
    'Серверы': '🖥️',
    'Настройки': '⚙️',
  };
  return (
    <View style={[tabStyles.iconContainer, focused && tabStyles.iconContainerActive]}>
      <Text style={[tabStyles.icon, focused && tabStyles.iconActive]}>
        {icons[name] || '●'}
      </Text>
    </View>
  );
}

const tabStyles = StyleSheet.create({
  iconContainer: {
    width: 42,
    height: 32,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainerActive: {
    backgroundColor: 'rgba(255,107,0,0.12)',
  },
  icon: {
    fontSize: 18,
    opacity: 0.4,
  },
  iconActive: {
    opacity: 1,
  },
});

export default function App() {
  return (
    <NavigationContainer theme={DarkTheme}>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarIcon: ({ focused }) => (
            <TabIcon name={route.name} focused={focused} />
          ),
          tabBarActiveTintColor: '#FF6B00',
          tabBarInactiveTintColor: 'rgba(255,255,255,0.3)',
          tabBarStyle: {
            backgroundColor: '#0f0f18',
            borderTopColor: 'rgba(255,255,255,0.04)',
            borderTopWidth: 1,
            height: Platform.OS === 'android' ? 64 : 80,
            paddingBottom: Platform.OS === 'android' ? 8 : 24,
            paddingTop: 8,
            elevation: 0,
          },
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: '600',
            marginTop: 2,
          },
        })}
      >
        <Tab.Screen name="Главная" component={DashboardScreen} />
        <Tab.Screen name="Серверы" component={ServerListScreen} />
        <Tab.Screen name="Настройки" component={SettingsScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
