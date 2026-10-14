plugins {
  kotlin("jvm") version "2.2.0"
  application
}

repositories { mavenCentral(); google() }

dependencies {
  implementation("com.android.keyattestation:keyattestation:0.1-SNAPSHOT")
  implementation("com.google.code.gson:gson:2.11.0")
  testImplementation(kotlin("test-junit5"))
  testRuntimeOnly("org.junit.jupiter:junit-jupiter-engine:5.12.2")
  testRuntimeOnly("org.junit.platform:junit-platform-launcher:1.12.2")
}

java { toolchain { languageVersion = JavaLanguageVersion.of(21) } }
application { mainClass.set("com.nepeel.attestation.MainKt") }
tasks.test {
  useJUnitPlatform()
  outputs.file(layout.buildDirectory.file("smoke-request.json"))
}
// Keep upstream and dependency JARs separate, including their license/signature files.
tasks.jar { archiveFileName.set("nepeel-android-verifier.jar") }
