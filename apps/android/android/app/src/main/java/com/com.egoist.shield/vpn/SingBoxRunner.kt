package com.egoist.shield.vpn

import android.content.Context
import android.util.Log
import java.io.File
import java.io.BufferedReader
import java.io.InputStreamReader

/**
 * SingBoxRunner — manages sing-box process lifecycle.
 * Starts sing-box binary with a given config, monitors its output,
 * and provides methods for stopping the process.
 */
class SingBoxRunner(private val context: Context) {

    companion object {
        const val TAG = "SingBoxRunner"
    }

    private var process: Process? = null
    private var outputThread: Thread? = null
    @Volatile
    private var running = false

    /**
     * Start the sing-box process with a config file.
     * @param configPath Absolute path to the sing-box JSON config
     * @param tunFd File descriptor of the TUN interface (not used directly by CLI sing-box
     *             on Android when using tun_auto configuration)
     */
    fun start(configPath: String, tunFd: Int) {
        if (running) {
            Log.w(TAG, "sing-box is already running")
            return
        }

        val singboxPath = getSingBoxPath()
        if (singboxPath == null) {
            Log.e(TAG, "sing-box binary not found")
            return
        }

        // Ensure the binary is executable
        val binary = File(singboxPath)
        if (!binary.canExecute()) {
            binary.setExecutable(true)
        }

        try {
            Log.i(TAG, "Starting sing-box: $singboxPath run -c $configPath")

            val pb = ProcessBuilder(singboxPath, "run", "-c", configPath)
                .redirectErrorStream(true)

            // Set environment variables
            val env = pb.environment()
            env["SING_BOX_TUN_FD"] = tunFd.toString()

            process = pb.start()
            running = true

            // Monitor output in background thread
            outputThread = Thread {
                try {
                    val reader = BufferedReader(InputStreamReader(process!!.inputStream))
                    var line: String?
                    while (reader.readLine().also { line = it } != null) {
                        Log.d(TAG, "sing-box: $line")
                    }
                } catch (e: Exception) {
                    if (running) {
                        Log.e(TAG, "Error reading sing-box output", e)
                    }
                } finally {
                    running = false
                    Log.i(TAG, "sing-box process ended")
                }
            }.apply {
                name = "singbox-output"
                isDaemon = true
                start()
            }

            Log.i(TAG, "sing-box started (PID: ${getProcessPid()})")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start sing-box", e)
            running = false
        }
    }

    /**
     * Stop the sing-box process.
     */
    fun stop() {
        if (!running && process == null) return

        running = false
        try {
            process?.let { proc ->
                proc.destroy()
                // Give it a moment to shut down gracefully
                try {
                    proc.waitFor()
                } catch (e: InterruptedException) {
                    proc.destroyForcibly()
                }
            }
            process = null

            outputThread?.interrupt()
            outputThread = null

            Log.i(TAG, "sing-box stopped")
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping sing-box", e)
        }
    }

    /**
     * Check if sing-box is currently running.
     */
    fun isRunning(): Boolean = running && process?.isAlive == true

    /**
     * Get the path to the sing-box binary.
     * Looks in multiple locations:
     * 1. App's native library directory (bundled as .so)
     * 2. App's files directory (downloaded)
     */
    private fun getSingBoxPath(): String? {
        // Check native libs (bundled binary renamed as .so)
        val nativeLib = File(context.applicationInfo.nativeLibraryDir, "libsingbox.so")
        if (nativeLib.exists()) return nativeLib.absolutePath

        // Check app files directory (downloaded binary)
        val appFiles = File(context.filesDir, "runtime/sing-box")
        if (appFiles.exists()) return appFiles.absolutePath

        // Check alternative location
        val altPath = File(context.filesDir, "sing-box")
        if (altPath.exists()) return altPath.absolutePath

        return null
    }

    private fun getProcessPid(): Long {
        // Process.pid()/toHandle() not available on Android runtime
        return if (process?.isAlive == true) 1L else -1L
    }
}
