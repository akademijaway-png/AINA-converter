#!/usr/bin/env bash
set -e
export JAVA_HOME="${JAVA_HOME:-/usr/lib/jvm/java-17-openjdk-amd64}"
export ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-/opt/android-sdk}"
export PATH="${JAVA_HOME}/bin:${ANDROID_SDK_ROOT}/build-tools/34.0.0:${PATH}"
echo "Starting Web to App…"
if [[ -x /app/builder/setup-sdk.sh ]]; then
  bash /app/builder/setup-sdk.sh
else
  echo "WARNING: builder/setup-sdk.sh missing"
fi
export ANDROID_BUILD_TOOLS="${ANDROID_SDK_ROOT}/build-tools/34.0.0"
export ANDROID_JAR="${ANDROID_SDK_ROOT}/platforms/android-34/android.jar"
exec node /app/server.js
