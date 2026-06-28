#!/usr/bin/env python3
import os
import sys
import subprocess
import curses
import tempfile
import json
import shlex

def run_git(args, check=True):
    result = subprocess.run(['git'] + args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if check and result.returncode != 0:
        print(f"Git error: {result.stderr.strip()}")
        sys.exit(1)
    return result.stdout.strip()

def check_repo():
    if subprocess.run(['git', 'rev-parse', '--is-inside-work-tree'], capture_output=True).returncode != 0:
        print("Ошибка: Ты не в Git-репозитории.")
        sys.exit(1)
    status = run_git(['status', '--porcelain'])
    if status:
        print("Ошибка: У тебя есть незакоммиченные изменения. Сделай commit или stash перед переписыванием истории.")
        sys.exit(1)

def get_commits():
    log_output = run_git(['log', '--format=%H%x09%h%x09%an%x09%ae%x09%ad%x09%s', '--date=iso'])
    commits = []
    for line in log_output.split('\n'):
        if not line:
            continue
        parts = line.split('\t')
        if len(parts) >= 6:
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
        
        if key == curses.KEY_UP and current_row > 0:
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

def edit_message(current_msg):
    editor = os.environ.get('EDITOR', 'nano')
    with tempfile.NamedTemporaryFile(suffix=".tmp", mode='w+', delete=False) as tf:
        tf.write(current_msg)
        tf.flush()
        subprocess.run([editor, tf.name])
        tf.seek(0)
        new_msg = tf.read().strip()
    os.unlink(tf.name)
    return new_msg

def sequence_editor(todo_file, config_file):
    with open(config_file, 'r') as f:
        config = json.load(f)
    
    with open(todo_file, 'r') as f:
        lines = f.readlines()

    target_hash = config['short_hash']
    new_lines = []
    
    for line in lines:
        new_lines.append(line)
        if line.startswith('pick ') or line.startswith('edit '):
            if target_hash in line:
                script_path = os.path.abspath(__file__)
                exec_cmd = f"exec {sys.executable} {shlex.quote(script_path)} --amend-commit {shlex.quote(config_file)}\n"
                new_lines.append(exec_cmd)

    with open(todo_file, 'w') as f:
        f.writelines(new_lines)
    sys.exit(0)

def amend_commit(config_file):
    with open(config_file, 'r') as f:
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

    check_repo()
    commits = get_commits()
    if not commits:
        print("Коммиты не найдены.")
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

    fd, msg_file = tempfile.mkstemp()
    with os.fdopen(fd, 'w') as f:
        f.write(new_msg)

    config = {
        'hash': target_commit['hash'],
        'short_hash': target_commit['short_hash'],
        'author': new_author,
        'email': new_email,
        'date': new_date,
        'msg_file': msg_file
    }

    fd, config_file = tempfile.mkstemp(suffix='.json')
    with os.fdopen(fd, 'w') as f:
        json.dump(config, f)

    parents = run_git(['log', '-1', '--format=%P', target_commit['hash']]).split()
    rebase_target = parents[0] if parents else '--root'

    env = os.environ.copy()
    script_path = os.path.abspath(__file__)
    env['GIT_SEQUENCE_EDITOR'] = f"{sys.executable} {shlex.quote(script_path)} --sequence-editor {shlex.quote(todo_file_placeholder='TODO_FILE')} {shlex.quote(config_file)}".replace("'TODO_FILE'", "$1")
    
    print("\nЗапуск rebase...")
    rebase_cmd = ['git', 'rebase', '-i', rebase_target]
    
    try:
        subprocess.run(rebase_cmd, env=env, check=True)
        print("\nУспешно. История изменена.")
        print("Напоминание: используй 'git push --force', если коммиты уже были на удаленном сервере.")
    except subprocess.CalledProcessError:
        print("\nОшибка при выполнении rebase. Сделай 'git rebase --abort'.")
    finally:
        os.remove(msg_file)
        os.remove(config_file)

if __name__ == '__main__':
    main()
