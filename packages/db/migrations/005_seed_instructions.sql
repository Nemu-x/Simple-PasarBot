INSERT INTO instructions (id, code, lang, platform, title, body, image_url)
VALUES
  (
    'seed-connect-vpn-en',
    'connect_vpn',
    'en',
    'universal',
    'How to connect',
    '1) Copy your subscription URL. 2) Open your VPN client app. 3) Import from URL. 4) Enable profile and connect.',
    NULL
  ),
  (
    'seed-connect-vpn-ru',
    'connect_vpn',
    'ru',
    'universal',
    'Как подключиться',
    '1) Скопируйте ссылку подписки. 2) Откройте VPN-клиент. 3) Импортируйте по URL. 4) Включите профиль и подключитесь.',
    NULL
  )
ON CONFLICT (code, lang, platform) DO UPDATE SET
  title = EXCLUDED.title,
  body = EXCLUDED.body,
  image_url = EXCLUDED.image_url,
  updated_at = NOW();
