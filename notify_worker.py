# notify_worker.py — тонкий entrypoint тихого воркера уведомлений.
# Вся логика — в src/core/notifications.py (общая с wrapper.py --worker).
#
# Аргументы (позиционные, как зовёт config.spawn_notification_worker):
#   1 due_time_iso, 2 title, 3 message, 4 task_id, 5 vault_path (legacy, игнор),
#   6 reminder_id. Vault перечитывается из конфига по reminder_id.
import sys

from src.core.notifications import run_notification


def main():
    if len(sys.argv) < 7:
        sys.exit(1)
    run_notification(
        due_time_iso=sys.argv[1],
        title=sys.argv[2],
        message=sys.argv[3],
        task_id=sys.argv[4],
        reminder_id=sys.argv[6],
        vault_path=None,  # подтянется из конфига
    )


if __name__ == "__main__":
    main()
