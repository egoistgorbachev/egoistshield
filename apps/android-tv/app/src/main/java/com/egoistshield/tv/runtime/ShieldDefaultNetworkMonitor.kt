package com.egoistshield.tv.runtime

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.egoistshield.tv.BuildConfig
import io.nekohasekai.libbox.InterfaceUpdateListener
import java.net.NetworkInterface

object ShieldDefaultNetworkMonitor {
  private const val TAG = "ShieldDefaultNetwork"
  private val mainHandler = Handler(Looper.getMainLooper())
  private val request = NetworkRequest.Builder()
    .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    .addCapability(NetworkCapabilities.NET_CAPABILITY_NOT_RESTRICTED)
    .build()

  @Volatile
  private var connectivity: ConnectivityManager? = null

  @Volatile
  private var defaultNetwork: Network? = null

  @Volatile
  private var listener: InterfaceUpdateListener? = null

  @Volatile
  private var callback: ConnectivityManager.NetworkCallback? = null

  fun start(context: Context) {
    val manager = context.getSystemService(ConnectivityManager::class.java) ?: return
    connectivity = manager
    if (callback == null) {
      val networkCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
          defaultNetwork = network
          checkDefaultInterfaceUpdate(network)
        }

        override fun onCapabilitiesChanged(
          network: Network,
          networkCapabilities: android.net.NetworkCapabilities
        ) {
          if (network == defaultNetwork) {
            checkDefaultInterfaceUpdate(network)
          }
        }

        override fun onLinkPropertiesChanged(
          network: Network,
          linkProperties: android.net.LinkProperties
        ) {
          if (network == defaultNetwork) {
            checkDefaultInterfaceUpdate(network)
          }
        }

        override fun onLost(network: Network) {
          if (network == defaultNetwork) {
            defaultNetwork = manager.activeNetwork
            checkDefaultInterfaceUpdate(defaultNetwork)
          }
        }
      }
      when {
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> {
          manager.registerBestMatchingNetworkCallback(request, networkCallback, mainHandler)
        }
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.P -> {
          manager.requestNetwork(request, networkCallback, mainHandler)
        }
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.O -> {
          manager.registerDefaultNetworkCallback(networkCallback, mainHandler)
        }
        else -> {
          manager.registerDefaultNetworkCallback(networkCallback)
        }
      }
      callback = networkCallback
      debugLog("Default network callback registered")
    }

    defaultNetwork = manager.activeNetwork
    checkDefaultInterfaceUpdate(defaultNetwork)
  }

  fun stop() {
    val manager = connectivity
    val networkCallback = callback
    if (manager != null && networkCallback != null) {
      runCatching {
        manager.unregisterNetworkCallback(networkCallback)
      }.onFailure {
        Log.w(TAG, "Unable to unregister default network callback", it)
      }
    }
    callback = null
    defaultNetwork = null
    checkDefaultInterfaceUpdate(null)
    listener = null
    connectivity = null
  }

  fun setListener(listener: InterfaceUpdateListener?) {
    this.listener = listener
    checkDefaultInterfaceUpdate(defaultNetwork)
  }

  private fun checkDefaultInterfaceUpdate(network: Network?) {
    val currentListener = listener ?: return
    val manager = connectivity
    if (network == null || manager == null) {
      currentListener.updateDefaultInterface("", -1, false, false)
      return
    }

    val interfaceName = manager.getLinkProperties(network)?.interfaceName ?: return
    repeat(10) {
      val interfaceIndex = runCatching {
        NetworkInterface.getByName(interfaceName)?.index ?: -1
      }.getOrDefault(-1)

      if (interfaceIndex >= 0) {
        debugLog("Default network updated: $interfaceName#$interfaceIndex")
        currentListener.updateDefaultInterface(interfaceName, interfaceIndex, false, false)
        return
      }

      Thread.sleep(100)
    }

    Log.w(TAG, "Default interface index is unavailable for $interfaceName")
    currentListener.updateDefaultInterface(interfaceName, -1, false, false)
  }

  private fun debugLog(message: String) {
    if (BuildConfig.DEBUG) {
      Log.d(TAG, message)
    }
  }
}
