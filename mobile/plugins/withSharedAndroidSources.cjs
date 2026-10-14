const { withAppBuildGradle } = require('expo/config-plugins');

const marker = '// nepeel: shared Android bundle inputs';
const block = `
${marker}
tasks.withType(com.facebook.react.tasks.BundleHermesCTask).configureEach {
    inputs.dir(new File(rootDir, '../../shared'))
        .withPathSensitivity(org.gradle.api.tasks.PathSensitivity.RELATIVE)
    inputs.file(new File(rootDir, '../../package-lock.json'))
        .withPathSensitivity(org.gradle.api.tasks.PathSensitivity.RELATIVE)
    inputs.files(fileTree(new File(rootDir, '..')) { include '.env', '.env.*' })
        .withPathSensitivity(org.gradle.api.tasks.PathSensitivity.RELATIVE)
    ['EXPO_PUBLIC_ANDROID_ATTESTATION', 'EXPO_PUBLIC_API_URL', 'EXPO_PUBLIC_SUPABASE_URL',
     'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'EXPO_PUBLIC_GOOGLE_CLOUD_PROJECT_NUMBER'].each { name ->
        inputs.property('nepeel_' + name, System.getenv(name) ?: '')
    }
}
`;

module.exports = config => withAppBuildGradle(config, mod => {
  if (mod.modResults.language !== 'groovy') throw new Error('nepeel expects an Android Groovy build file');
  if (!mod.modResults.contents.includes(marker)) mod.modResults.contents += block;
  return mod;
});
