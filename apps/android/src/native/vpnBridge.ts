/**
 * Native VPN bridge — communicates with Kotlin VpnModule.
 */
import { NativeModules, Platform } from 'react-native';

const { VpnModule } = NativeModules;

export interface NativeVpnStatus {
  connected: boolean;
  configPath: string | null;
}

export interface RuntimeInfo {
  installed: boolean;
  path: string | null;
}

/**
 * VPN bridge API — wrapper around native VpnModule.
 */
export const vpnBridge = {
  /**
   * Connect to VPN using a sing-box JSON config.
   */
  connect: async (configJson: string): Promise<NativeVpnStatus> => {
    if (Platform.OS !== 'android') {
      return { connected: false, configPath: null };
    }
    return VpnModule.connect(configJson);
  },

  /**
   * Disconnect from VPN.
   */
  disconnect: async (): Promise<NativeVpnStatus> => {
    if (Platform.OS !== 'android') {
      return { connected: false, configPath: null };
    }
    return VpnModule.disconnect();
  },

  /**
   * Get current VPN connection status.
   */
  getStatus: async (): Promise<NativeVpnStatus> => {
    if (Platform.OS !== 'android') {
      return { connected: false, configPath: null };
    }
    return VpnModule.getStatus();
  },

  /**
   * Write a sing-box config to internal storage.
   */
  writeConfig: async (configJson: string, filename: string): Promise<string> => {
    if (Platform.OS !== 'android') {
      return '';
    }
    return VpnModule.writeConfig(configJson, filename);
  },

  /**
   * Check if VPN permission is granted.
   */
  isVpnPermissionGranted: async (): Promise<boolean> => {
    if (Platform.OS !== 'android') {
      return false;
    }
    return VpnModule.isVpnPermissionGranted();
  },

  /**
   * Check if sing-box runtime binary is installed.
   */
  isRuntimeInstalled: async (): Promise<RuntimeInfo> => {
    if (Platform.OS !== 'android') {
      return { installed: false, path: null };
    }
    return VpnModule.isRuntimeInstalled();
  },
};
