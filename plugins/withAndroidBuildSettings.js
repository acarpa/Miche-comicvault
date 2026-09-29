/**
 * Plugin di configurazione: impostazioni di compilazione Android applicate a ogni "expo prebuild".
 * - più memoria a Gradle (evita l'errore "JVM Metaspace" durante la compilazione)
 * - compila solo per telefoni moderni a 64 bit (arm64-v8a): APK più piccolo, compilazione ~2 volte più veloce
 */
const { withGradleProperties } = require('expo/config-plugins');

const SETTINGS = {
  'org.gradle.jvmargs': '-Xmx4096m -XX:MaxMetaspaceSize=1024m',
  reactNativeArchitectures: 'arm64-v8a',
};

module.exports = function withAndroidBuildSettings(config) {
  return withGradleProperties(config, (cfg) => {
    for (const [key, value] of Object.entries(SETTINGS)) {
      cfg.modResults = cfg.modResults.filter((item) => !(item.type === 'property' && item.key === key));
      cfg.modResults.push({ type: 'property', key, value });
    }
    return cfg;
  });
};
