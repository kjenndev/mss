import { useNavigate } from 'react-router-dom';

// Keep existing navigation markup/styles intact while avoiding a document reload.
export default function MediaNavigation({children}) {
 const navigate=useNavigate();
 const onClick=event=>{
  if(event.defaultPrevented || event.button!==0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const anchor=event.target.closest?.('a[href]');
  if(!anchor || anchor.hasAttribute('download') || (anchor.target && anchor.target!=='_self') || anchor.relList.contains('external')) return;
  const url=new URL(anchor.href,window.location.href);
  if(url.origin!==window.location.origin || !/^\/(?:$|about\/?$|artists(?:\/|$)|events(?:\/|$)|login\/?$|account\/?$|admin(?:\/|$)|users(?:\/|$))/.test(url.pathname)) return;
  event.preventDefault();
  navigate(`${url.pathname}${url.search}${url.hash}`);
 };
 return <div onClick={onClick}>{children}</div>;
}
