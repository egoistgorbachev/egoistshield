import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Switch,
  Linking,
  StatusBar,
} from 'react-native';
import { useAppStore } from '../store/useAppStore';

/* ── Settings — matches desktop design ─────────────────────── */

export function SettingsScreen() {
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const servers = useAppStore((s) => s.servers);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a0f" />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>⚙️ Настройки</Text>
        </View>

        {/* Connection section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ПОДКЛЮЧЕНИЕ</Text>

          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Автоподключение</Text>
              <Text style={styles.settingDescription}>
                Подключаться при запуске приложения
              </Text>
            </View>
            <Switch
              value={settings.autoConnect}
              onValueChange={(v) => updateSettings({ autoConnect: v })}
              trackColor={{
                false: 'rgba(255,255,255,0.08)',
                true: 'rgba(255,107,0,0.4)',
              }}
              thumbColor={settings.autoConnect ? '#FF6B00' : '#555'}
            />
          </View>

          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Уведомления</Text>
              <Text style={styles.settingDescription}>
                Показывать статус подключения
              </Text>
            </View>
            <Switch
              value={settings.notifications}
              onValueChange={(v) => updateSettings({ notifications: v })}
              trackColor={{
                false: 'rgba(255,255,255,0.08)',
                true: 'rgba(255,107,0,0.4)',
              }}
              thumbColor={settings.notifications ? '#FF6B00' : '#555'}
            />
          </View>
        </View>

        {/* Info section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ИНФОРМАЦИЯ</Text>

          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Версия</Text>
              <Text style={styles.infoValue}>2.0.0</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Движок</Text>
              <Text style={styles.infoValue}>sing-box</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Серверов</Text>
              <Text style={styles.infoValue}>{servers.length}</Text>
            </View>
          </View>
        </View>

        {/* Links section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ССЫЛКИ</Text>

          <TouchableOpacity
            style={styles.linkItem}
            activeOpacity={0.7}
            onPress={() => Linking.openURL('https://t.me/egoist_shield')}
          >
            <Text style={styles.linkIcon}>💬</Text>
            <View style={styles.linkInfo}>
              <Text style={styles.linkLabel}>Telegram</Text>
              <Text style={styles.linkDescription}>Поддержка и обновления</Text>
            </View>
            <Text style={styles.linkArrow}>→</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.linkItem}
            activeOpacity={0.7}
            onPress={() =>
              Linking.openSettings()
            }
          >
            <Text style={styles.linkIcon}>📱</Text>
            <View style={styles.linkInfo}>
              <Text style={styles.linkLabel}>Настройки VPN</Text>
              <Text style={styles.linkDescription}>
                Системные настройки Android
              </Text>
            </View>
            <Text style={styles.linkArrow}>→</Text>
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerLogo}>🛡️</Text>
          <Text style={styles.footerTitle}>EgoistShield</Text>
          <Text style={styles.footerSubtitle}>
            Приватность без компромиссов
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0f',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },

  // Header
  header: {
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.9)',
  },

  // Section
  section: {
    marginTop: 28,
  },
  sectionTitle: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 3,
    marginBottom: 12,
    paddingLeft: 4,
  },

  // Setting item
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.025)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginBottom: 8,
  },
  settingInfo: {
    flex: 1,
    marginRight: 16,
  },
  settingLabel: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 15,
    fontWeight: '600',
  },
  settingDescription: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 13,
    marginTop: 2,
  },

  // Info card
  infoCard: {
    backgroundColor: 'rgba(255,255,255,0.025)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
  },
  infoLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    fontWeight: '500',
  },
  infoValue: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 14,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },

  // Link item
  linkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.025)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 8,
    gap: 12,
  },
  linkIcon: {
    fontSize: 22,
  },
  linkInfo: {
    flex: 1,
  },
  linkLabel: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 15,
    fontWeight: '600',
  },
  linkDescription: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 13,
    marginTop: 2,
  },
  linkArrow: {
    color: 'rgba(255,255,255,0.2)',
    fontSize: 18,
  },

  // Footer
  footer: {
    alignItems: 'center',
    marginTop: 48,
    paddingVertical: 24,
  },
  footerLogo: {
    fontSize: 48,
    marginBottom: 8,
  },
  footerTitle: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 2,
  },
  footerSubtitle: {
    color: 'rgba(255,255,255,0.2)',
    fontSize: 13,
    marginTop: 4,
  },
});
