import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
  Vibration,
  StatusBar,
} from 'react-native';
import { useAppStore } from '../store/useAppStore';
import { theme } from '../theme';

/* ── Dashboard — "Depth Power" (mobile port) ──────────────── */

function formatTimer(seconds: number): string {
  const h = String(Math.floor(seconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
  const s = String(seconds % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

export function DashboardScreen({ navigation }: any) {
  const isConnected = useAppStore((s) => s.isConnected);
  const isConnecting = useAppStore((s) => s.isConnecting);
  const selectedServer = useAppStore((s) => s.selectedServer);
  const servers = useAppStore((s) => s.servers);
  const errorMessage = useAppStore((s) => s.errorMessage);
  const connect = useAppStore((s) => s.connect);
  const disconnect = useAppStore((s) => s.disconnect);

  const [sessionSeconds, setSessionSeconds] = useState(0);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0.15)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const statusOpacity = useRef(new Animated.Value(0)).current;

  const currentServer = selectedServer
    ? servers.find((s) => s.id === selectedServer)
    : servers[0];

  // Glow pulse animation
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: isConnected || isConnecting ? 0.8 : 0.3,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: isConnected || isConnecting ? 0.5 : 0.15,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [isConnected, isConnecting]);

  // Connecting spinner
  useEffect(() => {
    if (isConnecting) {
      const spin = Animated.loop(
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration: 1000,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      );
      spin.start();
      return () => spin.stop();
    } else {
      rotateAnim.setValue(0);
    }
  }, [isConnecting]);

  // Status text fade-in
  useEffect(() => {
    statusOpacity.setValue(0);
    Animated.timing(statusOpacity, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();
  }, [isConnected, isConnecting]);

  // Session timer
  useEffect(() => {
    if (!isConnected) {
      setSessionSeconds(0);
      return;
    }
    const interval = setInterval(() => {
      setSessionSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isConnected]);

  const handlePress = async () => {
    Vibration.vibrate(30);

    // Button press animation
    Animated.sequence([
      Animated.timing(pulseAnim, {
        toValue: 0.92,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(pulseAnim, {
        toValue: 1,
        duration: 200,
        easing: Easing.out(Easing.back(2)),
        useNativeDriver: true,
      }),
    ]).start();

    if (isConnecting) return;

    if (!currentServer) {
      navigation.navigate('Серверы');
      return;
    }

    try {
      if (isConnected) {
        await disconnect();
      } else {
        await connect();
      }
    } catch (e: any) {
      console.error('VPN error:', e);
    }
  };

  const spinRotation = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const statusText = isConnecting
    ? 'ПОДКЛЮЧЕНИЕ...'
    : isConnected
      ? 'ЗАЩИЩЕНО'
      : 'ОТКЛЮЧЕНО';

  const statusColor = isConnected ? '#34D399' : '#FF6B00';

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a0f" />

      {/* Ambient background glow */}
      <Animated.View
        style={[
          styles.ambientGlow,
          {
            opacity: glowAnim,
            backgroundColor: isConnected
              ? 'rgba(16,185,129,0.12)'
              : 'rgba(255,107,0,0.12)',
          },
        ]}
      />

      {/* Main content */}
      <View style={styles.content}>
        {/* ═══ POWER BUTTON ═══ */}
        <View style={styles.buttonContainer}>
          {/* Outer glow ring */}
          <Animated.View
            style={[
              styles.outerGlow,
              {
                opacity: glowAnim,
                borderColor: isConnected
                  ? 'rgba(16,185,129,0.2)'
                  : 'rgba(255,107,0,0.2)',
                shadowColor: isConnected ? '#10B981' : '#FF6B00',
              },
            ]}
          />

          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <TouchableOpacity
              onPress={handlePress}
              activeOpacity={0.8}
              style={[
                styles.powerButton,
                {
                  shadowColor: isConnected ? '#10B981' : '#FF6B00',
                },
              ]}
            >
              {/* Button gradient background */}
              <View
                style={[
                  styles.powerButtonInner,
                  {
                    backgroundColor: isConnecting
                      ? '#FF6B00'
                      : isConnected
                        ? '#10B981'
                        : '#FF6B00',
                  },
                ]}
              >
                {/* Glass highlight */}
                <View style={styles.glassHighlight} />

                {/* Inner border */}
                <View style={styles.innerBorder} />

                {/* Icon */}
                {isConnecting ? (
                  <Animated.Text
                    style={[
                      styles.powerIcon,
                      { transform: [{ rotate: spinRotation }] },
                    ]}
                  >
                    ⟳
                  </Animated.Text>
                ) : (
                  <Text style={styles.powerIcon}>⏻</Text>
                )}
              </View>
            </TouchableOpacity>
          </Animated.View>
        </View>

        {/* ═══ STATUS TEXT ═══ */}
        <Animated.View style={[styles.statusContainer, { opacity: statusOpacity }]}>
          <Text
            style={[
              styles.statusText,
              {
                color: statusColor,
                textShadowColor: isConnected
                  ? 'rgba(52,211,153,0.6)'
                  : 'rgba(255,107,0,0.6)',
              },
            ]}
          >
            {statusText}
          </Text>

          {isConnected && currentServer && (
            <View style={styles.protocolBadge}>
              <Text style={styles.protocolText}>
                {(currentServer.protocol || 'VPN').toUpperCase()}
              </Text>
            </View>
          )}
        </Animated.View>

        {/* ═══ SESSION INFO (connected) ═══ */}
        {isConnected && (
          <View style={styles.sessionCard}>
            <Text style={styles.sessionLabel}>СЕССИЯ</Text>
            <Text style={styles.sessionTimer}>{formatTimer(sessionSeconds)}</Text>
          </View>
        )}

        {/* ═══ SERVER CARD ═══ */}
        <TouchableOpacity
          style={styles.serverCard}
          activeOpacity={0.7}
          onPress={() => navigation.navigate('Серверы')}
        >
          <View style={styles.serverIconContainer}>
            <Text style={styles.serverIcon}>🌐</Text>
          </View>
          <View style={styles.serverInfo}>
            <Text style={styles.serverLabel}>УЗЕЛ</Text>
            <Text style={styles.serverName} numberOfLines={1}>
              {currentServer ? currentServer.name : 'Выбрать сервер'}
            </Text>
          </View>
          <Text style={styles.chevron}>→</Text>
        </TouchableOpacity>

        {/* ═══ ERROR ═══ */}
        {errorMessage ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorIcon}>⚠</Text>
            <Text style={styles.errorText} numberOfLines={2}>
              {errorMessage}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0f',
  },
  ambientGlow: {
    position: 'absolute',
    top: '20%',
    left: '10%',
    width: '80%',
    height: '40%',
    borderRadius: 999,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 24,
  },

  // Power button
  buttonContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  outerGlow: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 2,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 30,
    elevation: 8,
  },
  powerButton: {
    width: 144,
    height: 144,
    borderRadius: 72,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 16,
  },
  powerButtonInner: {
    width: 144,
    height: 144,
    borderRadius: 72,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  glassHighlight: {
    position: 'absolute',
    top: 0,
    left: '10%',
    width: '80%',
    height: '45%',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderBottomLeftRadius: 72,
    borderBottomRightRadius: 72,
  },
  innerBorder: {
    position: 'absolute',
    top: 2,
    left: 2,
    right: 2,
    bottom: 2,
    borderRadius: 70,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  powerIcon: {
    fontSize: 42,
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },

  // Status
  statusContainer: {
    alignItems: 'center',
    gap: 10,
  },
  statusText: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 6,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 24,
  },
  protocolBadge: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  protocolText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 2,
  },

  // Session
  sessionCard: {
    backgroundColor: 'rgba(255,255,255,0.025)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    paddingHorizontal: 24,
    paddingVertical: 14,
    alignItems: 'center',
    width: '100%',
    maxWidth: 320,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
  },
  sessionLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 3,
    marginBottom: 4,
  },
  sessionTimer: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 28,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },

  // Server card
  serverCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.025)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    width: '100%',
    maxWidth: 320,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
  },
  serverIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.03)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  serverIcon: {
    fontSize: 20,
  },
  serverInfo: {
    flex: 1,
  },
  serverLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 3,
  },
  serverName: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 16,
    fontWeight: '600',
  },
  chevron: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 18,
  },

  // Error
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.2)',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    width: '100%',
    maxWidth: 320,
    gap: 10,
  },
  errorIcon: {
    fontSize: 16,
    color: '#EF4444',
  },
  errorText: {
    flex: 1,
    color: '#F87171',
    fontSize: 13,
    fontWeight: '600',
  },
});
