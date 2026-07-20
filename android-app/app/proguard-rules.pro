# Keep Kotlin metadata and Compose
-keepattributes *Annotation*, InnerClasses, Signature, Exceptions
-dontwarn kotlinx.coroutines.**

# Compose
-keep class androidx.compose.** { *; }
-dontwarn androidx.compose.**

# Retrofit
-keepattributes Signature, Exceptions
-keep class retrofit2.** { *; }
-keepclasseswithmembers class * { @retrofit2.http.* <methods>; }
-dontwarn retrofit2.**

# OkHttp
-dontwarn okhttp3.**
-dontwarn okio.**

# Gson
-keep class com.rizencc.data.model.** { *; }
-keepattributes Signature
-keep class sun.misc.Unsafe { *; }
-dontwarn sun.misc.**

# Coroutines
-keepclassmembers class kotlinx.coroutines.** { *; }
