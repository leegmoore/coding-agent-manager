# Patch Application Log
# Format: YYYY-MM-DD HH:MM | patch-name.patch | status
#
# To apply a patch and log it:
#   git apply patches/XXX.patch && echo "$(date '+%Y-%m-%d %H:%M') | XXX.patch | applied" >> patches/APPLIED.log
#
