import {render,screen,waitFor,fireEvent,act} from '@testing-library/react';
import {vi,it,expect,beforeEach} from 'vitest';
import StreamManager from './components/StreamManager';
import styles from './components/StreamManager.module.css';
import * as api from './Data.Helper.Api';
import {MediaPlayerContext} from './components/Media/MediaPlayerContext';
import {MediaPlayerProvider} from './components/Media/MediaPlayerProvider';
import {useMediaPlayer} from './components/Media/MediaPlayerContext';
vi.mock('./Data.Helper.Api');
const response=body=>({ok:true,json:async()=>body});
beforeEach(()=>{vi.clearAllMocks();api.GetMyArtists.mockResolvedValue(response({artists:[{id:1,name:'First',channel_name:'one'},{id:2,name:'Second',channel_name:'two'}]}));api.GetStreamManagerConfig.mockResolvedValue(response({enabled:true,platformOrigin:'https://platform.test',managerUrl:'https://platform.test/mss-manager'}));api.GetStreamManagerGrant.mockResolvedValue(response({grant:'scoped-grant',expiresIn:90,platformOrigin:'https://platform.test'}));Object.assign(navigator,{clipboard:{writeText:vi.fn()}})});
it('autoselects owned artist, handshakes exact source/origin, masks/copies credentials, and clears on switch',async()=>{
 render(<StreamManager/>);expect(await screen.findByRole('button',{name:/First/})).toHaveAttribute('aria-pressed','true');
 const frame=await screen.findByTitle('Streaming Platform manager');
 const posted=vi.spyOn(screen.getByTitle('Streaming Platform manager').contentWindow,'postMessage');
 fireEvent.load(frame);
 const message=(origin,data)=>{const event=new MessageEvent('message',{origin,data});Object.defineProperty(event,'source',{value:screen.getByTitle('Streaming Platform manager').contentWindow});fireEvent(window,event)};
 message('https://evil.test',{type:'mss-manager-ready',nonce:'n'});expect(api.GetStreamManagerGrant).not.toHaveBeenCalled();
 message('https://platform.test',{type:'mss-manager-ready',nonce:'n'});await waitFor(()=>expect(posted).toHaveBeenCalled());
 message('https://platform.test',{type:'mss-manager-credentials',nonce:'n',server:'rtmp://server/live',streamKey:'private-key',channelName:'one'});
 expect(await screen.findByLabelText('Server')).toHaveValue('••••••••••••');expect(screen.getByLabelText('OBS stream key')).toHaveValue('••••••••••••');
 fireEvent.click(screen.getByRole('button',{name:'Reveal server'}));expect(screen.getByLabelText('Server')).toHaveValue('rtmp://server/live');fireEvent.click(screen.getByRole('button',{name:'Copy server'}));expect(navigator.clipboard.writeText).toHaveBeenCalledWith('rtmp://server/live');
 fireEvent.click(screen.getByRole('button',{name:'Copy key'}));expect(navigator.clipboard.writeText).toHaveBeenCalledWith('private-key');
 fireEvent.click(screen.getByRole('button',{name:/Second/}));expect(screen.queryByDisplayValue('private-key')).not.toBeInTheDocument();expect(await screen.findByTitle('Streaming Platform manager')).not.toBe(frame);
});

it('closes persistent audio before acknowledging Watch and clears credentials on nonce-bound authorization loss',async()=>{
 const close=vi.fn();
 render(<MediaPlayerContext.Provider value={{close,selectionVersion:0}}><StreamManager/></MediaPlayerContext.Provider>);await screen.findByRole('button',{name:/First/});const frame=screen.getByTitle('Streaming Platform manager'),posted=vi.spyOn(frame.contentWindow,'postMessage');
 await act(async()=>new Promise(resolve=>setTimeout(resolve,0)));const message=data=>{const event=new MessageEvent('message',{origin:'https://platform.test',data});Object.defineProperty(event,'source',{value:frame.contentWindow});fireEvent(window,event)};
 message({type:'mss-manager-ready',nonce:'bound'});await waitFor(()=>expect(posted).toHaveBeenCalled());
 message({type:'mss-manager-credentials',nonce:'bound',server:'server-secret',streamKey:'key-secret',channelName:'one'});await screen.findByLabelText('Server');
 message({type:'mss-manager-watch-request',nonce:'bound',requestId:'watch-1'});expect(close).toHaveBeenCalled();expect(posted).toHaveBeenCalledWith({type:'mss-manager-watch-ack',nonce:'bound',requestId:'watch-1'},'https://platform.test');
 message({type:'mss-manager-authorization-lost',nonce:'bound'});expect(screen.queryByLabelText('Server')).not.toBeInTheDocument();
});

it('refreshes a bound grant without replacing the frame and removes it on terminal denial until explicit retry',async()=>{
 render(<StreamManager/>);await screen.findByRole('button',{name:/First/});
 vi.useFakeTimers();
 const frame=screen.getByTitle('Streaming Platform manager'),posted=vi.spyOn(frame.contentWindow,'postMessage');
 const message=data=>{const event=new MessageEvent('message',{origin:'https://platform.test',data});Object.defineProperty(event,'source',{value:frame.contentWindow});fireEvent(window,event)};
 message({type:'mss-manager-ready',nonce:'bound'});await act(async()=>{});
 expect(posted).toHaveBeenCalledWith(expect.objectContaining({type:'mss-manager-authorize',grant:'scoped-grant'}),'https://platform.test');
 await act(async()=>vi.advanceTimersByTimeAsync(75000));
 expect(screen.getByTitle('Streaming Platform manager')).toBe(frame);
 expect(posted).toHaveBeenCalledWith(expect.objectContaining({type:'mss-manager-refresh',nonce:'bound',grant:'scoped-grant'}),'https://platform.test');
 message({type:'mss-manager-authorization-lost',nonce:'bound'});
 expect(screen.queryByTitle('Streaming Platform manager')).not.toBeInTheDocument();
 expect(screen.getByRole('alert')).toHaveTextContent(/access ended/i);
 vi.useRealTimers();
 fireEvent.click(screen.getByRole('button',{name:/retry/i}));
 expect(await screen.findByTitle('Streaming Platform manager')).not.toBe(frame);
});

it('reports clipboard denial without exposing the credential',async()=>{
 navigator.clipboard.writeText.mockRejectedValueOnce(new Error('private-key must not leak'));
 render(<StreamManager/>);await screen.findByRole('button',{name:/First/});const frame=screen.getByTitle('Streaming Platform manager');
 const message=data=>{const event=new MessageEvent('message',{origin:'https://platform.test',data});Object.defineProperty(event,'source',{value:frame.contentWindow});fireEvent(window,event)};
 message({type:'mss-manager-ready',nonce:'bound'});await waitFor(()=>expect(api.GetStreamManagerGrant).toHaveBeenCalled());
 message({type:'mss-manager-credentials',nonce:'bound',server:'server-secret',streamKey:'key-secret',channelName:'one'});
 fireEvent.click(await screen.findByRole('button',{name:'Copy key'}));
 expect(await screen.findByRole('alert')).toHaveTextContent('Could not copy OBS stream key');
 expect(screen.getByRole('alert')).not.toHaveTextContent('key-secret');
});

it('acknowledges Watch only after the real persistent audio iframe is unmounted',async()=>{
 function StartAudio(){const player=useMediaPlayer();return <button onClick={()=>player.select({id:'show',provider:'mixcloud',title:'Show',artistName:'Artist',url:'https://www.mixcloud.com/artist/show/'},[{id:'show',provider:'mixcloud',title:'Show',artistName:'Artist',url:'https://www.mixcloud.com/artist/show/'}])}>Start audio</button>}
 render(<MediaPlayerProvider><StartAudio/><StreamManager/></MediaPlayerProvider>);
 fireEvent.click(screen.getByRole('button',{name:'Start audio'}));expect(await screen.findByTitle('Mixcloud player')).toBeInTheDocument();
 await screen.findByRole('button',{name:/First/});const frame=screen.getByTitle('Streaming Platform manager'),posted=vi.spyOn(frame.contentWindow,'postMessage');let audioPresentAtAck=false;posted.mockImplementation(payload=>{if(payload.type==='mss-manager-watch-ack')audioPresentAtAck=Boolean(screen.queryByTitle('Mixcloud player'))});
 const message=data=>{const event=new MessageEvent('message',{origin:'https://platform.test',data});Object.defineProperty(event,'source',{value:frame.contentWindow});fireEvent(window,event)};
 message({type:'mss-manager-ready',nonce:'real'});await waitFor(()=>expect(posted).toHaveBeenCalled());posted.mockClear();
 message({type:'mss-manager-watch-request',nonce:'real',requestId:'watch-real'});
 await waitFor(()=>expect(screen.queryByTitle('Mixcloud player')).not.toBeInTheDocument());
 expect(posted).toHaveBeenCalledWith({type:'mss-manager-watch-ack',nonce:'real',requestId:'watch-real'},'https://platform.test');
 expect(audioPresentAtAck).toBe(false);
});

it('ignores a delayed denied grant for an old artist without terminating the newer selection',async()=>{
 let resolveOld;api.GetStreamManagerGrant.mockImplementationOnce(()=>new Promise(resolve=>{resolveOld=resolve})).mockResolvedValueOnce(response({grant:'new-artist-grant',expiresIn:90}));
 render(<StreamManager/>);await screen.findByRole('button',{name:/First/});const firstFrame=screen.getByTitle('Streaming Platform manager');
 const send=(frame,data)=>{const event=new MessageEvent('message',{origin:'https://platform.test',data});Object.defineProperty(event,'source',{value:frame.contentWindow});fireEvent(window,event)};
 send(firstFrame,{type:'mss-manager-ready',nonce:'old-nonce'});await waitFor(()=>expect(api.GetStreamManagerGrant).toHaveBeenCalledTimes(1));
 fireEvent.click(screen.getByRole('button',{name:/Second/}));const secondFrame=await screen.findByTitle('Streaming Platform manager');expect(secondFrame).not.toBe(firstFrame);
 const posted=vi.spyOn(secondFrame.contentWindow,'postMessage');send(secondFrame,{type:'mss-manager-ready',nonce:'new-nonce'});
 await waitFor(()=>expect(posted).toHaveBeenCalledWith(expect.objectContaining({type:'mss-manager-authorize',grant:'new-artist-grant'}),'https://platform.test'));
 await act(async()=>resolveOld({ok:false,json:async()=>({})}));
 expect(screen.getByTitle('Streaming Platform manager')).toBe(secondFrame);expect(screen.queryByText(/access ended/i)).not.toBeInTheDocument();
});

it('stops audio and acknowledges each Watch request id exactly once',async()=>{
 const close=vi.fn();render(<MediaPlayerContext.Provider value={{close,selectionVersion:0}}><StreamManager/></MediaPlayerContext.Provider>);await screen.findByRole('button',{name:/First/});
 const frame=screen.getByTitle('Streaming Platform manager'),posted=vi.spyOn(frame.contentWindow,'postMessage');const send=data=>{const event=new MessageEvent('message',{origin:'https://platform.test',data});Object.defineProperty(event,'source',{value:frame.contentWindow});fireEvent(window,event)};
 send({type:'mss-manager-ready',nonce:'watch-nonce'});await waitFor(()=>expect(api.GetStreamManagerGrant).toHaveBeenCalled());posted.mockClear();
 send({type:'mss-manager-watch-request',nonce:'watch-nonce',requestId:'watch-1'});send({type:'mss-manager-watch-request',nonce:'watch-nonce',requestId:'watch-1'});
 expect(close).toHaveBeenCalledTimes(1);expect(posted).toHaveBeenCalledTimes(1);
});

it('uses the authenticated grant expiry for the next renewal only after its generation-bound acknowledgement',async()=>{
 api.GetStreamManagerGrant.mockResolvedValueOnce(response({grant:'initial',expiresIn:40})).mockResolvedValueOnce(response({grant:'renewed',expiresIn:73}));
 render(<StreamManager/>);await screen.findByRole('button',{name:/First/});vi.useFakeTimers();const frame=screen.getByTitle('Streaming Platform manager'),posted=vi.spyOn(frame.contentWindow,'postMessage');const send=data=>{const event=new MessageEvent('message',{origin:'https://platform.test',data});Object.defineProperty(event,'source',{value:frame.contentWindow});fireEvent(window,event)};
 send({type:'mss-manager-ready',nonce:'renew-nonce'});await act(async()=>{});await act(async()=>vi.advanceTimersByTimeAsync(25000));
 const refresh=posted.mock.calls.find(call=>call[0].type==='mss-manager-refresh')[0];expect(refresh.refreshId).toEqual(expect.any(String));
 send({type:'mss-manager-refresh-ack',nonce:'renew-nonce',refreshId:'stale'});await act(async()=>vi.advanceTimersByTimeAsync(2000));expect(screen.getByTitle('Streaming Platform manager')).toBe(frame);
 send({type:'mss-manager-refresh-ack',nonce:'renew-nonce',refreshId:refresh.refreshId});
 await act(async()=>vi.advanceTimersByTimeAsync(57000));expect(api.GetStreamManagerGrant).toHaveBeenCalledTimes(2);
 await act(async()=>vi.advanceTimersByTimeAsync(1000));expect(api.GetStreamManagerGrant).toHaveBeenCalledTimes(3);vi.useRealTimers();
});

it('shows setup guidance and never mounts the manager when configuration is disabled for an owned artist',async()=>{
 api.GetStreamManagerConfig.mockResolvedValue(response({enabled:false}));
 render(<StreamManager/>);
 await waitFor(()=>expect(screen.getByRole('alert')).toHaveTextContent(/not configured/i));
 expect(screen.queryByTitle('Streaming Platform manager')).not.toBeInTheDocument();
 expect(screen.queryByLabelText('OBS credentials')).not.toBeInTheDocument();
 expect(api.GetStreamManagerGrant).not.toHaveBeenCalled();
});

it('allows an unbroken owned artist name to wrap inside its selector',async()=>{
 const longName='Artist'.repeat(80);
 api.GetMyArtists.mockResolvedValue(response({artists:[{id:1,name:longName,channel_name:'one'}]}));
 render(<StreamManager/>);
 const selector=await screen.findByRole('button',{name:longName});
 expect(selector).toHaveClass(styles.artist);
});

it.each(['artists','config'])('shows loading until the pending %s request completes',async pending=>{
 let finish;
 const deferred=new Promise(resolve=>{finish=resolve});
 if(pending==='artists')api.GetMyArtists.mockReturnValueOnce(deferred);
 else api.GetStreamManagerConfig.mockReturnValueOnce(deferred);
 render(<StreamManager/>);
 await act(async()=>{});
 expect(screen.getByRole('status')).toHaveTextContent('Loading Stream Manager');
 expect(screen.queryByText(/No owned artists/)).not.toBeInTheDocument();
 expect(screen.queryByTitle('Streaming Platform manager')).not.toBeInTheDocument();
 await act(async()=>finish(response(pending==='artists'?{artists:[]}:{enabled:true,platformOrigin:'https://platform.test',managerUrl:'https://platform.test/mss-manager'})));
 expect(screen.queryByRole('status')).not.toBeInTheDocument();
 if(pending==='artists')expect(screen.getByRole('alert')).toHaveTextContent('No owned artists');
 else expect(screen.getByTitle('Streaming Platform manager')).toBeInTheDocument();
});

it.each(['mss-auth-change','storage'])('retains the session warning after %s and ignores a delayed grant',async eventType=>{
 let finish;
 api.GetStreamManagerGrant.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve}));
 render(<StreamManager/>);
 const frame=await screen.findByTitle('Streaming Platform manager');
 const posted=vi.spyOn(frame.contentWindow,'postMessage');
 const event=new MessageEvent('message',{origin:'https://platform.test',data:{type:'mss-manager-ready',nonce:'old-session'}});
 Object.defineProperty(event,'source',{value:frame.contentWindow});fireEvent(window,event);
 await waitFor(()=>expect(api.GetStreamManagerGrant).toHaveBeenCalledTimes(1));
 fireEvent(window,new Event(eventType));await act(async()=>{});
 expect(screen.getByRole('alert')).toHaveTextContent('Your Stream Manager session changed.');
 expect(screen.queryByTitle('Streaming Platform manager')).not.toBeInTheDocument();
 await act(async()=>finish(response({grant:'obsolete',expiresIn:90})));
 expect(posted).not.toHaveBeenCalled();
 expect(screen.getByRole('alert')).toHaveTextContent('Your Stream Manager session changed.');
 expect(screen.queryByLabelText('OBS credentials')).not.toBeInTheDocument();
 expect(screen.queryByText(/No owned artists/)).not.toBeInTheDocument();
});

it.each(['mss-auth-change','storage'])('ignores deferred initial responses after %s',async eventType=>{
 let finishArtists,finishConfig;
 api.GetMyArtists.mockImplementationOnce(()=>new Promise(resolve=>{finishArtists=resolve}));
 api.GetStreamManagerConfig.mockImplementationOnce(()=>new Promise(resolve=>{finishConfig=resolve}));
 render(<StreamManager/>);
 fireEvent(window,new Event(eventType));
 await act(async()=>{
 finishArtists(response({artists:[{id:1,name:'Obsolete',channel_name:'one'}]}));
 finishConfig(response({enabled:true,platformOrigin:'https://platform.test',managerUrl:'https://platform.test/mss-manager'}));
 });
 expect(screen.getByRole('alert')).toHaveTextContent('Your Stream Manager session changed.');
 expect(screen.queryByRole('status')).not.toBeInTheDocument();
 expect(screen.queryByTitle('Streaming Platform manager')).not.toBeInTheDocument();
 expect(screen.queryByText('Obsolete')).not.toBeInTheDocument();
 expect(api.GetStreamManagerGrant).not.toHaveBeenCalled();
});

it('reports non-OK disabled configuration as a load failure, not missing setup',async()=>{
 api.GetStreamManagerConfig.mockResolvedValueOnce({ok:false,status:500,json:async()=>({enabled:false})});
 render(<StreamManager/>);
 await waitFor(()=>expect(screen.getByRole('alert')).toHaveTextContent('Unable to load Stream Manager.'));
 expect(screen.queryByText(/not configured/i)).not.toBeInTheDocument();
 expect(screen.queryByRole('status')).not.toBeInTheDocument();
 expect(screen.queryByTitle('Streaming Platform manager')).not.toBeInTheDocument();
 expect(screen.queryByLabelText('OBS credentials')).not.toBeInTheDocument();
 expect(api.GetStreamManagerGrant).not.toHaveBeenCalled();
});

it('preserves selected audio on automatic preview requests and grants explicit return only',async()=>{
 const close=vi.fn();render(<MediaPlayerContext.Provider value={{close,item:{id:'audio'},selectionVersion:1}}><StreamManager/></MediaPlayerContext.Provider>);
 const frame=await screen.findByTitle('Streaming Platform manager'),posted=vi.spyOn(frame.contentWindow,'postMessage');
 const send=data=>{const event=new MessageEvent('message',{origin:'https://platform.test',data});Object.defineProperty(event,'source',{value:frame.contentWindow});fireEvent(window,event)};
 send({type:'mss-manager-ready',nonce:'n'});await waitFor(()=>expect(api.GetStreamManagerGrant).toHaveBeenCalled());posted.mockClear();
 send({type:'mss-manager-watch-request',nonce:'n',requestId:'auto',automatic:true});
 expect(close).not.toHaveBeenCalled();expect(posted).toHaveBeenCalledWith({type:'mss-manager-stop',nonce:'n'},'https://platform.test');
 expect(posted).not.toHaveBeenCalledWith(expect.objectContaining({type:'mss-manager-watch-ack'}),expect.anything());
 send({type:'mss-manager-watch-request',nonce:'n',requestId:'manual'});expect(close).toHaveBeenCalledTimes(1);
 expect(frame).toHaveAttribute('allow','autoplay; fullscreen');
});
