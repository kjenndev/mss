#!/usr/bin/env python3
"""Run booking QA on an unprivileged, Unix-socket-only disposable PostgreSQL cluster.
Never reads .env, connects to an existing server, or sends mail. Requires pg_config,
PostgreSQL server binaries, Node 24 and npm ci in mss-api.
"""
import os
from pathlib import Path
import subprocess
import tempfile
import sys


def main():
    if os.geteuid() == 0:
        raise SystemExit('Run as an unprivileged user, not root.')
    source = Path(__file__).resolve().parent.parent
    scratch = Path(os.environ.get('TMPDIR', Path.home() / '.hermes/cache/scratch'))
    base = scratch / 'mss-bookings-qa/backend'
    base.mkdir(parents=True, exist_ok=True)
    pg = Path(subprocess.check_output(['pg_config', '--bindir'], text=True).strip())
    env = dict(os.environ)
    for key in ['MSS_REGISTRATION_TEST_DB', 'DATABASE_URL', 'MSS_BOOKINGS_TEST_URL']:
        env.pop(key, None)
    with tempfile.TemporaryDirectory(prefix='pg-', dir=base) as temp:
        directory = Path(temp)
        socket = directory / 'socket'
        socket.mkdir()
        def run(*args, **kwargs):
            return subprocess.run([str(a) for a in args], check=True, env=env, **kwargs)
        run(pg / 'initdb', '-D', directory / 'data', '--locale=C.UTF-8', '--auth=trust', stdout=subprocess.DEVNULL)
        run(pg / 'pg_ctl', '-D', directory / 'data', '-l', directory / 'postgres.log',
            '-o', f"-k {socket} -h '' -p 55439", 'start', stdout=subprocess.DEVNULL)
        try:
            run(pg / 'createdb', '-h', socket, '-p', '55439', 'bookings_test')
            env['MSS_BOOKINGS_TEST_URL'] = f'postgresql://localhost:55439/bookings_test?host={socket}'
            result = subprocess.run(['node', '--test', '--test-concurrency=1', *(sys.argv[1:] or ['test/bookings-native.test.js', 'test/bookings-worker-native.test.js', 'test/bookings-worker-locking-native.test.js'])], cwd=source, env=env)
        finally:
            run(pg / 'pg_ctl', '-D', directory / 'data', '-m', 'immediate', 'stop', stdout=subprocess.DEVNULL)
    if directory.exists():
        raise RuntimeError('Disposable cluster cleanup failed')
    print('Disposable cluster stopped and removed; no production database used.', flush=True)
    return result.returncode


if __name__ == '__main__':
    sys.exit(main())
