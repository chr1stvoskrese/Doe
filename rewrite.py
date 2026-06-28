#!/usr/bin/env python3
import os
import sys
import subprocess
import curses
import tempfile
import json
import shlex

def run_git(args, check=True, exit_on_error=True):
    result = subprocess.run(
        ['git'] + args, 
        capture_output=True, 
        text=True, 
        encoding='utf-8', 
        errors='replace'
    )
    if check and result.returncode != 0:
        if exit_on_error:
            print(f"Git error: {result.stderr.strip()}")
            sys.exit(1)
        return None
    return result.stdout.strip()

def check_repo():
    if run_git(['rev-parse', '--is-inside-work-tree'], exit_on_error=False) is None:
        print("Ошибка: Ты не в Git-репозитории.")
        sys.exit(1)
        
    git_dir = run_git(['rev-parse', '--git-dir'])
    if os.path.exists(os.path.join(git_dir, 'rebase-merge')) or os.path.exists(os.path.join(git_dir, 'rebase-apply')):
        print("Ошибка: В репозитории уже запущен процесс rebase или merge.")
        print("Заверши его (git rebase --continue) или отмени (git rebase --abort).")
        sys.exit(1)

    # Игнорируем untracked файлы, блокируем только если есть добавленные или измененные tracked файлы
    status = run_git(['status', '--porcelain', '--untracked-files=no'])
    if status:
        print("Ошибка: У тебя есть незакоммиченные изменения. Сделай commit или stash перед переписыванием истории.")
        sys.exit(1)

def get_commits():
    log_output = run_git(['log', '--format=%H%x09%h%x09%an%x09%ae%x09%ad%x09%s', '--date=iso'], exit_on_error=False)
    if log_output is None:
        return []
        
    commits = []
    for line in log_output.split('\n'):
        if not line:
            continue
        parts = line.split('\t', 5)
        if len(parts) == 6:
            commits.append({
                'hash': parts[0],
                'short_hash': parts[1],
                'author': parts[2],
                'email': parts[3],
                'date': parts[4],
                'subject': parts[5]
            })
    return commits

def draw_menu(stdscr, commits):
    curses.curs_set(0)
    current_row = 0
    top_row = 0

    while True:
        stdscr.clear()
        height, width = stdscr.getmaxyx()
        
        if height < 3 or width < 20:
            stdscr.addstr(0, 0, "Окно слишком мало!")
            stdscr.refresh()
            stdscr.getch()
            return None
        
        title = " Выбор коммита (Стрелки - навигация, Enter - выбор, Q - отмена) "
        stdscr.addstr(0, 0, title[:width], curses.A_BOLD)

        for i in range(height - 2):
            idx = top_row + i
            if idx >= len(commits):
                break
            
            c = commits[idx]
            text = f"{c['short_hash']} | {c['author']} | {c['date']} | {c['subject']}"
            text = text[:width-1]
            
            if idx == current_row:
                stdscr.addstr(i + 1, 0, text, curses.A_REVERSE)
            else:
                stdscr.addstr(i + 1, 0, text)
        
        stdscr.refresh()
        key = stdscr.getch()
        
        if key == curses.KEY_RESIZE:
            continue
        elif key == curses.KEY_UP and current_row > 0:
            current_row -= 1
            if current_row < top_row:
                top_row -= 1
        elif key == curses.KEY_DOWN and current_row < len(commits) - 1:
            current_row += 1
            if current_row >= top_row + height - 2:
                top_row += 1
        elif key in [10, 13]:
            return commits[current_row]
        elif key in [ord('q'), ord('Q')]:
            return None

def get_editor():
    try:
        return subprocess.run(['git', 'var', 'GIT_EDITOR'], capture_output=True, text=True, check=True).stdout.strip()
    except subprocess.CalledProcessError:
        return os.environ.get('EDITOR', 'vi')

def edit_message(current_msg):
    editor = get_editor()
    fd, temp_path = tempfile.mkstemp(suffix=".tmp")
    
    # Записываем и сразу закрываем дескриптор, чтобы редактор мог безопасно открыть файл
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        f.write(current_msg)
        
    subprocess.run(f"{editor} {shlex.quote(temp_path)}", shell=True)
    
    with open(temp_path, 'r', encoding='utf-8') as f:
        new_msg = f.read().strip()
        
    os.unlink(temp_path)
    return new_msg

def sequence_editor(config_file, todo_file):
    with open(config_file, 'r', encoding='utf-8') as f:
        config = json.load(f)
    
    with open(todo_file, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    target_hash = config['short_hash']
    new_lines = []
    
    for line in lines:
        new_lines.append(line)
        parts = line.strip().split()
        
        if len(parts) >= 2 and parts[0] in ('pick', 'p', 'edit', 'e', 'reword', 'r'):
            todo_hash = parts[1]
            if todo_hash.startswith(target_hash) or target_hash.startswith(todo_hash):
                script_path = os.path.abspath(__file__)
                exec_cmd = f"exec {shlex.quote(sys.executable)} {shlex.quote(script_path)} --amend-commit {shlex.quote(config_file)}\n"
                new_lines.append(exec_cmd)

    with open(todo_file, 'w', encoding='utf-8') as f:
        f.writelines(new_lines)
    sys.exit(0)

def amend_commit(config_file):
    with open(config_file, 'r', encoding='utf-8') as f:
        config = json.load(f)
    
    env = os.environ.copy()
    env['GIT_AUTHOR_NAME'] = config['author']
    env['GIT_AUTHOR_EMAIL'] = config['email']
    env['GIT_AUTHOR_DATE'] = config['date']
    env['GIT_COMMITTER_NAME'] = config['author']
    env['GIT_COMMITTER_EMAIL'] = config['email']
    env['GIT_COMMITTER_DATE'] = config['date']
    
    msg_file = config['msg_file']
    subprocess.run(['git', 'commit', '--amend', '-F', msg_file, '--allow-empty'], env=env, check=True)
    sys.exit(0)

def main():
    if len(sys.argv) == 4 and sys.argv[1] == '--sequence-editor':
        sequence_editor(sys.argv[2], sys.argv[3])
        return
    elif len(sys.argv) == 3 and sys.argv[1] == '--amend-commit':
        amend_commit(sys.argv[2])
        return

    msg_file = None
    config_file = None

    try:
        check_repo()
        commits = get_commits()
        if not commits:
            print("История пуста. Коммиты не найдены.")
            sys.exit(1)

        target_commit = curses.wrapper(draw_menu, commits)
        if not target_commit:
            print("Отменено.")
            sys.exit(0)

        print(f"Редактирование коммита: {target_commit['short_hash']}")
        print("Оставь поле пустым и нажми Enter, чтобы не менять значение.\n")

        new_author = input(f"Новый автор ({target_commit['author']}): ").strip() or target_commit['author']
        new_email = input(f"Новый email ({target_commit['email']}): ").strip() or target_commit['email']
        new_date = input(f"Новая дата ({target_commit['date']}): ").strip() or target_commit['date']

        full_msg = run_git(['log', '-1', '--format=%B', target_commit['hash']])
        print("\nСейчас откроется текстовый редактор для изменения сообщения коммита. Нажми Enter.")
        input()
        new_msg = edit_message(full_msg)

        if not new_msg:
            print("Сообщение не может быть пустым. Отмена.")
            sys.exit(1)

        print("\n" + "="*60)
        print("ВНИМАНИЕ: Скрипт переписывает историю Git.")
        print("Хэши измененного коммита и всех коммитов после него изменятся.")
        print("Если ты уже пушил эти коммиты на удаленный сервер,")
        print("после отработки скрипта тебе придется сделать: git push --force")
        print("="*60)

        confirm = input("\nНачать переписывание истории? [y/N]: ").strip().lower()
        if confirm not in ['y', 'yes', 'д', 'да']:
            print("Отмена.")
            sys.exit(0)

        # Безопасно получаем дескриптор и путь, оборачивая в fdopen
        fd_msg, msg_file = tempfile.mkstemp()
        with os.fdopen(fd_msg, 'w', encoding='utf-8') as f:
            f.write(new_msg)

        config = {
            'hash': target_commit['hash'],
            'short_hash': target_commit['short_hash'],
            'author': new_author,
            'email': new_email,
            'date': new_date,
            'msg_file': msg_file
        }

        fd_conf, config_file = tempfile.mkstemp(suffix='.json')
        with os.fdopen(fd_conf, 'w', encoding='utf-8') as f:
            json.dump(config, f, ensure_ascii=False)

        parents = run_git(['log', '-1', '--format=%P', target_commit['hash']]).split()
        rebase_target = parents[0] if parents else '--root'

        env = os.environ.copy()
        script_path = os.path.abspath(__file__)
        
        env['GIT_SEQUENCE_EDITOR'] = f"{shlex.quote(sys.executable)} {shlex.quote(script_path)} --sequence-editor {shlex.quote(config_file)}"
        
        print("\nЗапуск rebase...")
        rebase_cmd = ['git', 'rebase', '-i', rebase_target]
        
        try:
            subprocess.run(rebase_cmd, env=env, check=True)
            print("\nУспешно. История изменена.")
            print("Напоминание: используй 'git push --force', если коммиты уже были на удаленном сервере.")
        except subprocess.CalledProcessError:
            print("\nОшибка при выполнении rebase. Выполни 'git rebase --abort' для отмены.")
            
    except KeyboardInterrupt:
        print("\nОтмена пользователем.")
        sys.exit(0)
    finally:
        # Гарантированно убираем за собой файлы, даже если вылет произошел в середине процесса
        if msg_file and os.path.exists(msg_file):
            os.remove(msg_file)
        if config_file and os.path.exists(config_file):
            os.remove(config_file)

if __name__ == '__main__':
    main()
