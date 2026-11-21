# Download the pinned runtime, mail, and Lua libraries for build-apk.sh.
# Android Studio obtains the same dependencies through Gradle.
mkdir -p "$deps"
fetch_clippy() {
  local url="$1" path="$deps/${1##*/}" part
  if [[ -s "$path" ]]; then return; fi
  part="$(mktemp "$deps/download.XXXXXX")"
  if curl --fail --location --silent --show-error --retry 1 --max-time 180 "$url" -o "$part"; then
    mv -f "$part" "$path"
  else
    rm -f "$part"
    return 1
  fi
}
google='https://dl.google.com/dl/android/maven2'
central='https://repo.maven.apache.org/maven2'
fetch_clippy "$google/com/google/ai/edge/litertlm/litertlm-android/0.19.1/litertlm-android-0.19.1.aar"
fetch_clippy "$google/com/android/tools/r8/9.3.38/r8-9.3.38.jar"
fetch_clippy "$central/com/google/code/gson/gson/2.14.0/gson-2.14.0.jar"
fetch_clippy "$central/org/jetbrains/kotlin/kotlin-stdlib/2.4.0/kotlin-stdlib-2.4.0.jar"
fetch_clippy "$central/org/jetbrains/kotlin/kotlin-reflect/2.4.0/kotlin-reflect-2.4.0.jar"
fetch_clippy "$central/org/jetbrains/kotlinx/kotlinx-coroutines-core-jvm/1.11.0/kotlinx-coroutines-core-jvm-1.11.0.jar"
fetch_clippy "$central/org/jetbrains/kotlinx/kotlinx-coroutines-android/1.11.0/kotlinx-coroutines-android-1.11.0.jar"
fetch_clippy "$central/com/sun/mail/android-mail/1.6.8/android-mail-1.6.8.jar"
fetch_clippy "$central/com/sun/mail/android-activation/1.6.8/android-activation-1.6.8.jar"
fetch_clippy "$central/org/luaj/luaj-jme/3.0.1/luaj-jme-3.0.1.jar"
