#!/usr/bin/env bash
set -euo pipefail

project="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
sdk="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
if [[ -z "$sdk" ]]; then
  echo "Set ANDROID_HOME to an Android SDK with Platform 35 and Build-Tools 35.0.1." >&2
  exit 1
fi
tools="$sdk/build-tools/${ANDROID_BUILD_TOOLS:-35.0.1}"
platform="$sdk/platforms/android-35/android.jar"
main="$project/app/src/main"
output="${1:-$project/build/RetroDesktop98.apk}"
deps="${RETRO98_DEPENDENCIES_DIR:-$project/build/dependencies}"
signing_key="${RETRO98_KEYSTORE:-$project/build/development.keystore}"
signing_alias="${RETRO98_KEY_ALIAS:-retro98}"
export RETRO98_KEY_PASSWORD="${RETRO98_KEY_PASSWORD:-android}"

mkdir -p "$(dirname -- "$output")" "$(dirname -- "$signing_key")"
temp="$(mktemp -d)"
trap 'rm -rf -- "$temp"' EXIT
mkdir -p "$temp/classes" "$temp/dex" "$temp/dependency-data"
source "$project/clippy-dependencies.sh"
runtime="$deps/litertlm-android-0.19.1.aar"
unzip -p "$runtime" classes.jar > "$temp/litertlm.jar"
libraries=(
  "$temp/litertlm.jar"
  "$deps/gson-2.14.0.jar"
  "$deps/kotlin-stdlib-2.4.0.jar"
  "$deps/kotlin-reflect-2.4.0.jar"
  "$deps/kotlinx-coroutines-core-jvm-1.11.0.jar"
  "$deps/kotlinx-coroutines-android-1.11.0.jar"
  "$deps/android-mail-1.6.8.jar"
  "$deps/android-activation-1.6.8.jar"
  "$deps/luaj-jme-3.0.1.jar"
)
classpath="$platform"
for library in "${libraries[@]}"; do
  classpath="$classpath:$library"
  mapfile -t resources < <(unzip -Z1 "$library" | awk '/\.kotlin_builtins$|^META-INF\/(services\/[^/]+|javamail\.[^/]+|mailcap(\.default)?|mimetypes\.default)$/')
  if ((${#resources[@]})); then
    unzip -oq "$library" "${resources[@]}" -d "$temp/dependency-data"
  fi
done
sed 's/<manifest /<manifest package="com.retrodesktop.launcher.resizable" /' "$main/AndroidManifest.xml" > "$temp/AndroidManifest.xml"

"$tools/aapt2" compile --dir "$main/res" -o "$temp/resources.zip"
"$tools/aapt2" link -o "$temp/unsigned.apk" -I "$platform" \
  --manifest "$temp/AndroidManifest.xml" --min-sdk-version 26 --target-sdk-version 35 \
  --version-code 21 --version-name 2.7 -A "$main/assets" "$temp/resources.zip"

mapfile -d '' sources < <(find "$main/java" -name '*.java' -print0)
"${JAVAC:-javac}" -encoding UTF-8 -source 8 -target 8 -classpath "$classpath" -d "$temp/classes" "${sources[@]}"
jar cf "$temp/classes.jar" -C "$temp/classes" .
java -cp "$deps/r8-9.3.38.jar" com.android.tools.r8.D8 \
  --lib "$platform" --min-api 26 --output "$temp/dex" "$temp/classes.jar" "${libraries[@]}"
zip -q -j "$temp/unsigned.apk" "$temp/dex/"*.dex
(
  cd "$temp/dependency-data"
  zip -q -r "$temp/unsigned.apk" .
)
unzip -q "$runtime" 'jni/*/*.so' -d "$temp"
mv "$temp/jni" "$temp/lib"
(
  cd "$temp"
  zip -q -0 -r unsigned.apk lib
)
"$tools/zipalign" -f -P 16 4 "$temp/unsigned.apk" "$temp/aligned.apk"

if [[ ! -f "$signing_key" ]]; then
  (
    umask 077
    keytool -genkeypair -noprompt -storetype PKCS12 -keystore "$signing_key" \
      -storepass:env RETRO98_KEY_PASSWORD -alias "$signing_alias" \
      -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Retro Desktop 98 Development"
  )
fi
"$tools/apksigner" sign --ks "$signing_key" --ks-key-alias "$signing_alias" \
  --ks-pass env:RETRO98_KEY_PASSWORD --out "$output" "$temp/aligned.apk"
"$tools/apksigner" verify "$output"
python3 "$project/tests/check_apk_package.py" "$output"
echo "$output"
