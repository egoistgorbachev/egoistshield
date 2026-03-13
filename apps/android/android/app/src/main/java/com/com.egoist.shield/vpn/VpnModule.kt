package com.egoist.shield.vpn

import android.app.Activity
import android.content.Intent
import android.net.VpnService
import android.util.Log
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.File
import java.io.FileWriter

/**
 * VpnModule — React Native Native Module bridge for VPN operations.
 * Exposes connect, disconnect, status, and config management to JS.
 */
class VpnModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), ActivityEventListener {

    companion object {
        const val TAG = "VpnModule"
        const val VPN_REQUEST_CODE = 7777
        const val NAME = "VpnModule"
    }

    private var pendingConfigJson: String? = null
    private var pendingConnectPromise: Promise? = null

    init {
        reactContext.addActivityEventListener(this)
    }

    override fun getName(): String = NAME

    /**
     * Connect to VPN with a sing-box JSON config.
     * @param configJson The sing-box configuration JSON string
     * @param promise JS promise to resolve/reject
     */
    @ReactMethod
    fun connect(configJson: String, promise: Promise) {
        try {
            // Check if VPN permission is granted
            val intent = VpnService.prepare(reactContext)
            if (intent != null) {
                // Need to request VPN permission
                pendingConfigJson = configJson
                pendingConnectPromise = promise
                reactContext.currentActivity?.startActivityForResult(intent, VPN_REQUEST_CODE)
                return
            }

            // Permission already granted, start VPN
            startVpnService(configJson, promise)
        } catch (e: Exception) {
            promise.reject("VPN_ERROR", "Failed to connect: ${e.message}", e)
        }
    }

    /**
     * Disconnect from VPN.
     */
    @ReactMethod
    fun disconnect(promise: Promise) {
        try {
            val intent = Intent(reactContext, EgoistVpnService::class.java).apply {
                action = EgoistVpnService.ACTION_DISCONNECT
            }
            reactContext.startService(intent)

            promise.resolve(createStatusMap(false))
        } catch (e: Exception) {
            promise.reject("VPN_ERROR", "Failed to disconnect: ${e.message}", e)
        }
    }

    /**
     * Get current VPN status.
     */
    @ReactMethod
    fun getStatus(promise: Promise) {
        try {
            promise.resolve(createStatusMap(EgoistVpnService.isRunning))
        } catch (e: Exception) {
            promise.reject("VPN_ERROR", "Failed to get status: ${e.message}", e)
        }
    }

    /**
     * Write a sing-box config file to internal storage.
     * Returns the path to the config file.
     */
    @ReactMethod
    fun writeConfig(configJson: String, filename: String, promise: Promise) {
        try {
            val configDir = File(reactContext.filesDir, "configs")
            if (!configDir.exists()) configDir.mkdirs()

            val configFile = File(configDir, filename)
            FileWriter(configFile).use { it.write(configJson) }

            promise.resolve(configFile.absolutePath)
        } catch (e: Exception) {
            promise.reject("CONFIG_ERROR", "Failed to write config: ${e.message}", e)
        }
    }

    /**
     * Check if VPN permission has been granted.
     */
    @ReactMethod
    fun isVpnPermissionGranted(promise: Promise) {
        try {
            val intent = VpnService.prepare(reactContext)
            promise.resolve(intent == null)
        } catch (e: Exception) {
            promise.reject("VPN_ERROR", "Failed to check permission: ${e.message}", e)
        }
    }

    /**
     * Check if sing-box binary exists on the device.
     */
    @ReactMethod
    fun isRuntimeInstalled(promise: Promise) {
        try {
            val nativeLib = File(reactContext.applicationInfo.nativeLibraryDir, "libsingbox.so")
            val appRuntime = File(reactContext.filesDir, "runtime/sing-box")

            val map = Arguments.createMap().apply {
                putBoolean("installed", nativeLib.exists() || appRuntime.exists())
                putString("path", when {
                    nativeLib.exists() -> nativeLib.absolutePath
                    appRuntime.exists() -> appRuntime.absolutePath
                    else -> null
                })
            }
            promise.resolve(map)
        } catch (e: Exception) {
            promise.reject("RUNTIME_ERROR", "Failed to check runtime: ${e.message}", e)
        }
    }

    // ────── Internal ──────

    private fun startVpnService(configJson: String, promise: Promise) {
        try {
            // Write config to file
            val configDir = File(reactContext.filesDir, "configs")
            if (!configDir.exists()) configDir.mkdirs()
            val configFile = File(configDir, "active.json")
            FileWriter(configFile).use { it.write(configJson) }

            // Start VPN service
            val intent = Intent(reactContext, EgoistVpnService::class.java).apply {
                action = EgoistVpnService.ACTION_CONNECT
                putExtra(EgoistVpnService.EXTRA_CONFIG_PATH, configFile.absolutePath)
            }
            reactContext.startForegroundService(intent)

            // Wait a moment for VPN to start, then resolve
            android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                promise.resolve(createStatusMap(EgoistVpnService.isRunning))
            }, 1500)
        } catch (e: Exception) {
            promise.reject("VPN_ERROR", "Failed to start VPN service: ${e.message}", e)
        }
    }

    private fun createStatusMap(connected: Boolean): WritableMap {
        return Arguments.createMap().apply {
            putBoolean("connected", connected)
            putString("configPath", EgoistVpnService.currentConfigPath)
        }
    }

    private fun sendEvent(eventName: String, params: WritableMap?) {
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    // ────── Activity Result (VPN Permission) ──────

    override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode == VPN_REQUEST_CODE) {
            if (resultCode == Activity.RESULT_OK) {
                // VPN permission granted
                val configJson = pendingConfigJson
                val promise = pendingConnectPromise

                pendingConfigJson = null
                pendingConnectPromise = null

                if (configJson != null && promise != null) {
                    startVpnService(configJson, promise)
                }
            } else {
                // VPN permission denied
                pendingConnectPromise?.reject("VPN_PERMISSION_DENIED", "User denied VPN permission")
                pendingConnectPromise = null
                pendingConfigJson = null
            }
        }
    }

    override fun onNewIntent(intent: Intent) {}
}
