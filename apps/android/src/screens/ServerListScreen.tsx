import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  TextInput,
  Alert,
  Modal,
  StatusBar,
} from 'react-native';
import { useAppStore } from '../store/useAppStore';
import { parseVpnUri } from '../native/uriParser';

/* ── ServerList — matches desktop "Nodes" tab ──────────────── */

export function ServerListScreen({ navigation }: any) {
  const servers = useAppStore((s) => s.servers);
  const selectedServer = useAppStore((s) => s.selectedServer);
  const setSelectedServer = useAppStore((s) => s.setSelectedServer);
  const addServer = useAppStore((s) => s.addServer);
  const removeServer = useAppStore((s) => s.removeServer);
  const isConnected = useAppStore((s) => s.isConnected);

  const [searchQuery, setSearchQuery] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [importText, setImportText] = useState('');

  const filteredServers = servers.filter(
    (s) =>
      !searchQuery.trim() ||
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.protocol?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const handleImport = () => {
    if (!importText.trim()) return;

    const lines = importText.trim().split('\n').filter(Boolean);
    let added = 0;

    for (const line of lines) {
      try {
        const node = parseVpnUri(line.trim());
        if (node) {
          addServer(node);
          added++;
        }
      } catch (e) {
        // Skip invalid lines
      }
    }

    if (added > 0) {
      setImportText('');
      setIsAddModalOpen(false);
    } else {
      Alert.alert('Ошибка', 'Не удалось распознать VPN-конфигурации');
    }
  };

  const handleDelete = (serverId: string, serverName: string) => {
    Alert.alert('Удалить сервер?', serverName, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: () => removeServer(serverId),
      },
    ]);
  };

  const renderServer = ({ item }: any) => {
    const isSelected = selectedServer === item.id;
    const isActive = isConnected && isSelected;

    return (
      <TouchableOpacity
        style={[styles.serverItem, isSelected && styles.serverItemSelected]}
        activeOpacity={0.7}
        onPress={() => {
          setSelectedServer(item.id);
          navigation.navigate('Главная');
        }}
        onLongPress={() => handleDelete(item.id, item.name)}
      >
        {/* Flag/Globe */}
        <View style={styles.serverFlag}>
          <Text style={styles.flagEmoji}>
            {item.countryCode ? getFlagEmoji(item.countryCode) : '🌐'}
          </Text>
        </View>

        {/* Info */}
        <View style={styles.serverItemInfo}>
          <Text style={styles.serverItemName} numberOfLines={1}>
            {item.name}
          </Text>
          <View style={styles.serverMeta}>
            <Text style={styles.serverProtocol}>
              {(item.protocol || 'VPN').toUpperCase()}
            </Text>
            {item.address && (
              <Text style={styles.serverAddress} numberOfLines={1}>
                {item.address}
              </Text>
            )}
          </View>
        </View>

        {/* Status indicator */}
        {isActive ? (
          <View style={styles.activeIndicator}>
            <View style={styles.activeDot} />
          </View>
        ) : isSelected ? (
          <Text style={styles.checkmark}>✓</Text>
        ) : null}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a0f" />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>🖥 Серверы</Text>
          <Text style={styles.headerSubtitle}>
            {servers.length} {servers.length === 1 ? 'узел' : 'узлов'}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.addButton}
          activeOpacity={0.7}
          onPress={() => setIsAddModalOpen(true)}
        >
          <Text style={styles.addButtonText}>＋</Text>
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Поиск серверов..."
          placeholderTextColor="rgba(255,255,255,0.25)"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery ? (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Text style={styles.clearSearch}>✕</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Server list */}
      {filteredServers.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>📡</Text>
          <Text style={styles.emptyTitle}>Список узлов пуст</Text>
          <Text style={styles.emptySubtitle}>
            Нажмите ＋ для добавления конфигурации
          </Text>
          <TouchableOpacity
            style={styles.emptyButton}
            activeOpacity={0.7}
            onPress={() => setIsAddModalOpen(true)}
          >
            <Text style={styles.emptyButtonText}>Добавить</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filteredServers}
          keyExtractor={(item) => item.id}
          renderItem={renderServer}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Add Server Modal */}
      <Modal
        visible={isAddModalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setIsAddModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Добавить конфигурацию</Text>
              <TouchableOpacity onPress={() => setIsAddModalOpen(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.modalLabel}>
              Вставьте VPN-ссылки (по одной на строку):
            </Text>

            <TextInput
              style={styles.modalInput}
              multiline
              numberOfLines={6}
              placeholder={
                'vless://...\nvmess://...\nss://...\ntrojan://...\nhysteria2://...'
              }
              placeholderTextColor="rgba(255,255,255,0.15)"
              value={importText}
              onChangeText={setImportText}
              textAlignVertical="top"
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => setIsAddModalOpen(false)}
              >
                <Text style={styles.modalCancelText}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalImport,
                  !importText.trim() && styles.modalImportDisabled,
                ]}
                onPress={handleImport}
                disabled={!importText.trim()}
              >
                <Text style={styles.modalImportText}>Импорт</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function getFlagEmoji(countryCode: string): string {
  try {
    const code = countryCode.toUpperCase();
    if (code.length !== 2) return '🌐';
    const codePoints = [...code].map(
      (c) => 0x1f1e6 + c.charCodeAt(0) - 65,
    );
    return String.fromCodePoint(...codePoints);
  } catch {
    return '🌐';
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0f',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.9)',
  },
  headerSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 2,
  },
  addButton: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonText: {
    fontSize: 24,
    color: '#FF6B00',
    fontWeight: '600',
  },

  // Search
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 16,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchIcon: {
    fontSize: 14,
    marginRight: 8,
    opacity: 0.4,
  },
  searchInput: {
    flex: 1,
    color: 'rgba(255,255,255,0.9)',
    fontSize: 15,
    padding: 0,
  },
  clearSearch: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 14,
    paddingLeft: 8,
  },

  // List
  list: {
    paddingHorizontal: 20,
    paddingBottom: 100,
    gap: 8,
  },

  // Server item
  serverItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.025)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 12,
  },
  serverItemSelected: {
    borderColor: 'rgba(255,107,0,0.3)',
    backgroundColor: 'rgba(255,107,0,0.05)',
  },
  serverFlag: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  flagEmoji: {
    fontSize: 22,
  },
  serverItemInfo: {
    flex: 1,
  },
  serverItemName: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 15,
    fontWeight: '600',
  },
  serverMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 3,
  },
  serverProtocol: {
    color: 'rgba(255,107,0,0.7)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  serverAddress: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 11,
  },
  activeIndicator: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(16,185,129,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#10B981',
  },
  checkmark: {
    color: '#FF6B00',
    fontSize: 18,
    fontWeight: '700',
  },

  // Empty state
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptySubtitle: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 24,
  },
  emptyButton: {
    backgroundColor: '#FF6B00',
    borderRadius: 14,
    paddingHorizontal: 28,
    paddingVertical: 14,
    shadowColor: '#FF6B00',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  emptyButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1a1a24',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 40,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 20,
    fontWeight: '700',
  },
  modalClose: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 20,
    padding: 4,
  },
  modalLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    marginBottom: 12,
  },
  modalInput: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    padding: 14,
    minHeight: 140,
    fontFamily: 'monospace',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  modalCancel: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  modalCancelText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 15,
    fontWeight: '600',
  },
  modalImport: {
    flex: 1,
    backgroundColor: '#FF6B00',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    shadowColor: '#FF6B00',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  modalImportDisabled: {
    opacity: 0.4,
  },
  modalImportText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
