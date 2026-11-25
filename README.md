# LC — Leadership Council Cloud

Общее облачное хранилище Совета лидеров. Next.js 16 · TypeScript · Tailwind CSS 4 · Supabase (Auth, Postgres, Storage, Realtime) · Vercel.

## Возможности
Загрузка фото, видео и документов (drag & drop, прогресс), предпросмотр (фото, видео, аудио, PDF, текст, Word/Excel/PowerPoint), скачивание, папки (создание, переименование, перемещение, удаление), поиск по названию, сортировка по дате/названию/типу, «Недавно загруженные», мгновенная синхронизация между участниками (Realtime). Стартовые папки: General, Events, Photography, Videos.

## Запуск
```bash
cp .env.example .env.local   # вставьте URL и publishable key из Supabase → Settings → API
npm install
npm run dev
```

## Безопасность
- Ключ `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` публичный по дизайну. Доступ ограничивают RLS-политики. Секретный `service_role` ключ в проекте не используется и не должен попадать в код.
- RLS включён на `profiles`, `folders`, `files` и `storage.objects`. Бакет `lc-files` приватный, доступ только у авторизованных участников. Файлы отдаются по временным signed URL.
- Системные папки (General, Events, Photography, Videos) нельзя переименовать, переместить или удалить.

## Публикация на Vercel
1. Загрузите код в GitHub-репозиторий.
2. Vercel → Add New Project → импорт репозитория.
3. Environment Variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
4. После деплоя в Supabase → Authentication → URL Configuration укажите Site URL и Redirect URL `https://<ваш-домен>/auth/callback`.

## Ограничения
- На бесплатном тарифе Supabase максимальный размер файла — 50 МБ, хранилище — 1 ГБ.
- Предпросмотр Word/Excel/PowerPoint идёт через Microsoft Office Online Viewer (ему передаётся временная ссылка на файл).
- Папки целиком скачать нельзя, только отдельные файлы.
