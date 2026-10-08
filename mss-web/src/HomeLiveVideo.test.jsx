import {render,screen,waitFor} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
import SyndicatePlayer from './components/Stream/Syndicate.Player.Component';
import HomeScreen from './components/Media/HomeScreen';
vi.mock('./Data.Helper.Api',()=>({GetSettings:vi.fn(async()=>({ok:true,json:async()=>({settings:{streaming_platform_url:'https://platform.example'}})})),GetHomeFeaturedVideos:vi.fn(async()=>({ok:true,json:async()=>({videos:[]})}))}));
it('opts homepage into a titled responsive video-only iframe with encoded channel; default artist player stays watch',async()=>{
 const view=render(<HomeScreen liveLoading={false} live={[{id:1,name:'Fixture artist',channelName:'channel one/#'}]} settings={{}}/>);
 await waitFor(()=>expect(view.container.querySelector('iframe')).toHaveAttribute('src','https://platform.example/embed/channel%20one%2F%23'));
 const frame=view.container.querySelector('iframe');
 expect(frame).toHaveAttribute('title','Live video - channel one/#');
 expect(frame).toHaveAttribute('allowfullscreen');
 expect(frame.style.aspectRatio).toBe('16 / 9');
 expect(screen.queryByText(/Full platform player/)).not.toBeInTheDocument();
 view.unmount();
 const artist=render(<SyndicatePlayer channelName="channel one/#"/>);
 await waitFor(()=>expect(artist.container.querySelector('iframe')).toHaveAttribute('src','https://platform.example/watch/channel%20one%2F%23'));
});
