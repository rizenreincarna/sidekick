import java.io.File
import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Apply Google Services plugin ONLY when google-services.json is present.
// This lets the project build (APK) without Firebase configured, and light up
// FCM automatically once you drop google-services.json into app/.
val googleServicesJson = rootProject.file("app/google-services.json")
if (googleServicesJson.exists()) {
    apply(plugin = "com.google.gms.google-services")
}

android {
    namespace = "com.erth.sidekick"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.erth.sidekick"
        minSdk = 24
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables { useSupportLibrary = true }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            // Sign release with the keystore if keystore.properties exists.
            val ksProps = rootProject.file("keystore.properties")
            if (ksProps.exists()) {
                val props = Properties().apply { ksProps.inputStream().use { load(it) } }
                signingConfig = signingConfigs.create("release") {
                    storeFile = file(props.getProperty("storeFile"))
                    storePassword = props.getProperty("storePassword")
                    keyAlias = props.getProperty("keyAlias")
                    keyPassword = props.getProperty("keyPassword")
                }
            }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    buildFeatures { buildConfig = true }
    packaging {
        resources { excludes += "/META-INF/{AL2.0,LGPL2.1}" }
    }

    sourceSets {
        // Firebase-only sources compile only when google-services.json is present.
        if (googleServicesJson.exists()) {
            getByName("main") {
                java.srcDirs("src/firebase/java")
            }
        }
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.constraintlayout:constraintlayout:2.1.4")
    implementation("androidx.swiperefreshlayout:swiperefreshlayout:1.1.0")
    implementation("androidx.webkit:webkit:1.11.0")
    implementation("androidx.preference:preference-ktx:1.2.1")

    // Firebase BoM + Messaging — only when google-services.json is present,
    // so a non-Firebase build doesn't try to resolve Firebase artifacts.
    if (googleServicesJson.exists()) {
        implementation(platform("com.google.firebase:firebase-bom:33.1.1"))
        implementation("com.google.firebase:firebase-messaging-ktx")
        implementation("com.google.firebase:firebase-analytics-ktx")
    }

    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.6.1")
}