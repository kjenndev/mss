#!/usr/bin/env python3
"""Run Stream Manager locking QA in a disposable socket-only PostgreSQL cluster.
Never reads .env and never connects to MSS local/shared databases.
"""
import os
from pathlib import Path
import subprocess
import tempfile
import sys

def main():
    if os.geteuid() == 0:
        raise SystemExit('Run as an unprivileged user, not root.')
    source=Path(__file__).resolve().parent.parent
    pg=Path(subprocess.check_output(['pg_config','--bindir'],text=True).strip())
    env=dict(os.environ)
    for key in list(env):
        if key in ('DATABASE_URL','MSS_STREAM_MANAGER_TEST_URL') or key.startswith('MSS_STREAM_MANAGER_'):
            env.pop(key,None)
    scratch=Path('/tmp')
    with tempfile.TemporaryDirectory(prefix='mss-stream-manager-pg-',dir=scratch) as temp:
        root=Path(temp);socket=root/'socket';socket.mkdir();port=str(40000+(os.getpid()%20000))
        def run(*args,**kwargs):return subprocess.run([str(x) for x in args],check=True,env=env,**kwargs)
        run(pg/'initdb','-D',root/'data','--locale=C.UTF-8','--auth=trust',stdout=subprocess.DEVNULL)
        run(pg/'pg_ctl','-D',root/'data','-l',root/'postgres.log','-o',f"-k {socket} -h '' -p {port}",'start',stdout=subprocess.DEVNULL)
        try:
            database=f'mss_stream_manager_test_{os.getpid()}'
            run(pg/'createdb','-h',socket,'-p',port,database)
            env['MSS_STREAM_MANAGER_TEST_URL']=f'postgresql://localhost:{port}/{database}?host={socket}'
            result=subprocess.run(['node','--test','--test-concurrency=1',*(sys.argv[1:] or ['test/stream-manager-native.test.js'])],cwd=source,env=env)
        finally:
            run(pg/'pg_ctl','-D',root/'data','-m','immediate','stop',stdout=subprocess.DEVNULL)
    if Path(temp).exists():raise RuntimeError('Disposable cluster cleanup failed')
    print('Disposable Stream Manager PostgreSQL cluster stopped and removed.',flush=True)
    return result.returncode

if __name__=='__main__':sys.exit(main())
