#!/bin/bash
set +e  # Don't fail on cleanup errors

echo "=== Cleaning up after test ==="

# Remove test artifacts
rm -rf test-results/ playwright-report/ || true

# Kill console process
CONSOLE_PID=$(sudo lsof -t -i:9000)
if [ ! -z "$CONSOLE_PID" ]; then 
  echo "Killing console process: $CONSOLE_PID"
  sudo kill $CONSOLE_PID
fi
sleep 2

# Stop and remove console container, and get the image name from it
if [ ! -z "$CONSOLE_CONTAINER" ]; then
  # Get the image name before removing the container
  CONSOLE_IMAGE=$(docker inspect --format='{{.Config.Image}}' "$CONSOLE_CONTAINER" 2>/dev/null || echo "")

  echo "Stopping and removing container: $CONSOLE_CONTAINER"
  docker stop $CONSOLE_CONTAINER 2>/dev/null || true
  docker rm $CONSOLE_CONTAINER 2>/dev/null || true

  # Remove the image if we found it
  if [ ! -z "$CONSOLE_IMAGE" ]; then
    echo "Removing image: $CONSOLE_IMAGE"
    docker rmi -f "$CONSOLE_IMAGE" 2>/dev/null || true
  fi
fi

# Aggressive Docker cleanup
docker system prune -af --volumes 2>/dev/null || true

# Aggressive Podman cleanup (CRC uses Podman internally)
sudo podman system prune -af --volumes 2>/dev/null || true

# Clean container overlay storage
sudo rm -rf ~/.local/share/containers/storage/overlay/* 2>/dev/null || true

# Keep journal logs under 50MB
sudo journalctl --vacuum-size=50M || true

set -e  # Re-enable exit on error

echo "=== Disk space after cleanup ==="
df -h
echo "=== Container storage usage ==="
du -sh /var/lib/containers/* 2>/dev/null || true

