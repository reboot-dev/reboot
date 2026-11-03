"""Owned-process cleanup that records failures without abandoning siblings."""
import subprocess
from pathlib import Path

class ProcessCleanup:
    def __init__(self):
        self.timed_out = set()

    def stop(self, process, marker=None):
        if process.poll() is not None:
            return
        if process.pid in self.timed_out:
            raise RuntimeError(f'Preserved timed-out PID {process.pid}; inspect before retry')
        if marker is not None:
            marker.touch()
        else:
            process.kill()
        try:
            process.wait(timeout=15)
        except subprocess.TimeoutExpired:
            self.timed_out.add(process.pid)
            raise

    def collect(self, owned):
        records, errors = [], []
        for process, stream, log, command in owned:
            try:
                self.stop(process)
            except Exception as error:
                errors.append({'pid':process.pid, 'error':repr(error)})
            finally:
                stream.close()
            records.append({'pid':process.pid, 'command':list(map(str,command)),
                            'exit':process.returncode, 'log_path':str(log),
                            'log':log.read_text(errors='replace')})
        return records, errors

    def absent(self, owned):
        return all(not Path(f'/proc/{p.pid}').exists() for p,_,_,_ in owned)
