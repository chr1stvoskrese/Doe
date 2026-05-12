import os
import pyperclip

# ==========================================
# КОНФИГУРАЦИЯ СБОРЩИКА
# ==========================================

# Папки, которые скрипт будет игнорировать
IGNORE_DIRS = {
    'venv', '.git', '__pycache__', 'node_modules', 
    '.idea', '.vscode', 'build', 'dist', '__MACOSX'
}

# Расширения файлов, которые скрипт будет игнорировать (бинарники, БД и т.д.)
IGNORE_EXTS = {
    '.db', '.sqlite', '.sqlite3', '.pyc', '.DS_Store', 
    '.png', '.jpg', '.jpeg', '.gif', '.ico', '.pdf', '.zip', '.tar', '.gz', '.bmp'
}

DEFAULT_HEADER = """Ты Senior Frontend Developer с 20-ти летним стажем
также Senior Backend Developer с 20-ти летним стажем
и Senior UI/UX Designer с 20-ти летним стажем
Ты разрабатываешь прекрасные приложения под Windows и macOS без визуальных артефактов, инженер в технике Apple и Windows-архитектор

Мой проект называется Doe
Doe — локальное десктопное канбан-приложение для macOS с хранением данных в выбранной пользователем папке (как Obsidian). Бэкенд на FastAPI + SQLAlchemy + SQLite, фронтенд на чистом HTML/CSS/JavaScript

Немного устаревшая архитектура приложения, но верная в целом

Doe/
├── .gitignore                  # Исключения для Git (venv, pycache, .DS_Store, board.db)
├── pyproject.toml              # Метаданные проекта, зависимости (альтернатива requirements.txt)
├── requirements.txt            # Список Python-зависимостей для pip
├── main.py                     # Точка входа: запуск Uvicorn в потоке, инициализация БД, раздача статики, старт pywebview (в будущем)
│
├── frontend/                   # Статические файлы клиентской части
│   ├── index.html              # Основная HTML-структура: шапка, контейнер доски, модальные окна (тема, язык, о программе)
│   ├── styles.css              # Все стили приложения: палитра, тёмная/светлая тема, колонки, карточки, меню, анимации
│   └── app.js                  # Логика фронтенда: API-клиент, рендеринг доски, обработка Drag&Drop, меню, модалки, обновление таймеров
│
├── src/                        # Исходный код бэкенда (Python-пакет)
│   ├── __init__.py             # Делает src пакетом Python
│   │
│   ├── api/                    # Слой представления (FastAPI роутеры)
│   │   ├── __init__.py
│   │   └── v1/                 # Версия API v1
│   │       ├── __init__.py
│   │       ├── columns.py      # Эндпоинты для работы с колонками (GET, POST, PUT, DELETE)
│   │       └── tasks.py        # Эндпоинты для задач (создание, обновление, удаление, перемещение)
│   │
│   ├── core/                   # Ядро приложения (конфигурация, утилиты)
│   │   ├── __init__.py
│   │   └── config.py           # Настройки приложения (пока не активно, задел на будущее)
│   │
│   ├── db/                     # Слой работы с базой данных
│   │   ├── __init__.py
│   │   ├── database.py         # Фабрика асинхронных сессий, динамическое создание Engine по пути к vault, инициализация БД
│   │   └── models.py           # SQLAlchemy модели таблиц: ColumnModel, TaskModel, TimerSessionModel, перечисление ColumnMode
│   │
│   ├── schemas/                # Pydantic-схемы для валидации запросов/ответов
│   │   ├── __init__.py
│   │   ├── column.py           # Схемы для колонок: ColumnCreate, ColumnUpdate, ColumnResponse
│   │   └── task.py             # Схемы для задач: TaskCreate, TaskUpdate, TaskMove, TaskResponse, TaskCreateResponse, TimerSessionResponse
│   │
│   └── services/               # Бизнес-логика приложения
│       ├── __init__.py
│       ├── column_service.py   # Сервис для колонок: получение с задачами и таймерами (с преобразованием в схемы)
│       └── task_service.py     # Сервис для задач: создание, обновление, удаление, перемещение с логикой таймеров и завершения
│
├── alembic/                    # Миграции базы данных Alembic (если используются)
│   ├── versions/               # Файлы миграций
│   └── alembic.ini             # Конфигурация Alembic
│
└── venv/                       # Виртуальное окружение Python (не включается в репозиторий)
"""

def should_ignore(filepath):
    """Проверяет, нужно ли игнорировать файл по расширению."""
    return any(filepath.endswith(ext) for ext in IGNORE_EXTS)

def get_header():
    """Запрашивает шапку у пользователя."""
    print("=" * 50)
    choice = input("Использовать шапку по умолчанию? (Y/n): ").strip().lower()
    
    if choice == 'n':
        print("\nВведите вашу шапку (введите 'END' на новой строке для завершения):")
        lines = []
        while True:
            line = input()
            if line.strip() == 'END':
                break
            lines.append(line)
        return "\n".join(lines)
    return DEFAULT_HEADER

def get_prompt():
    """Запрашивает конечную задачу у пользователя."""
    print("\n" + "=" * 50)
    print("Что нужно сделать нейросети? Задача. Пиши ТОЛЬКО в нотации БЫЛО и СТАЛО, подробно, о конкретных правках, чтобы было удобно скопировать и вставить:")
    print("Введите текст задачи (введите 'END' на новой строке для завершения):")
    lines = []
    while True:
        line = input()
        if line.strip() == 'END':
            break
        lines.append(line)
    return "\n".join(lines)

def collect_files():
    """Собирает текст из всех файлов проекта."""
    project_root = "."
    files_context = []

    for root, dirs, files in os.walk(project_root):
        # Исключаем ненужные папки (модифицируем список dirs in-place)
        dirs[:] = [d for d in dirs if d not in IGNORE_DIRS]
        
        for file in files:
            if should_ignore(file):
                continue
                
            filepath = os.path.join(root, file)
            # Убираем './' в начале пути для красоты
            clean_path = filepath[2:] if filepath.startswith('./') else filepath
            
            # Пропускаем сам этот скрипт, чтобы не создавать рекурсию
            if clean_path == os.path.basename(__file__):
                continue

            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                # Форматируем: путь, затем код
                file_text = f"--- START OF FILE {clean_path} ---\n{content}\n--- END OF FILE {clean_path} ---\n"
                files_context.append(file_text)
                print(f"Добавлен файл: {clean_path}")
            except Exception as e:
                print(f"Пропущен файл (не удалось прочитать): {clean_path} - {e}")
                
    return "\n".join(files_context)

def main():
    print("СБОРЩИК КОНТЕКСТА ДЛЯ LLM (Doe Project)")
    
    header = get_header()
    files_text = collect_files()
    prompt = get_prompt()
    
    # Формируем итоговый промпт
    final_text = (
        f"{header}\n\n"
        f"Ниже приведены файлы проекта:\n\n"
        f"{files_text}\n\n"
        f"====================================\n"
        f"ЗАДАЧА (Пиши ТОЛЬКО в нотации БЫЛО и СТАЛО, подробно, о конкретных правках, чтобы было удобно скопировать и вставить):\n"
        f"{prompt}"
    )
    
    # Копируем в буфер обмена
    try:
        pyperclip.copy(final_text)
        print("\n" + "=" * 50)
        print("✅ УСПЕШНО! Весь контекст и задача скопированы в буфер обмена.")
        print("Теперь просто нажми Cmd+V (или Ctrl+V) в чате с нейросетью.")
    except Exception as e:
        print("\n❌ Ошибка при копировании в буфер обмена:", e)
        # Fallback: сохраняем в файл, если буфер недоступен
        fallback_file = "llm_context_output.txt"
        with open(fallback_file, "w", encoding="utf-8") as f:
            f.write(final_text)
        print(f"Текст сохранен в файл: {fallback_file}")

if __name__ == "__main__":
    main()