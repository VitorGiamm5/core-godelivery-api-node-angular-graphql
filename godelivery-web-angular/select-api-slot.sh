#!/bin/sh
set -eu

slot="${1:-}"
case "$slot" in
  blue|green) ;;
  *) echo "slot precisa ser blue ou green" >&2; exit 2 ;;
esac

config=/etc/nginx/conf.d/default.conf
printf '%s\n' "$slot" > /var/lib/gateway/active-slot
sed -i "s/api-blue:9105/api-${slot}:9105/; s/api-green:9105/api-${slot}:9105/" "$config"
if ! grep -Fq "set \$api_upstream api-${slot}:9105;" "$config"; then
  echo "não foi possível atualizar o destino do gateway" >&2
  exit 1
fi

nginx -t
nginx -s reload
