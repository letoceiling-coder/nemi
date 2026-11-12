// Mock data for the UI prototype. Will be replaced by /api/v1/* calls.
export type Priority = 'high' | 'mid' | 'low'
export type TaskStatus = 'todo' | 'doing' | 'done'

export interface Project { id: string; name: string; desc: string; status: 'active' | 'paused' | 'done'; progress: number; due: string; stage: string; owner: string; tasks: number; color: string }
export interface Task { id: string; title: string; project: string; due: string; priority: Priority; status: TaskStatus; source?: string }
export interface Meeting { id: string; title: string; date: string; duration: string; platform: string; people: string[]; project: string; summary: string; decisions: string[]; actions: string[]; transcript: { t: string; who: string; text: string }[] }
export interface Mail { id: string; from: string; subject: string; preview: string; time: string; unread: boolean; important: boolean; category: string; project?: string; draft?: string; body: string }
export interface Automation { id: string; name: string; trigger: string; steps: string[]; enabled: boolean; lastRun: string; status: 'ok' | 'err'; runs: { at: string; ok: boolean; note: string }[] }

export const projects: Project[] = [
  { id: 'p1', name: 'Редизайн сайта «Север»', desc: 'Новый корпоративный сайт на Next.js с каталогом и личным кабинетом.', status: 'active', progress: 64, due: '30 нояб', stage: 'Вёрстка каталога', owner: 'Вы', tasks: 18, color: '#d98a5f' },
  { id: 'p2', name: 'CRM для мебельной фабрики', desc: 'Учёт заказов, склад, интеграция с 1С. Миграция на PostgreSQL.', status: 'active', progress: 38, due: '20 дек', stage: 'Проектирование БД', owner: 'Вы', tasks: 27, color: '#6aa0e8' },
  { id: 'p3', name: 'Контент-план на Q1', desc: 'Статьи, посты в Telegram, SEO-тексты для блога.', status: 'active', progress: 82, due: '15 нояб', stage: 'Финальная вычитка', owner: 'Вы', tasks: 12, color: '#5fb98a' },
  { id: 'p4', name: 'Мобильное приложение', desc: 'Клиент для личного ассистента. Ожидает решения по стеку.', status: 'paused', progress: 12, due: '—', stage: 'Исследование', owner: 'Вы', tasks: 6, color: '#b58be0' },
  { id: 'p5', name: 'Договор с поставщиком', desc: 'Согласование условий и подписание.', status: 'done', progress: 100, due: '02 нояб', stage: 'Завершён', owner: 'Вы', tasks: 9, color: '#e2b04e' },
]

export const tasks: Task[] = [
  { id: 't1', title: 'Проверить договор с ООО «Альфа-Дерево»', project: 'Договор с поставщиком', due: 'Сегодня, 11:00', priority: 'high', status: 'todo' },
  { id: 't2', title: 'Ответить Ивану Петрову по смете', project: 'Редизайн сайта «Север»', due: 'Сегодня, 15:00', priority: 'high', status: 'todo', source: 'Письмо' },
  { id: 't3', title: 'Согласовать схему БД с командой', project: 'CRM для мебельной фабрики', due: 'Завтра', priority: 'mid', status: 'doing', source: 'Встреча' },
  { id: 't4', title: 'Вычитать статью про ИИ-агентов', project: 'Контент-план на Q1', due: 'Сегодня, 18:00', priority: 'mid', status: 'doing' },
  { id: 't5', title: 'Подготовить макеты каталога', project: 'Редизайн сайта «Север»', due: '14 нояб', priority: 'mid', status: 'todo' },
  { id: 't6', title: 'Отправить акт выполненных работ', project: 'Договор с поставщиком', due: 'Вчера', priority: 'high', status: 'todo' },
  { id: 't7', title: 'Опубликовать пост в Telegram-канале', project: 'Контент-план на Q1', due: '16 нояб', priority: 'low', status: 'todo' },
  { id: 't8', title: 'Настроить резервное копирование в S3', project: 'CRM для мебельной фабрики', due: '18 нояб', priority: 'low', status: 'todo', source: 'Чат' },
  { id: 't9', title: 'Созвон с клиентом по ТЗ', project: 'Редизайн сайта «Север»', due: '10 нояб', priority: 'mid', status: 'done' },
  { id: 't10', title: 'Выбрать СУБД', project: 'CRM для мебельной фабрики', due: '08 нояб', priority: 'high', status: 'done', source: 'Встреча' },
]

export const meetings: Meeting[] = [
  { id: 'm1', title: 'Планёрка по CRM', date: 'Сегодня, 10:00', duration: '42 мин', platform: 'Яндекс Телемост', people: ['Иван Петров', 'Мария Соколова', 'Алексей Ким'], project: 'CRM для мебельной фабрики',
    summary: 'Обсудили архитектуру хранения заказов и сроки интеграции с 1С. Решено использовать PostgreSQL. Основной риск — выгрузка данных из 1С в старом формате.',
    decisions: ['Использовать PostgreSQL вместо MySQL', 'Интеграцию с 1С делать через промежуточную очередь', 'Релиз первого модуля — до 20 декабря'],
    actions: ['Алексей: подготовить схему БД до пятницы', 'Мария: уточнить формат выгрузки 1С', 'Вы: согласовать бюджет на хостинг'],
    transcript: [
      { t: '00:00:12', who: 'Иван Петров', text: 'Коллеги, начнём. Главный вопрос — какую СУБД берём для заказов.' },
      { t: '00:01:05', who: 'Алексей Ким', text: 'Предлагаю PostgreSQL: нужны JSONB для атрибутов мебели и нормальные транзакции.' },
      { t: '00:02:40', who: 'Мария Соколова', text: 'С 1С выгрузка идёт в XML, придётся писать конвертер. Это рисковый кусок.' },
      { t: '00:04:18', who: 'Вы', text: 'Хорошо, фиксируем PostgreSQL. Алексей, схему до пятницы.' },
    ] },
  { id: 'm2', title: 'Созвон с клиентом «Север»', date: 'Вчера, 16:30', duration: '28 мин', platform: 'Google Meet', people: ['Дмитрий Орлов', 'Вы'], project: 'Редизайн сайта «Север»',
    summary: 'Клиент утвердил структуру каталога, просит добавить фильтр по материалам. Сроки сдвигаются на неделю.',
    decisions: ['Добавить фильтр по материалам', 'Срок сдачи — 30 ноября'], actions: ['Вы: прислать обновлённую смету'],
    transcript: [{ t: '00:00:20', who: 'Дмитрий Орлов', text: 'Структура каталога нас устраивает, но нужен фильтр по материалам.' }, { t: '00:01:10', who: 'Вы', text: 'Принято, пересчитаю смету и сроки.' }] },
  { id: 'm3', title: 'Ретро по контенту', date: '8 нояб, 12:00', duration: '35 мин', platform: 'Локальная запись', people: ['Вы', 'Елена Морозова'], project: 'Контент-план на Q1',
    summary: 'Определили темы на январь, обсудили формат лонгридов.', decisions: ['Два лонгрида в месяц'], actions: ['Елена: список тем на январь'],
    transcript: [{ t: '00:00:30', who: 'Елена Морозова', text: 'Лонгриды дают лучший охват, предлагаю два в месяц.' }] },
]

export const mails: Mail[] = [
  { id: 'e1', from: 'Иван Петров', subject: 'Смета по каталогу — нужны правки', preview: 'Добрый день! Посмотрели смету, есть вопросы по пунктам 4 и 7…', time: '09:12', unread: true, important: true, category: 'Клиент', project: 'Редизайн сайта «Север»',
    body: 'Добрый день!\n\nПосмотрели смету, есть вопросы по пунктам 4 и 7. Можно ли уменьшить стоимость интеграции платёжной системы? Также нам нужен ответ до конца дня.\n\nИван', draft: 'Иван, добрый день! Спасибо за обратную связь. По пункту 4 подготовлю пересмотренный вариант: интеграцию платежей можно разбить на два этапа. Пришлю обновлённую смету сегодня до 15:00.' },
  { id: 'e2', from: 'ООО «Альфа-Дерево»', subject: 'Счёт №482 на оплату', preview: 'Направляем счёт за поставку материалов согласно договору…', time: '08:40', unread: true, important: false, category: 'Счёт', project: 'Договор с поставщиком', body: 'Направляем счёт №482 за поставку материалов. Срок оплаты — 5 рабочих дней.' },
  { id: 'e3', from: 'Мария Соколова', subject: 'Формат выгрузки из 1С', preview: 'Узнала у бухгалтерии: выгрузка идёт в XML 2.1, пример во вложении…', time: 'Вчера', unread: false, important: true, category: 'Деловая', project: 'CRM для мебельной фабрики', body: 'Узнала у бухгалтерии: выгрузка идёт в XML 2.1, пример во вложении.', draft: 'Мария, спасибо! Передам Алексею для проектирования конвертера.' },
  { id: 'e4', from: 'Дмитрий Орлов', subject: 'Жалоба: не работает форма заявки', preview: 'На тестовом стенде форма не отправляется, прошу посмотреть срочно…', time: 'Вчера', unread: true, important: true, category: 'Жалоба', project: 'Редизайн сайта «Север»', body: 'На тестовом стенде форма не отправляется. Прошу посмотреть срочно.', draft: 'Дмитрий, воспроизвёл проблему — исправление будет на стенде в течение часа.' },
  { id: 'e5', from: 'Маркетплейс Pro', subject: 'Скидка 40% на рекламу', preview: 'Только до пятницы — размещайте объявления со скидкой…', time: 'Пн', unread: false, important: false, category: 'Реклама', body: 'Рекламное предложение.' },
  { id: 'e6', from: 'GitHub', subject: '[bro] Build passed', preview: 'Workflow «CI» завершён успешно на ветке develop', time: 'Пн', unread: false, important: false, category: 'Уведомление', body: 'Workflow CI passed.' },
]

export const automations: Automation[] = [
  { id: 'a1', name: 'Утренняя почта', trigger: 'Каждый день в 08:30', steps: ['Проверить почту', 'Выделить важные письма', 'Подготовить ответы-черновики', 'Показать уведомление'], enabled: true, lastRun: 'Сегодня, 08:30', status: 'ok',
    runs: [{ at: 'Сегодня, 08:30', ok: true, note: '12 писем, 3 важных' }, { at: 'Вчера, 08:30', ok: true, note: '9 писем, 2 важных' }, { at: '9 нояб, 08:30', ok: false, note: 'Ошибка IMAP: таймаут' }] },
  { id: 'a2', name: 'Протокол после встречи', trigger: 'После завершения встречи', steps: ['Расшифровать запись', 'Составить протокол', 'Создать задачи', 'Сохранить в S3'], enabled: true, lastRun: 'Сегодня, 10:45', status: 'ok', runs: [{ at: 'Сегодня, 10:45', ok: true, note: 'Протокол и 3 задачи' }] },
  { id: 'a3', name: 'Вечерний отчёт', trigger: 'Каждый день в 18:30', steps: ['Собрать выполненные задачи', 'Сформировать отчёт', 'Сохранить в «Отчёты»'], enabled: true, lastRun: 'Вчера, 18:30', status: 'ok', runs: [{ at: 'Вчера, 18:30', ok: true, note: 'Отчёт сформирован' }] },
  { id: 'a4', name: 'Просрочки по пятницам', trigger: 'Пятница, 17:00', steps: ['Проверить все проекты', 'Найти просроченные задачи', 'Уведомить'], enabled: false, lastRun: '1 нояб, 17:00', status: 'ok', runs: [{ at: '1 нояб, 17:00', ok: true, note: '2 просрочки' }] },
]

export const docs = [
  { id: 'd1', name: 'ТЗ_Север_v3.pdf', type: 'PDF', size: '2.4 МБ', project: 'Редизайн сайта «Север»', date: '10 нояб', snippet: 'Структура каталога, требования к фильтрации…' },
  { id: 'd2', name: 'Схема_БД_CRM.docx', type: 'DOCX', size: '640 КБ', project: 'CRM для мебельной фабрики', date: '9 нояб', snippet: 'Таблицы orders, items, warehouses…' },
  { id: 'd3', name: 'Бюджет_Q4.xlsx', type: 'XLSX', size: '120 КБ', project: 'Контент-план на Q1', date: '5 нояб', snippet: 'Статьи расходов, план/факт…' },
  { id: 'd4', name: 'Расшифровка_планёрки.txt', type: 'TXT', size: '38 КБ', project: 'CRM для мебельной фабрики', date: 'Сегодня', snippet: 'Иван Петров: Коллеги, начнём…' },
  { id: 'd5', name: 'Договор_Альфа-Дерево.pdf', type: 'PDF', size: '1.1 МБ', project: 'Договор с поставщиком', date: '2 нояб', snippet: 'Предмет договора, сроки поставки…' },
]

export const decisions = [
  { d: 'Сегодня', text: 'Использовать PostgreSQL вместо MySQL', src: 'Встреча «Планёрка по CRM»', project: 'CRM для мебельной фабрики' },
  { d: 'Вчера', text: 'Срок сдачи сайта — 30 ноября', src: 'Встреча «Созвон с клиентом»', project: 'Редизайн сайта «Север»' },
  { d: '8 нояб', text: 'Два лонгрида в месяц', src: 'Встреча «Ретро по контенту»', project: 'Контент-план на Q1' },
]

export const reports = [
  { id: 'r1', name: 'Ежедневный отчёт — 11 нояб', type: 'Ежедневный', date: 'Вчера', fmt: ['PDF', 'MD'], done: 7, open: 5, overdue: 1 },
  { id: 'r2', name: 'Еженедельный отчёт — 3–9 нояб', type: 'Еженедельный', date: '9 нояб', fmt: ['PDF', 'DOCX', 'XLSX'], done: 24, open: 11, overdue: 2 },
  { id: 'r3', name: 'Отчёт по проекту «CRM»', type: 'Проект', date: '8 нояб', fmt: ['PDF', 'HTML'], done: 10, open: 17, overdue: 0 },
  { id: 'r4', name: 'Отчёт по встречам — октябрь', type: 'Встречи', date: '1 нояб', fmt: ['PDF'], done: 14, open: 0, overdue: 0 },
]

export const integrations = [
  { id: 'i0', name: 'OpenRouter', desc: 'Облачные модели через единый API-ключ', connected: false, kind: 'AI-провайдеры' },
  { id: 'i00', name: 'Сервер SiteAccess', desc: 'Собственный сервер моделей api.siteaccess.ru', connected: false, kind: 'AI-провайдеры' },
  { id: 'i1', name: 'Gmail', desc: 'Почта через Gmail API', connected: true, kind: 'Почта' },
  { id: 'i2', name: 'Microsoft Graph', desc: 'Outlook, календарь', connected: false, kind: 'Почта' },
  { id: 'i3', name: 'IMAP / SMTP', desc: 'Любой почтовый сервер', connected: true, kind: 'Почта' },
  { id: 'i4', name: 'Telegram', desc: 'Личные чаты и каналы', connected: true, kind: 'Мессенджер' },
  { id: 'i5', name: 'Slack', desc: 'Рабочие пространства', connected: false, kind: 'Мессенджер' },
  { id: 'i6', name: 'Discord', desc: 'Серверы и личные сообщения', connected: false, kind: 'Мессенджер' },
  { id: 'i7', name: 'WordPress', desc: 'Публикация статей', connected: true, kind: 'Публикации' },
  { id: 'i8', name: 'Яндекс Телемост', desc: 'Запись и транскрибация встреч', connected: true, kind: 'Встречи' },
  { id: 'i9', name: 'Zoom', desc: 'Запись и транскрибация встреч', connected: false, kind: 'Встречи' },
  { id: 'i10', name: 'Selectel S3', desc: 'Приватное объектное хранилище', connected: true, kind: 'Хранилище' },
]

export const models = [
  { id: 'qwen3:32b', name: 'Qwen3 32B', roles: ['General', 'Reasoning'], size: '19 ГБ', vram: '20 ГБ', installed: true, main: true },
  { id: 'qwen2.5-coder:14b', name: 'Qwen2.5 Coder 14B', roles: ['Coding'], size: '9 ГБ', vram: '10 ГБ', installed: true, main: false },
  { id: 'gemma3:12b', name: 'Gemma 3 12B', roles: ['Summarization', 'Classification'], size: '8 ГБ', vram: '9 ГБ', installed: true, main: false },
  { id: 'nomic-embed-text', name: 'Nomic Embed Text', roles: ['Embeddings'], size: '270 МБ', vram: '0.5 ГБ', installed: true, main: false },
  { id: 'faster-whisper-large-v3', name: 'faster-whisper large-v3', roles: ['Transcription'], size: '3 ГБ', vram: '4 ГБ', installed: true, main: false },
  { id: 'gemma3:27b', name: 'Gemma 3 27B', roles: ['Research'], size: '17 ГБ', vram: '19 ГБ', installed: false, main: false },
]

export const agents = [
  { id: 'main', name: 'Главный агент', model: 'Qwen3 32B', enabled: true },
  { id: 'email', name: 'Email Agent', model: 'Gemma 3 12B', enabled: true },
  { id: 'browser', name: 'Browser Agent', model: 'Qwen3 32B', enabled: true },
  { id: 'meeting', name: 'Meeting Agent', model: 'Gemma 3 12B', enabled: true },
  { id: 'project', name: 'Project Agent', model: 'Qwen3 32B', enabled: true },
  { id: 'content', name: 'Content Agent', model: 'Qwen3 32B', enabled: true },
  { id: 'screen', name: 'Screen Agent', model: 'Qwen3 32B', enabled: false },
]

export const events = [
  { id: 'c1', title: 'Планёрка по CRM', day: 12, time: '10:00', len: 1, color: '#6aa0e8' },
  { id: 'c2', title: 'Проверить договор', day: 12, time: '11:00', len: 1, color: '#d98a5f' },
  { id: 'c3', title: 'Обед с партнёром', day: 13, time: '13:00', len: 1, color: '#5fb98a' },
  { id: 'c4', title: 'Демо макетов клиенту', day: 14, time: '15:00', len: 2, color: '#d98a5f' },
  { id: 'c5', title: 'Ретро по контенту', day: 17, time: '12:00', len: 1, color: '#b58be0' },
  { id: 'c6', title: 'Дедлайн: контент-план', day: 15, time: '09:00', len: 1, color: '#e0685f' },
]

export const quickCommands = ['Что сегодня нужно сделать?', 'Проверь почту', 'Проверь мои проекты', 'Подготовь отчёт', 'Проанализируй последнюю встречу']

export const chatHistory = [
  { id: 'h1', title: 'Планёрка по CRM — протокол', when: 'Сегодня' },
  { id: 'h2', title: 'Ответ Ивану Петрову по смете', when: 'Сегодня' },
  { id: 'h3', title: 'Поиск мебельных фабрик в Москве', when: 'Вчера' },
  { id: 'h4', title: 'Статья про ИИ-агентов', when: 'Вчера' },
  { id: 'h5', title: 'План на неделю', when: '9 нояб' },
  { id: 'h6', title: 'Ошибка сборки в Cursor', when: '8 нояб' },
]
