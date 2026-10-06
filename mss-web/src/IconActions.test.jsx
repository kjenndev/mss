// @vitest-environment jsdom
import { it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Artists from './components/Artist/Artist.Component.List';
import ArtistDetail from './components/Artist/Artist.Component.Detail';
import ArtistUpdate from './components/Artist/Artist.Component.Update';
import DeleteArtist from './components/Artist/Artist.Component.Delete';
import Events from './components/Event/Event.Component.List';
import EventDetail from './components/Event/Event.Component.Detail';
import EventUpdate from './components/Event/Event.Component.Update';
import EventCreate from './components/Event/Event.Component.Create';
import UserProfile from './components/User/User.Component.Profile';
import Dashboard from './components/Admin/Admin.Dashboard.Component';
import About from './components/About.Component';
import AdminAbout from './components/Admin/Admin.About.Component';
import Settings from './components/Admin/Admin.Settings.Component';
import Comments from './components/Comments/CommentSection';
import Player from './components/Stream/Syndicate.Player.Component';
import * as api from './Data.Helper.Api';
vi.mock('./Data.Helper.Api');
vi.mock('@mui/x-date-pickers/DateTimePicker',()=>({DateTimePicker:()=>null}));
vi.mock('./components/Artist/Artist.Helper.DropDown',()=>({default:()=>null}));
vi.mock('./components/User/User.Helper.DropDown',()=>({default:()=>null}));
const response=data=>({ok:true,json:async()=>data});
beforeEach(()=>{
 vi.resetAllMocks();
 api.IsAdmin.mockReturnValue(true); api.CanCreateEvent.mockReturnValue(true); api.CanEditArtist.mockReturnValue(true); api.CanEditEvent.mockReturnValue(true);
 const artist={id:1,name:'Fixture artist',user_id:1};
 const event={id:1,title:'Fixture event',artists:[],images:[],date:null};
 api.GetAllArtists.mockResolvedValue(response({artists:[artist]}));
 api.GetArtistById.mockResolvedValue(response({artist}));
 api.GetArtistManageData.mockResolvedValue(response({artist}));
 api.GetArtistImages.mockResolvedValue(response({images:[]}));
 api.GetAllEvents.mockResolvedValue(response({events:[event]}));
 api.GetEventById.mockResolvedValue(response({event}));
 api.GetCurrentUser.mockResolvedValue(response({user:{id:1,username:'fixture'}}));
 api.GetAllUsers.mockResolvedValue(response({users:[{id:1,username:'fixture',role:'admin',artist_ids:[]}]}));
 api.GetSettings.mockResolvedValue(response({settings:{},raw:[]}));
 api.GetComments.mockResolvedValue(response({comments:[{id:1,content:'Fixture comment'}],has_more:true,next_cursor:JSON.stringify({date:null,id:1})}));
 api.GetActiveSyndicateStreams.mockResolvedValue(response({streams:[]}));
});
afterEach(cleanup);
function setup(Component, props={}) {
 return render(<MemoryRouter initialEntries={['/1']}><Routes><Route path="/:id" element={<Component {...props}/>}/></Routes></MemoryRouter>);
}
function iconAction(control) {
 expect(control.querySelector('svg[aria-hidden="true"]')).toBeTruthy();
 expect(control.textContent.trim()).not.toBe('');
}
it.each([
 [Artists,'Edit','link'], [Events,'Edit','link'], [ArtistDetail,'Edit Profile','button'],
 [ArtistUpdate,'Save Changes','button'], [DeleteArtist,'Delete','button'],
 [EventDetail,'Edit Event','button'], [EventUpdate,'Update Event','button'],
 [EventUpdate,'Delete Event','button'], [UserProfile,'Save Changes','button'],
 [Dashboard,'Edit','link'], [Comments,'Load more comments','button'],
])('keeps action labels alongside decorative icons case %#',async(Component,name,role)=>{
 setup(Component); iconAction(await screen.findByRole(role,{name}));
});
it('adds an upload icon while retaining the photo upload label',async()=>{
 setup(EventDetail); iconAction(await screen.findByText('Upload Photo'));
});
it.each([EventCreate,EventUpdate])('adds a flyer upload icon without replacing the filename case %#',async Component=>{
 setup(Component); iconAction(await screen.findByText(/Choose Flyer Image|Change Flyer Image/));
});
it.each([
 [Artists,'GetAllArtists'],[ArtistDetail,'GetArtistById'],[ArtistUpdate,'GetArtistManageData'],
 [Events,'GetAllEvents'],[EventDetail,'GetEventById'],[EventUpdate,'GetEventById'],
 [About,'GetSettings'],[AdminAbout,'GetSettings'],[Settings,'GetSettings'],[Player,'GetSettings'],
])('pairs Retry with a decorative icon case %#',async(Component,method)=>{
 api[method].mockResolvedValue({ok:false}); setup(Component,{channelName:'fixture'});
 iconAction(await screen.findByRole('button',{name:'Retry'}));
});
it('pairs Retry comments with a decorative icon',async()=>{
 api.GetComments.mockResolvedValue({ok:false}); setup(Comments);
 iconAction(await screen.findByRole('button',{name:'Retry comments'}));
});
it('keeps a save icon in the admin user editor',async()=>{
 setup(Dashboard); fireEvent.click(screen.getByRole('tab',{name:/Users/}));
 const edit=await screen.findByRole('button',{name:'Edit user'});
 expect(edit.title).toBe('Edit user');
 fireEvent.click(edit); iconAction(screen.getByRole('button',{name:'Save Changes'}));
});

it('keeps the artist external platform action text with an icon',async()=>{
 api.GetArtistById.mockResolvedValue(response({artist:{id:1,name:'Fixture artist',channel_name:'fixture'}}));
 api.GetSettings.mockResolvedValue(response({settings:{streaming_platform_url:'https://platform.test'}}));
 api.GetActiveSyndicateStreams.mockResolvedValue(response({streams:[{artistId:1,channelName:'fixture'}]}));
 setup(ArtistDetail); iconAction(await screen.findByRole('button',{name:'Open platform player'}));
});
