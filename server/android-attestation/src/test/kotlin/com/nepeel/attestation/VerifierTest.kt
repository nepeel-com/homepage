package com.nepeel.attestation

import com.android.keyattestation.verifier.*
import com.android.keyattestation.verifier.testing.FakeCalendar
import com.android.keyattestation.verifier.testing.KeyAttestationCertPathFactory
import com.google.gson.Gson
import com.google.protobuf.ByteString
import java.math.BigInteger
import java.security.cert.TrustAnchor
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate
import java.time.LocalDate
import java.util.Base64
import java.nio.file.Files
import java.nio.file.Path
import kotlin.test.*

class VerifierTest {
  private val calendar = FakeCalendar(LocalDate.of(2026, 10, 14))
  private val factory = KeyAttestationCertPathFactory(calendar)
  private val signer = ByteString.copyFrom(ByteArray(32) { 0x42 })
  private val challenge = "nepeel.capture.android.v1:" + "a".repeat(64)
  private val app = AttestationApplicationId(setOf(AttestationPackageInfo("com.nepeel.app", BigInteger.TWO)), setOf(signer))
  private val description = KeyDescription(
    BigInteger.valueOf(3), SecurityLevel.TRUSTED_ENVIRONMENT, BigInteger.valueOf(4), SecurityLevel.TRUSTED_ENVIRONMENT,
    ByteString.copyFromUtf8(challenge), ByteString.EMPTY,
    AuthorizationList(attestationApplicationId = app),
    AuthorizationList(origin = Origin.GENERATED, osVersion = BigInteger.valueOf(160000),
      rootOfTrust = RootOfTrust(ByteString.copyFromUtf8("boot key"), true, VerifiedBootState.VERIFIED, ByteString.copyFromUtf8("boot hash"))),
  )

  private fun request(desc: KeyDescription = description, remote: Boolean = false) = Request(
    factory.generateCertPath(desc, remotelyProvisioned = remote).certificatesWithAnchor,
    challenge, "com.nepeel.app", BigInteger.TWO, setOf(signer), emptySet(),
  )
  private fun check(request: Request) = verify(request, { setOf(TrustAnchor(factory.root, null)) }, { calendar.now() })
  private fun rejected(request: Request) = assertFalse(check(request) is VerificationResult.Success)

  @Test fun `valid factory TEE and remotely provisioned StrongBox pass strict policy`() {
    assertIs<VerificationResult.Success>(check(request()))
    val strong = description.copy(attestationSecurityLevel = SecurityLevel.STRONG_BOX, keyMintSecurityLevel = SecurityLevel.STRONG_BOX)
    assertIs<VerificationResult.Success>(check(request(strong, true)))
  }
  @Test fun `synthetic roots are rejected by production trust anchors`() {
    assertFalse(verify(request(), now = { calendar.now() }) is VerificationResult.Success)
  }
  @Test fun `different capture account nonce image or caption hash is rejected`() {
    rejected(request().copy(challenge = "nepeel.capture.android.v1:" + "b".repeat(64)))
  }
  @Test fun `missing app id wrong signer old version or extra package is rejected`() {
    for (id in listOf(null, app.copy(signatures = setOf(ByteString.copyFrom(ByteArray(32)))),
      app.copy(packages = setOf(AttestationPackageInfo("com.nepeel.app", BigInteger.ONE))),
      app.copy(packages = app.packages + AttestationPackageInfo("another.app", BigInteger.TWO)),
      app.copy(signatures = app.signatures + setOf(ByteString.copyFrom(ByteArray(32)))),
      app.copy(packages = setOf(AttestationPackageInfo("UnknownPackage", BigInteger.ONE))))) {
      rejected(request(description.copy(softwareEnforced = AuthorizationList(attestationApplicationId = id))))
    }
  }
  @Test fun `unlocked unverified and software devices are rejected`() {
    val boot = description.hardwareEnforced.rootOfTrust!!
    for (root in listOf(boot.copy(deviceLocked = false), boot.copy(verifiedBootState = VerifiedBootState.UNVERIFIED), null)) {
      rejected(request(description.copy(hardwareEnforced = description.hardwareEnforced.copy(rootOfTrust = root))))
    }
    rejected(request(description.copy(attestationSecurityLevel = SecurityLevel.SOFTWARE, keyMintSecurityLevel = SecurityLevel.SOFTWARE)))
  }
  @Test fun `revocation on any certificate including root rejects chain`() {
    val input = request()
    input.chain.forEach { rejected(input.copy(revokedSerials = setOf(it.serialNumber.toString(16)))) }
  }
  @Test fun `broken signature reordered and truncated chains fail`() {
    val input = request()
    // The upstream factory uses deterministic keys; a second factory is not a different signer.
    val corrupted = input.chain.first().encoded.copyOf()
    corrupted[corrupted.lastIndex] = (corrupted.last().toInt() xor 1).toByte()
    val badLeaf = CertificateFactory.getInstance("X.509").generateCertificate(corrupted.inputStream()) as X509Certificate
    rejected(input.copy(chain = listOf(badLeaf) + input.chain.drop(1)))
    rejected(input.copy(chain = input.chain.reversed()))
    rejected(input.copy(chain = input.chain.take(2)))
  }
  @Test fun `expired RKP chain is rejected`() {
    assertFalse(verify(request(remote = true), { setOf(TrustAnchor(factory.root, null)) }, { calendar.now().plusSeconds(365L * 86400) }) is VerificationResult.Success)
  }
  @Test fun `wire format rejects malformed oversized and extra input`() {
    val input = request()
    val data = mutableMapOf<String, Any>(
      "chain" to input.chain.map { Base64.getEncoder().encodeToString(it.encoded) },
      "challenge" to input.challenge, "packageName" to input.packageName,
      "minVersion" to "2", "signerDigests" to listOf("42".repeat(32)), "revokedSerials" to emptyList<String>(),
    )
    assertEquals(input.challenge, parseRequest(Gson().toJson(data)).challenge)
    // Used by the packaging smoke check: a well-formed but untrusted chain must fail in production.
    Files.writeString(Path.of("build", "smoke-request.json"), Gson().toJson(data))
    data["trustAnchors"] = emptyList<String>()
    assertFails { parseRequest(Gson().toJson(data)) }
    data.remove("trustAnchors")
    data["chain"] = List(7) { "not a certificate" }
    assertFails { parseRequest(Gson().toJson(data)) }
    assertFails { parseRequest("x".repeat(MAX_INPUT_BYTES + 1)) }
  }
}
