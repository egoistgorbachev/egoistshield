package com.egoistshield.tv.runtime

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.ProxyInfo
import android.net.VpnService
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.ParcelFileDescriptor
import android.os.Process
import android.system.OsConstants
import android.util.Base64
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import io.nekohasekai.libbox.CommandServer
import io.nekohasekai.libbox.CommandServerHandler
import io.nekohasekai.libbox.ConnectionOwner
import io.nekohasekai.libbox.InterfaceUpdateListener
import io.nekohasekai.libbox.Libbox
import io.nekohasekai.libbox.LocalDNSTransport
import io.nekohasekai.libbox.NeighborUpdateListener
import io.nekohasekai.libbox.NetworkInterface
import io.nekohasekai.libbox.NetworkInterfaceIterator
import io.nekohasekai.libbox.Notification as LibboxNotification
import io.nekohasekai.libbox.OverrideOptions
import io.nekohasekai.libbox.PlatformInterface
import io.nekohasekai.libbox.RoutePrefix
import io.nekohasekai.libbox.RoutePrefixIterator
import io.nekohasekai.libbox.StringIterator
import io.nekohasekai.libbox.SystemProxyStatus
import io.nekohasekai.libbox.TunOptions
import io.nekohasekai.libbox.WIFIState
import com.egoistshield.tv.MainActivity
import com.egoistshield.tv.R
import java.io.File
import java.net.InterfaceAddress
import java.net.Inet6Address
import java.net.InetSocketAddress
import java.net.NetworkInterface as JavaNetworkInterface
import java.security.KeyStore
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class ShieldVpnService : VpnService(), PlatformInterface, CommandServerHandler {
  private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
  private val connectivity by lazy { getSystemService(ConnectivityManager::class.java) }
  private val wifiManager by lazy { getSystemService(WifiManager::class.java) }
  private val notificationManager by lazy { getSystemService(NotificationManager::class.java) }

  private var commandServer: CommandServer? = null
  private var tunFileDescriptor: ParcelFileDescriptor? = null
  private var currentLaunch: RuntimeLaunchRequest? = null
  @Volatile
  private var shuttingDown = false

  override fun onCreate() {
    super.onCreate()
    RuntimeDiagnostics.initialize(this)
    ensureNotificationChannel()
    RuntimeDiagnostics.record("service", "VPN service создан и готов к запуску.", context = this)
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_STOP -> {
        RuntimeDiagnostics.record("service", "Получена команда остановки runtime.", context = this)
        serviceScope.launch {
          stopRuntime("Туннель остановлен.")
        }
        return START_NOT_STICKY
      }

      ACTION_START, null -> {
        shuttingDown = false
        val request = intent.toLaunchRequest()
        if (request == null) {
          RuntimeDiagnostics.record(
            "service",
            "Foreground service получил пустой launch request.",
            level = "ERROR",
            context = this
          )
          EmbeddedSingBoxRuntime.markError("Не найден подготовленный runtime-профиль.")
          stopSelf()
          return START_NOT_STICKY
        }

        currentLaunch = request
        RuntimeDiagnostics.record(
          "service",
          "Foreground service запускает профиль ${request.profileName}.",
          context = this
        )
        EmbeddedSingBoxRuntime.markStarting(request, "Запускаем туннель ${request.profileName}...")
        startRuntimeForeground(buildForegroundNotification(request.profileName, "Запуск встроенного VPN runtime"))
        serviceScope.launch {
          startOrReload(request)
        }
        return START_REDELIVER_INTENT
      }
    }

    return START_NOT_STICKY
  }

  override fun onBind(intent: Intent): IBinder? = super.onBind(intent)

  override fun onDestroy() {
    RuntimeDiagnostics.record(
      "service",
      if (shuttingDown) "VPN service завершает работу штатно." else "VPN service уничтожен системой или оболочкой.",
      level = if (shuttingDown) "INFO" else "WARN",
      context = this
    )
    runCatching { shutdownRuntime() }
    serviceScope.cancel()
    super.onDestroy()
  }

  override fun onRevoke() {
    RuntimeDiagnostics.record("service", "Системное VPN-разрешение отозвано Android.", level = "WARN", context = this)
    serviceScope.launch {
      stopRuntime("Разрешение VPN отозвано системой.")
    }
  }

  override fun autoDetectInterfaceControl(fd: Int) {
    protect(fd)
  }

  override fun clearDNSCache() = Unit

  override fun closeDefaultInterfaceMonitor(listener: InterfaceUpdateListener) {
    ShieldDefaultNetworkMonitor.setListener(null)
  }

  override fun closeNeighborMonitor(listener: NeighborUpdateListener) = Unit

  override fun findConnectionOwner(
    ipProtocol: Int,
    sourceAddress: String,
    sourcePort: Int,
    destinationAddress: String,
    destinationPort: Int
  ): ConnectionOwner {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
      return ConnectionOwner()
    }

    return runCatching {
      val uid = connectivity?.getConnectionOwnerUid(
        ipProtocol,
        InetSocketAddress(sourceAddress, sourcePort),
        InetSocketAddress(destinationAddress, destinationPort)
      ) ?: Process.INVALID_UID
      if (uid == Process.INVALID_UID) return@runCatching ConnectionOwner()

      val packages = packageManager.getPackagesForUid(uid).orEmpty().toList()
      ConnectionOwner().apply {
        userId = uid
        userName = packages.firstOrNull().orEmpty()
        setAndroidPackageNames(StringArray(packages))
      }
    }.getOrElse {
      Log.w(TAG, "Unable to resolve connection owner", it)
      ConnectionOwner()
    }
  }

  override fun getInterfaces(): NetworkInterfaceIterator {
    val networks = connectivity?.allNetworks.orEmpty()
    val javaInterfaces = runCatching { JavaNetworkInterface.getNetworkInterfaces().toList() }
      .getOrDefault(emptyList())
    val interfaces = mutableListOf<NetworkInterface>()

    networks.forEach { network ->
      val linkProperties = connectivity?.getLinkProperties(network) ?: return@forEach
      val capabilities = connectivity?.getNetworkCapabilities(network) ?: return@forEach
      val javaInterface = javaInterfaces.firstOrNull { it.name == linkProperties.interfaceName } ?: return@forEach

      interfaces += NetworkInterface().apply {
        index = javaInterface.index
        name = javaInterface.name
        mtu = runCatching { javaInterface.mtu }.getOrDefault(1500)
        addresses = StringArray(javaInterface.interfaceAddresses.map { interfaceAddress ->
          interfaceAddress.toRoutePrefixString()
        })
        dnsServer = StringArray(linkProperties.dnsServers.mapNotNull { it.hostAddress })
        type = when {
          capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> Libbox.InterfaceTypeWIFI
          capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> Libbox.InterfaceTypeCellular
          capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> Libbox.InterfaceTypeEthernet
          else -> Libbox.InterfaceTypeOther
        }
        flags = buildInterfaceFlags(javaInterface, capabilities)
        metered = !capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED)
      }
    }

    return NetworkInterfaceArray(interfaces)
  }

  override fun getSystemProxyStatus(): SystemProxyStatus {
    return SystemProxyStatus().apply {
      available = false
      enabled = false
    }
  }

  override fun includeAllNetworks(): Boolean = false

  override fun localDNSTransport(): LocalDNSTransport? = null

  override fun openTun(options: TunOptions): Int {
    debugLog("openTun requested on thread=${Thread.currentThread().name}")
    if (prepare(this) != null) error("android: missing vpn permission")
    debugLog("openTun permission check passed")
    RuntimeDiagnostics.record(
      "tun",
      "Начинаем создание TUN-интерфейса (mtu=${options.mtu}, autoRoute=${options.autoRoute}).",
      context = this
    )

    val builder = Builder()
      .setSession("EgoistShield TV")
      .setMtu(options.mtu)
    debugLog("openTun builder created with mtu=${options.mtu}")

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      builder.setMetered(false)
    }

    val inet4Address = options.inet4Address
    while (inet4Address.hasNext()) {
      val address = inet4Address.next()
      builder.addAddress(address.address(), address.prefix())
    }
    debugLog("openTun added IPv4 addresses")

    val inet6Address = options.inet6Address
    while (inet6Address.hasNext()) {
      val address = inet6Address.next()
      builder.addAddress(address.address(), address.prefix())
    }
    debugLog("openTun added IPv6 addresses")

    if (options.autoRoute) {
      val dnsServerAddress = options.dnsServerAddress.value
      if (!dnsServerAddress.isNullOrBlank()) {
        builder.addDnsServer(dnsServerAddress)
      }
      debugLog("openTun dns configured: ${dnsServerAddress ?: "<empty>"}")

      addRoutes(
        builder,
        options.inet4RouteAddress,
        options.inet4RouteRange,
        options.inet4Address,
        "0.0.0.0"
      )
      addRoutes(
        builder,
        options.inet6RouteAddress,
        options.inet6RouteRange,
        options.inet6Address,
        "::"
      )
      debugLog("openTun routes configured")

      addAllowedPackages(builder, options.includePackage)
      addDisallowedPackages(builder, options.excludePackage)
      debugLog("openTun package filters configured")
    }

    if (options.isHTTPProxyEnabled && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      builder.setHttpProxy(
        ProxyInfo.buildDirectProxy(
          options.httpProxyServer,
          options.httpProxyServerPort,
          collectIterator(options.httpProxyBypassDomain)
        )
      )
      debugLog("openTun HTTP proxy configured for ${options.httpProxyServer}:${options.httpProxyServerPort}")
    }

    debugLog("openTun builder configured, requesting establish()")
    val established = establishTunOnMainThread(builder)
      ?: error("android: the application is not prepared or is revoked")
    debugLog("openTun establish() completed with fd=${established.fd}")
    RuntimeDiagnostics.record("tun", "TUN-интерфейс успешно создан (fd=${established.fd}).", context = this)
    tunFileDescriptor = established
    return established.fd
  }

  override fun readWIFIState(): WIFIState? {
    @Suppress("DEPRECATION")
    val info = wifiManager?.connectionInfo ?: return null
    var ssid = info.ssid ?: return null
    if (ssid == "<unknown ssid>") {
      ssid = ""
    }
    if (ssid.startsWith("\"") && ssid.endsWith("\"")) {
      ssid = ssid.substring(1, ssid.length - 1)
    }
    return WIFIState(ssid, info.bssid.orEmpty())
  }

  override fun registerMyInterface(name: String) = Unit

  override fun sendNotification(notification: LibboxNotification) {
    val builder = NotificationCompat.Builder(this, NOTIFICATION_CHANNEL_ID)
      .setSmallIcon(R.mipmap.ic_launcher)
      .setContentTitle(notification.title)
      .setContentText(notification.body)
      .setStyle(NotificationCompat.BigTextStyle().bigText(notification.body))
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setAutoCancel(true)

    notification.subtitle
      ?.takeIf { it.isNotBlank() }
      ?.let(builder::setSubText)

    notificationManager?.notify(NOTIFICATION_ID + notification.typeID, builder.build())
  }

  override fun serviceReload() {
    val request = currentLaunch ?: return
    RuntimeDiagnostics.record("service", "libbox запросил reload активного профиля.", context = this)
    serviceScope.launch {
      startOrReload(request)
    }
  }

  override fun serviceStop() {
    RuntimeDiagnostics.record("service", "libbox запросил остановку runtime.", context = this)
    serviceScope.launch {
      stopRuntime("Туннель остановлен ядром libbox.")
    }
  }

  override fun setSystemProxyEnabled(isEnabled: Boolean) = Unit

  override fun startDefaultInterfaceMonitor(listener: InterfaceUpdateListener) {
    ShieldDefaultNetworkMonitor.setListener(listener)
  }

  override fun startNeighborMonitor(listener: NeighborUpdateListener) = Unit

  override fun systemCertificates(): StringIterator {
    val keyStore = KeyStore.getInstance("AndroidCAStore").apply {
      load(null, null)
    }
    val certificates = mutableListOf<String>()
    val aliases = keyStore.aliases()
    while (aliases.hasMoreElements()) {
      val cert = keyStore.getCertificate(aliases.nextElement()) ?: continue
      certificates += buildString {
        append("-----BEGIN CERTIFICATE-----\n")
        append(Base64.encodeToString(cert.encoded, Base64.NO_WRAP))
        append("\n-----END CERTIFICATE-----")
      }
    }
    return StringArray(certificates)
  }

  override fun underNetworkExtension(): Boolean = false

  override fun usePlatformAutoDetectInterfaceControl(): Boolean = true

  override fun useProcFS(): Boolean = Build.VERSION.SDK_INT < Build.VERSION_CODES.Q

  override fun writeDebugMessage(message: String) {
    Log.d(TAG, message)
  }

  private fun debugLog(message: String) {
    if (com.egoistshield.tv.BuildConfig.DEBUG) {
      Log.d(TAG, message)
    }
  }

  private suspend fun startOrReload(request: RuntimeLaunchRequest) {
    runCatching {
      if (prepare(this) != null) {
        error("Системное разрешение VPN ещё не подтверждено.")
      }

      RuntimeDiagnostics.record(
        "runtime",
        "Инициализируем сетевой монитор и command server для ${request.profileName}.",
        context = this
      )
      ShieldDefaultNetworkMonitor.start(this)

      val configContent = File(request.configPath).readText()
      val server = commandServer ?: CommandServer(this, this).also {
        it.start()
        commandServer = it
        RuntimeDiagnostics.record("runtime", "Command server libbox успешно поднят.", context = this)
      }

      server.startOrReloadService(
        configContent,
        OverrideOptions().apply {
          autoRedirect = false
        }
      )

      withContext(Dispatchers.Main) {
        startRuntimeForeground(buildForegroundNotification(request.profileName, "Tunnel активен"))
      }
      RuntimeDiagnostics.record("runtime", "Встроенный туннель активен для ${request.profileName}.", context = this)
      EmbeddedSingBoxRuntime.markRunning(
        request,
        "Tunnel активен: ${request.profileName}. Трафик идёт через встроенный libbox runtime."
      )
    }.onFailure { error ->
      Log.e(TAG, "Unable to start embedded runtime", error)
      RuntimeDiagnostics.record(
        "runtime",
        error.message ?: "Не удалось запустить встроенный туннель.",
        level = "ERROR",
        context = this
      )
      shutdownRuntime()
      EmbeddedSingBoxRuntime.markError(
        error.message ?: "Не удалось запустить встроенный туннель.",
        request
      )
      stopSelf()
    }
  }

  private suspend fun stopRuntime(message: String) {
    if (shuttingDown) return
    shuttingDown = true
    RuntimeDiagnostics.record("runtime", message, context = this)
    shutdownRuntime()
    EmbeddedSingBoxRuntime.markIdle(message)
    stopSelf()
  }

  private fun shutdownRuntime() {
    RuntimeDiagnostics.record("runtime", "Освобождаем ресурсы foreground runtime.", context = this)
    ShieldDefaultNetworkMonitor.stop()

    tunFileDescriptor?.runCatching(ParcelFileDescriptor::close)
    tunFileDescriptor = null

    commandServer?.runCatching { closeService() }
    commandServer?.close()
    commandServer = null
    currentLaunch = null

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      stopForeground(STOP_FOREGROUND_REMOVE)
    } else {
      @Suppress("DEPRECATION")
      stopForeground(true)
    }
  }

  private fun establishTunOnMainThread(builder: Builder): ParcelFileDescriptor? {
    if (Looper.myLooper() == Looper.getMainLooper()) {
      return builder.establish()
    }

    val latch = CountDownLatch(1)
    var result: ParcelFileDescriptor? = null
    var failure: Throwable? = null
    Handler(Looper.getMainLooper()).post {
      try {
        result = builder.establish()
      } catch (error: Throwable) {
        failure = error
      } finally {
        latch.countDown()
      }
    }

    if (!latch.await(15, TimeUnit.SECONDS)) {
      error("Timed out while establishing the Android VPN interface.")
    }
    failure?.let { throw it }
    return result
  }

  private fun ensureNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val channel = NotificationChannel(
      NOTIFICATION_CHANNEL_ID,
      "EgoistShield VPN Runtime",
      NotificationManager.IMPORTANCE_LOW
    ).apply {
      description = "Уведомление о работе туннеля EgoistShield."
    }
    notificationManager?.createNotificationChannel(channel)
  }

  private fun buildForegroundNotification(
    profileName: String,
    statusText: String
  ): Notification {
    val contentIntent = PendingIntent.getActivity(
      this,
      0,
      Intent(this, MainActivity::class.java).apply {
        flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
      },
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    )
    val stopIntent = PendingIntent.getService(
      this,
      1,
      stopIntent(this),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    )

    return NotificationCompat.Builder(this, NOTIFICATION_CHANNEL_ID)
      .setSmallIcon(R.mipmap.ic_launcher)
      .setContentTitle(profileName)
      .setContentText(statusText)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .setOngoing(true)
      .setContentIntent(contentIntent)
      .addAction(R.mipmap.ic_launcher, "Остановить", stopIntent)
      .build()
  }

  private fun startRuntimeForeground(notification: Notification) {
    ServiceCompat.startForeground(
      this,
      NOTIFICATION_ID,
      notification,
      ServiceInfo.FOREGROUND_SERVICE_TYPE_MANIFEST
    )
  }

  private fun addRoutes(
    builder: Builder,
    primaryRoutes: RoutePrefixIterator,
    fallbackRoutes: RoutePrefixIterator,
    addresses: RoutePrefixIterator,
    defaultRoute: String
  ) {
    var hasRoute = false
    while (primaryRoutes.hasNext()) {
      val route = primaryRoutes.next()
      builder.addRoute(route.address(), route.prefix())
      hasRoute = true
    }

    if (!hasRoute) {
      while (fallbackRoutes.hasNext()) {
        val route = fallbackRoutes.next()
        builder.addRoute(route.address(), route.prefix())
        hasRoute = true
      }
    }

    if (!hasRoute && addresses.hasNext()) {
      builder.addRoute(defaultRoute, 0)
    }
  }

  private fun addAllowedPackages(builder: Builder, iterator: StringIterator) {
    while (iterator.hasNext()) {
      val packageName = iterator.next()
      runCatching {
        builder.addAllowedApplication(packageName)
      }.onFailure {
        Log.w(TAG, "Unable to allow package $packageName", it)
      }
    }
  }

  private fun addDisallowedPackages(builder: Builder, iterator: StringIterator) {
    while (iterator.hasNext()) {
      val packageName = iterator.next()
      runCatching {
        builder.addDisallowedApplication(packageName)
      }.onFailure {
        Log.w(TAG, "Unable to disallow package $packageName", it)
      }
    }
  }

  private fun collectIterator(iterator: StringIterator): List<String> {
    val items = mutableListOf<String>()
    while (iterator.hasNext()) {
      items += iterator.next()
    }
    return items
  }

  private fun buildInterfaceFlags(
    javaInterface: JavaNetworkInterface,
    capabilities: NetworkCapabilities
  ): Int {
    var flags = 0
    if (capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)) {
      flags = flags or OsConstants.IFF_UP or OsConstants.IFF_RUNNING
    }
    if (javaInterface.isLoopback) flags = flags or OsConstants.IFF_LOOPBACK
    if (javaInterface.isPointToPoint) flags = flags or OsConstants.IFF_POINTOPOINT
    if (javaInterface.supportsMulticast()) flags = flags or OsConstants.IFF_MULTICAST
    return flags
  }

  private fun InterfaceAddress.toRoutePrefixString(): String = if (address is Inet6Address) {
    "${Inet6Address.getByAddress(address.address).hostAddress}/$networkPrefixLength"
  } else {
    "${address.hostAddress}/$networkPrefixLength"
  }

  private fun Intent?.toLaunchRequest(): RuntimeLaunchRequest? {
    val nodeId = this?.getStringExtra(EXTRA_NODE_ID) ?: return null
    val profileName = this.getStringExtra(EXTRA_PROFILE_NAME) ?: return null
    val configPath = this.getStringExtra(EXTRA_CONFIG_PATH) ?: return null
    return RuntimeLaunchRequest(nodeId = nodeId, profileName = profileName, configPath = configPath)
  }

  private class StringArray(
    values: List<String>
  ) : StringIterator {
    private val items = values.toList()
    private val iterator = items.iterator()

    override fun hasNext(): Boolean = iterator.hasNext()

    override fun len(): Int = items.size

    override fun next(): String = iterator.next()
  }

  private class NetworkInterfaceArray(
    values: List<NetworkInterface>
  ) : NetworkInterfaceIterator {
    private val iterator = values.iterator()

    override fun hasNext(): Boolean = iterator.hasNext()

    override fun next(): NetworkInterface = iterator.next()
  }

  companion object {
    private const val TAG = "ShieldVpnService"
    private const val ACTION_START = "com.egoistshield.tv.runtime.START"
    private const val ACTION_STOP = "com.egoistshield.tv.runtime.STOP"
    private const val EXTRA_NODE_ID = "extra_node_id"
    private const val EXTRA_PROFILE_NAME = "extra_profile_name"
    private const val EXTRA_CONFIG_PATH = "extra_config_path"
    private const val NOTIFICATION_CHANNEL_ID = "shield.runtime"
    private const val NOTIFICATION_ID = 4101

    fun startIntent(
      context: Context,
      request: RuntimeLaunchRequest
    ): Intent {
      return Intent(context, ShieldVpnService::class.java).apply {
        action = ACTION_START
        putExtra(EXTRA_NODE_ID, request.nodeId)
        putExtra(EXTRA_PROFILE_NAME, request.profileName)
        putExtra(EXTRA_CONFIG_PATH, request.configPath)
      }
    }

    fun stopIntent(context: Context): Intent {
      return Intent(context, ShieldVpnService::class.java).apply {
        action = ACTION_STOP
      }
    }
  }
}
