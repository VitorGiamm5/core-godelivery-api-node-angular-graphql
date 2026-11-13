#!/bin/sh
set -eu

state=/var/lib/gateway/active-slot
mkdir -p /var/lib/gateway
if [ ! -s "$state" ]; then
  slot="${API_ACTIVE_SLOT:-blue}"
  case "$slot" in
    blue|green) ;;
    *) echo "API_ACTIVE_SLOT precisa ser blue ou green" >&2; exit 2 ;;
  esac
  printf '%s\n' "$slot" > "$state"
fi

slot=$(cat "$state")
case "$slot" in
  blue|green) ;;
  *) echo "slot persistido precisa ser blue ou green" >&2; exit 2 ;;
esac
export API_ACTIVE_SLOT="$slot"
exec /docker-entrypoint.sh "$@"
