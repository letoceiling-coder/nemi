#!/usr/bin/env bash
# MTProto-прокси для Telegram (mtg, FakeTLS) на Ubuntu. Запускать от root на своём сервере.
# Секрет генерируется на сервере и НЕ хранится в репозитории.
# Статус: не тестировалось на реальном сервере — проверьте вывод и ссылку tg:// после запуска.
set -euo pipefail

PORT="${PORT:-8443}"                  # 443 оставьте под сайт (nginx)
FAKE_DOMAIN="${FAKE_DOMAIN:-www.google.com}"
NAME=mtg

command -v docker >/dev/null || { apt-get update -y && apt-get install -y docker.io; }
systemctl enable --now docker

docker rm -f "$NAME" >/dev/null 2>&1 || true
SECRET="$(docker run --rm nineseconds/mtg:2 generate-secret --hex "$FAKE_DOMAIN")"

docker run -d --name "$NAME" --restart unless-stopped \
  -p "${PORT}:3128" \
  nineseconds/mtg:2 simple-run -n 1.1.1.1 -i prefer-ipv4 0.0.0.0:3128 "$SECRET" >/dev/null

# Брандмауэр: открываем только порт прокси (если ufw активен)
if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then ufw allow "${PORT}/tcp"; fi

IP="$(curl -s -4 ifconfig.me || hostname -I | awk '{print $1}')"
echo
echo "Готово. Ссылка для Telegram (откройте на устройстве, где стоит Telegram):"
echo "tg://proxy?server=${IP}&port=${PORT}&secret=${SECRET}"
echo "Проверка: docker logs $NAME --tail 5"
