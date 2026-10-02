import {it,expect,vi} from 'vitest';
import {poll} from './poll';
it('refreshes on a bounded delay only after a request settles and stops on cleanup',async()=>{
 vi.useFakeTimers();let resolve;
 const task=vi.fn().mockImplementationOnce(()=>new Promise(r=>{resolve=r;})).mockResolvedValue();
 const stop=poll(task,10000);
 await vi.advanceTimersByTimeAsync(30000);expect(task).toHaveBeenCalledTimes(1);
 resolve();await vi.advanceTimersByTimeAsync(10000);expect(task).toHaveBeenCalledTimes(2);
 stop();await vi.advanceTimersByTimeAsync(30000);expect(task).toHaveBeenCalledTimes(2);vi.useRealTimers();
});
