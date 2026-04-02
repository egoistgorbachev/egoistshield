# Keep the small persisted state surface stable under R8 because it is serialized
# into DataStore snapshots and rebuilt back into runtime profiles.
-keep class com.egoistshield.tv.data.** { *; }
-keep class com.egoistshield.tv.model.DnsMode { *; }
-keep class com.egoistshield.tv.model.NodeProtocol { *; }

# Keep kotlinx.serialization companion entry points used by generated serializers.
-keepclassmembers class ** {
    *** Companion;
}
-keepclassmembers class **$Companion {
    kotlinx.serialization.KSerializer serializer(...);
}

# Keep the Android entry point explicit for release builds.
-keep class com.egoistshield.tv.MainActivity { *; }

# SnakeYAML references java.beans introspection types that are not present on Android.
# We only deserialize provider payloads into maps, so suppress these desktop-only warnings.
-dontwarn java.beans.BeanInfo
-dontwarn java.beans.FeatureDescriptor
-dontwarn java.beans.IntrospectionException
-dontwarn java.beans.Introspector
-dontwarn java.beans.PropertyDescriptor
