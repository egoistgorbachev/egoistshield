package com.egoistshield.tv.runtime

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class DnsParsersTest {
  @Test
  fun `normalizes comma separated dns servers`() {
    val result = parseDnsServers("1.1.1.1, 8.8.8.8")
    assertEquals(listOf("1.1.1.1", "8.8.8.8"), result)
  }

  @Test
  fun `extracts host from url with ip literal`() {
    val result = parseDnsServers("https://1.1.1.1/dns-query")
    assertEquals(listOf("1.1.1.1"), result)
  }

  @Test
  fun `rejects dns stamps`() {
    val error = runCatching { parseDnsServers("sdns://AQcAAAAAAAAAAA") }.exceptionOrNull()
    assertTrue(error?.message?.contains("sdns://") == true)
  }
}
