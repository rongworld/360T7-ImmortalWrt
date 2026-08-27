#!/bin/bash
set -e

# Modify default IP
sed -i 's/192.168.6.1/192.168.2.1/g' \
    package/base-files/files/bin/config_generate

# Keep the legacy 21.02 board name accepted by sysupgrade metadata checks.
DEVICE_DEFINITION='target/linux/mediatek/image/filogic.mk'

if ! grep -q '^define Device/qihoo_360t7$' "$DEVICE_DEFINITION"; then
    echo "ERROR: qihoo_360t7 device definition not found"
    exit 1
fi

if ! sed -n '/^define Device\/qihoo_360t7$/,/^endef$/p' "$DEVICE_DEFINITION" | grep -qE '^[[:space:]]*SUPPORTED_DEVICES[[:space:]]*\+= 360,t7[[:space:]]*$'; then

    sed -i '/^define Device\/qihoo_360t7$/a\  SUPPORTED_DEVICES += 360,t7' \
        "$DEVICE_DEFINITION"
fi

echo "360T7 device definition after patch:"
sed -n '/^define Device\/qihoo_360t7$/,/^endef$/p' "$DEVICE_DEFINITION"

# Modify hostname
# sed -i 's/OpenWrt/360T7/g' \
#     package/base-files/files/bin/config_generate
