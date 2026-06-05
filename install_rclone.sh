#!/bin/bash
if ! command -v rclone &> /dev/null; then
    echo "rclone not found in PATH, downloading locally..."
    curl -O https://downloads.rclone.org/rclone-current-linux-amd64.zip
    unzip rclone-current-linux-amd64.zip
    cp rclone-*-linux-amd64/rclone ./rclone
    chmod +x ./rclone
    echo "Local rclone installed."
else
    echo "rclone is already installed in system."
fi
