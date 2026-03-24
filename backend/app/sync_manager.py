"""
スケジューラー参照を保持するモジュール。
main.py で起動したスケジューラーを API 側から参照するために使用。
"""
from typing import Optional

_scheduler = None


def set_scheduler(s) -> None:
    global _scheduler
    _scheduler = s


def get_job_next_run(job_id: str) -> Optional[str]:
    if _scheduler is None:
        return None
    try:
        job = _scheduler.get_job(job_id)
        if job and job.next_run_time:
            return job.next_run_time.isoformat()
    except Exception:
        pass
    return None


def get_scheduler_running() -> bool:
    if _scheduler is None:
        return False
    try:
        return _scheduler.running
    except Exception:
        return False
