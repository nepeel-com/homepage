rootProject.name = "nepeel-android-verifier"

val upstream = providers.environmentVariable("NEPEEL_KEY_ATTESTATION_SOURCE").orNull
  ?: error("Run scripts/build-android-verifier.mjs to prepare the pinned Google verifier source")
includeBuild(upstream) {
  dependencySubstitution {
    substitute(module("com.android.keyattestation:keyattestation")).using(project(":"))
  }
}
