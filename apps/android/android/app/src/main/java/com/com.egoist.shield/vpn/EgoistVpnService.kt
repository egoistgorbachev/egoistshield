package com.egoist.shield.vpn

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.net.VpnService
import android.os.Build
import android.os.ParcelFileDescriptor
import android.util.Log
import com.egoist.shield.MainActivity

/**
 * EgoistVpnService — Android VpnService implementation.
 * Creates a TUN interface and routes traffic through sing-box proxy.
 */
class EgoistVpnService : VpnService() {

    companion object {
        const val TAG = "EgoistVPN"
        const val CHANNEL_ID = "egoist_vpn_channel"
        const val NOTIFICATION_ID = 1
        const val ACTION_CONNECT = "com.egoist.shield.CONNECT"
        const val ACTION_DISCONNECT = "com.egoist.shield.DISCONNECT"
        const val EXTRA_CONFIG_PATH = "configPath"

        var isRunning = false
            private set
        var currentConfigPath: String? = null
            private set
    }

    private var vpnInterface: ParcelFileDescriptor? = null
    private var singBoxRunner: SingBoxRunner? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_CONNECT -> {
                val configPath = intent.getStringExtra(EXTRA_CONFIG_PATH)
                if (configPath != null) {
                    startVpn(configPath)
                } else {
                    Log.e(TAG, "No config path provided")
                    stopSelf()
                }
            }
            ACTION_DISCONNECT -> {
                stopVpn()
                stopSelf()
            }
            else -> {
                Log.w(TAG, "Unknown action: ${intent?.action}")
            }
        }
        return START_STICKY
    }

    private fun startVpn(configPath: String) {
        try {
            // Start foreground notification
            val notification = createNotification("Подключение...")
            startForeground(NOTIFICATION_ID, notification)

            // Establish TUN interface
            val builder = Builder()
                .setSession("EgoistShield")
                .addAddress("172.19.0.1", 30)
                .addRoute("0.0.0.0", 0)
                .addDnsServer("1.1.1.1")
                .addDnsServer("8.8.8.8")
                .setMtu(9000)
                .setBlocking(false)

            // Allow sing-box to bypass VPN
            val singboxPath = "${applicationInfo.nativeLibraryDir}/libsingbox.so"
            try {
                builder.addDisallowedApplication(packageName)
            } catch (e: Exception) {
                Log.w(TAG, "Could not disallow own package: ${e.message}")
            }

            vpnInterface = builder.establish()

            if (vpnInterface == null) {
                Log.e(TAG, "Failed to establish VPN interface")
                stopSelf()
                return
            }

            // Start sing-box with the TUN fd
            singBoxRunner = SingBoxRunner(this)
            singBoxRunner?.start(configPath, vpnInterface!!.fd)

            isRunning = true
            currentConfigPath = configPath

            // Update notification
            val mgr = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
            mgr.notify(NOTIFICATION_ID, createNotification("Защищено ● VPN активен"))

            Log.i(TAG, "VPN started successfully")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start VPN", e)
            stopVpn()
            stopSelf()
        }
    }

    fun stopVpn() {
        try {
            singBoxRunner?.stop()
            singBoxRunner = null

            vpnInterface?.close()
            vpnInterface = null

            isRunning = false
            currentConfigPath = null

            stopForeground(STOP_FOREGROUND_REMOVE)
            Log.i(TAG, "VPN stopped")
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping VPN", e)
        }
    }

    override fun onRevoke() {
        stopVpn()
        stopSelf()
        super.onRevoke()
    }

    override fun onDestroy() {
        stopVpn()
        super.onDestroy()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "EgoistShield VPN",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "VPN connection status"
                setShowBadge(false)
            }
            val mgr = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
            mgr.createNotificationChannel(channel)
        }
    }

    private fun createNotification(text: String): Notification {
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return Notification.Builder(this, CHANNEL_ID)
            .setContentTitle("EgoistShield")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_lock_lock)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .build()
    }
}
