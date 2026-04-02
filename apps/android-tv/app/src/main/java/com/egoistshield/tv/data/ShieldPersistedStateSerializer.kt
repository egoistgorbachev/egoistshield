package com.egoistshield.tv.data

import androidx.datastore.core.CorruptionException
import androidx.datastore.core.Serializer
import java.io.InputStream
import java.io.OutputStream
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json

object ShieldPersistedStateSerializer : Serializer<ShieldPersistedState> {
  private val json = Json {
    ignoreUnknownKeys = true
    prettyPrint = true
  }

  override val defaultValue: ShieldPersistedState = ShieldPersistedState()

  override suspend fun readFrom(input: InputStream): ShieldPersistedState {
    return try {
      val raw = input.readBytes().decodeToString()
      if (raw.isBlank()) {
        defaultValue
      } else {
        json.decodeFromString(ShieldPersistedState.serializer(), raw)
      }
    } catch (error: SerializationException) {
      throw CorruptionException("Unable to read persisted TV state.", error)
    }
  }

  override suspend fun writeTo(t: ShieldPersistedState, output: OutputStream) {
    output.write(
      json.encodeToString(ShieldPersistedState.serializer(), t).encodeToByteArray()
    )
  }
}
