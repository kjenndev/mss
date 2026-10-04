#!/usr/bin/env python3
"""Root-only WSL disposable PostgreSQL QA; never reads .env or uses mss_local."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import uuid
import sys

def main():
    if os.geteuid() != 0:
        raise SystemExit('Run via wsl.exe -d Ubuntu -u root -- python3 <absolute script path>')
    source = Path(__file__).resolve().parent.parent
    def postgres(*args, **kwargs):
        return subprocess.run(['runuser', '-u', 'postgres', '--', *args], check=True, **kwargs)
    with tempfile.TemporaryDirectory(prefix='mss-registration-qa-', dir='/tmp') as directory:
        os.chmod(directory, 0o755)
        target = Path(directory) / 'api'
        shutil.copytree(source, target, symlinks=True,
                        ignore=shutil.ignore_patterns('.env', '.env.*', 'uploads', 'media'))
        subprocess.run(['chown', '-R', 'postgres:postgres', directory], check=True)
        # Each suite must start with a fresh schema so historical migration tests
        # cannot accidentally run against the other suite's already-upgraded DB.
        suites = ['youtube-native.test.js', 'registration-native.test.js', 'auth-policy-native.test.js', 'locking-native.test.js', 'avatar-native.test.js']
        requested = sys.argv[1:] or suites
        if any(suite not in suites for suite in requested):
            raise SystemExit('Unknown native suite')
        for suite in requested:
            database = 'mss_registration_test_' + uuid.uuid4().hex
            postgres('createdb', database)
            try:
                postgres('env', 'MSS_REGISTRATION_TEST_DB=' + database, 'node', '--test',
                         str(target / 'test' / suite))
            finally:
                postgres('dropdb', '--if-exists', database)
                check = postgres('psql', '-d', 'postgres', '-Atc',
                                 "SELECT count(*) FROM pg_database WHERE datname='" + database + "'",
                                 capture_output=True, text=True)
                if check.stdout.strip() != '0':
                    raise RuntimeError('Disposable database cleanup failed')
                print('Disposable database cleanup verified: 0 remaining', flush=True)
    if Path(directory).exists():
        raise RuntimeError('Disposable workspace cleanup failed')
    print('Disposable workspace cleanup verified', flush=True)

if __name__ == '__main__':
    main()
