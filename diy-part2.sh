#!/bin/bash
#============================================================
# https://github.com/P3TERX/Actions-OpenWrt
# File name: diy-part2.sh
# Description: OpenWrt DIY script part 2 (After Update feeds)
# Lisence: MIT
# Author: P3TERX
# Blog: https://p3terx.com
#============================================================

# Modify default IP
sed -i 's/192.168.6.1/192.168.2.1/g' package/base-files/files/bin/config_generate

# Keep the legacy 21.02 board name accepted by sysupgrade metadata checks.
DEVICE_DEFINITION='target/linux/mediatek/image/filogic.mk'
if ! grep -qE '^[[:space:]]*SUPPORTED_DEVICES[[:space:]]*\+= 360,t7[[:space:]]*$' "$DEVICE_DEFINITION"; then
    sed -i '/^define Device\/qihoo_360t7$/a\  SUPPORTED_DEVICES += 360,t7' "$DEVICE_DEFINITION"
fi

# Modify hostname
#sed -i 's/OpenWrt/360T7/g' package/base-files/files/bin/config_generate
