// Top-level build file
plugins {
    id("com.android.application") version "8.5.2" apply false
    id("org.jetbrains.kotlin.android") version "1.9.24" apply false
    // Google Services plugin — applied conditionally inside app/build.gradle.kts
    // when google-services.json is present.
    id("com.google.gms.google-services") version "4.4.2" apply false
}