plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val esignetBaseUrl: String = (project.findProperty("esignetBaseUrl") as String?) ?: "http://localhost:8088"

android {
    namespace = "org.mosip.superapp"
    compileSdk = 35

    defaultConfig {
        applicationId = "org.mosip.superapp"
        minSdk = 28
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"
        buildConfigField("String", "ESIGNET_BASE_URL", "\"$esignetBaseUrl\"")
        buildConfigField("String", "CLIENT_ID", "\"mosip-super-app\"")
        buildConfigField("String", "REDIRECT_URI", "\"org.mosip.superapp://callback\"")
    }

    // Both reference apps are signed with the same vendor certificate: that is what lets the
    // child app hold the super app's signature-level permission (Native SSO prerequisite 1).
    signingConfigs {
        create("vendor") {
            storeFile = rootProject.file("keystore/mosip-demo.jks")
            storePassword = "mosipdemo"
            keyAlias = "mosipdemo"
            keyPassword = "mosipdemo"
        }
    }
    buildTypes {
        debug { signingConfig = signingConfigs.getByName("vendor") }
        release {
            signingConfig = signingConfigs.getByName("vendor")
            isMinifyEnabled = false
        }
    }
    buildFeatures { buildConfig = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation(project(":nativesso-sdk"))
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.browser:browser:1.8.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("com.google.android.material:material:1.12.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
}
