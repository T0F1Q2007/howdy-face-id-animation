#!/bin/bash

# Howdy Animation Trigger Script (Standardized Path)
# Usage: ./howdy-trigger.sh [start|success|stop]

# Dynamically find the user's runtime directory
RUNTIME_DIR="/run/user/$(id -u)"
STATUS_FILE="$RUNTIME_DIR/howdy_status"

case "$1" in
    start)
        echo "start" > "$STATUS_FILE"
        ;;
    success)
        echo "success" > "$STATUS_FILE"
        ;;
    stop)
        echo "stop" > "$STATUS_FILE"
        ;;
    *)
        echo "Usage: $0 [start|success|stop]"
        exit 1
        ;;
esac
