package com.nepeel.attestation

import com.android.keyattestation.verifier.*
import com.android.keyattestation.verifier.challengecheckers.ChallengeMatcher
import com.google.common.collect.ImmutableList
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.google.protobuf.ByteString
import java.io.ByteArrayInputStream
import java.math.BigInteger
import java.security.cert.CertificateFactory
import java.security.cert.TrustAnchor
import java.security.cert.X509Certificate
import java.time.Instant
import java.util.Base64

internal const val MAX_INPUT_BYTES = 4 * 1024 * 1024
internal data class Request(
  val chain: List<X509Certificate>,
  val challenge: String,
  val packageName: String,
  val minVersion: BigInteger,
  val signerDigests: Set<ByteString>,
  val revokedSerials: Set<String>,
)

private fun JsonObject.string(name: String): String {
  val value = get(name)
  require(value != null && value.isJsonPrimitive && value.asJsonPrimitive.isString)
  return value.asString
}

private fun JsonObject.strings(name: String, min: Int, max: Int): List<String> {
  val value = get(name)
  require(value != null && value.isJsonArray && value.asJsonArray.size() in min..max)
  return value.asJsonArray.map {
    require(it.isJsonPrimitive && it.asJsonPrimitive.isString)
    it.asString
  }
}

internal fun parseRequest(json: String): Request {
  require(json.toByteArray(Charsets.UTF_8).size <= MAX_INPUT_BYTES)
  val obj = JsonParser.parseString(json).asJsonObject
  require(obj.keySet() == setOf("chain", "challenge", "packageName", "minVersion", "signerDigests", "revokedSerials"))
  val challenge = obj.string("challenge")
  require(Regex("nepeel.capture.android.v1:[0-9a-f]{64}").matches(challenge))
  val packageName = obj.string("packageName")
  require(packageName == "com.nepeel.app")
  val version = obj.string("minVersion")
  require(Regex("[1-9][0-9]{0,9}").matches(version))
  val digests = obj.strings("signerDigests", 1, 4).map {
    require(Regex("[0-9a-f]{64}").matches(it))
    ByteString.copyFrom(it.chunked(2).map { pair -> pair.toInt(16).toByte() }.toByteArray())
  }.toSet()
  val revoked = obj.strings("revokedSerials", 0, 100_000).map {
    require(Regex("[0-9a-f]{1,80}").matches(it))
    BigInteger(it, 16).toString(16)
  }.toSet()
  val factory = CertificateFactory.getInstance("X.509")
  val chain = obj.strings("chain", 3, 6).map {
    require(it.length in 100..16_384 && Regex("[A-Za-z0-9+/]+={0,2}").matches(it))
    val bytes = Base64.getDecoder().decode(it)
    require(Base64.getEncoder().encodeToString(bytes) == it)
    val input = ByteArrayInputStream(bytes)
    val cert = factory.generateCertificate(input) as X509Certificate
    require(input.available() == 0 && bytes.contentEquals(cert.encoded))
    cert
  }
  return Request(chain, challenge, packageName, BigInteger(version), digests, revoked)
}

internal fun verify(
  request: Request,
  anchors: () -> Set<TrustAnchor> = GoogleTrustAnchors,
  now: () -> Instant = { Instant.now() },
): VerificationResult {
  // Check the supplied root too: PKIX normally excludes trust anchors from its path.
  if (request.chain.any { it.serialNumber.toString(16) in request.revokedSerials })
    return VerificationResult.ConstraintViolation("Revocation", "Certificate unavailable")
  val verifier = Verifier(
    trustAnchorsSource = anchors,
    revokedSerialsSource = { request.revokedSerials },
    instantSource = InstantSource { now() },
    expectedAttestationApplicationId = AttestationApplicationId(
      setOf(AttestationPackageInfo(request.packageName, request.minVersion)), request.signerDigests,
    ),
    constraintConfig = ConstraintConfig(
      allowSoftwareRoot = false,
      attestationApplicationId = AttestationApplicationIdConstraint.STRICT,
      securityLevel = CompositeConstraint("Hardware security",
        SecurityLevelConstraint.NOT_SOFTWARE, SecurityLevelConstraint.MATCHES_CERTIFICATE),
      rootOfTrust = CompositeConstraint("Verified locked boot",
        AttributeConstraint.STRICT("Locked", true) { it.hardwareEnforced.rootOfTrust?.deviceLocked },
        AttributeConstraint.STRICT("Verified", VerifiedBootState.VERIFIED) { it.hardwareEnforced.rootOfTrust?.verifiedBootState }),
      additionalConstraints = ImmutableList.of(
        AttributeConstraint.STRICT("Only official app", true) {
          val app = it.softwareEnforced.attestationApplicationId
          app != null && app.packages.size == 1 &&
            app.packages.single().name == request.packageName &&
            app.packages.single().version >= request.minVersion &&
            app.signatures.isNotEmpty() && app.signatures.all { signer -> signer in request.signerDigests }
        },
      ),
      inputLimits = InputLimits(maxPackages = 1, maxSignatures = 4),
    ),
  )
  return verifier.verify(request.chain, ChallengeMatcher(ByteString.copyFromUtf8(request.challenge)))
}

fun main() {
  val response = try {
    val bytes = System.`in`.readNBytes(MAX_INPUT_BYTES + 1)
    require(bytes.size <= MAX_INPUT_BYTES)
    when (val result = verify(parseRequest(bytes.toString(Charsets.UTF_8)))) {
      is VerificationResult.Success -> """{"ok":true,"securityLevel":"${result.securityLevel.name}"}"""
      else -> """{"ok":false,"reason":"verification_failed"}"""
    }
  } catch (_: Exception) {
    // Never echo certificates, device identifiers, input values or exception details.
    """{"ok":false,"reason":"invalid_input"}"""
  }
  println(response)
}
