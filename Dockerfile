FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      openjdk-17-jdk-headless \
      imagemagick \
      unzip \
      zip \
      curl \
      ca-certificates \
      python3 \
    && rm -rf /var/lib/apt/lists/*

ENV JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
ENV ANDROID_SDK_ROOT=/opt/android-sdk
ENV ANDROID_BUILD_TOOLS=/opt/android-sdk/build-tools/34.0.0
ENV ANDROID_JAR=/opt/android-sdk/platforms/android-34/android.jar
ENV PATH="/usr/lib/jvm/java-17-openjdk-amd64/bin:/opt/android-sdk/build-tools/34.0.0:${PATH}"
ENV NODE_ENV=production

WORKDIR /app
COPY . /app

RUN mkdir -p /app/jobs /app/downloads /app/public/downloads /opt/android-sdk \
 && chmod +x /app/start.sh /app/builder/build.sh /app/builder/setup-sdk.sh || true

EXPOSE 3000
CMD ["bash", "/app/start.sh"]
