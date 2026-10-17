import crypto from 'node:crypto';

const TTL = 90;
const origin = value => {
  try { const parsed=new URL(value); return ['http:','https:'].includes(parsed.protocol) && parsed.origin===value && !parsed.username && !parsed.password ? value : null; }
  catch { return null; }
};
const safeEqual=(left,right)=>{
  const a=Buffer.from(left || ''),b=Buffer.from(right || '');
  return a.length===b.length && crypto.timingSafeEqual(a,b);
};
const inactive={active:false};

export function createStreamManager({env=process.env,now=Date.now,randomBytes=crypto.randomBytes,registryCapacity=10_000}={}) {
  let config=null;
  const grants=new Map();
  try {
    const mappings=JSON.parse(env.MSS_STREAM_MANAGER_CHANNEL_MAP || '{}');
    const privateKey=crypto.createPrivateKey(env.MSS_STREAM_MANAGER_PRIVATE_KEY || '');
    const issuer=origin(env.MSS_STREAM_MANAGER_ISSUER),platformOrigin=origin(env.MSS_STREAM_MANAGER_PLATFORM_ORIGIN);
    const introspectionToken=env.MSS_STREAM_MANAGER_INTROSPECTION_TOKEN || '';
    if(env.MSS_STREAM_MANAGER_ENABLED==='true' && issuer && platformOrigin && env.MSS_STREAM_MANAGER_AUDIENCE && introspectionToken.length>=32 && privateKey.asymmetricKeyType==='ed25519' && mappings && !Array.isArray(mappings))
      config={issuer,platformOrigin,audience:env.MSS_STREAM_MANAGER_AUDIENCE,privateKey,introspectionToken,mappings};
  } catch {}
  const publicConfig=()=>config?{enabled:true,platformOrigin:config.platformOrigin,managerUrl:`${config.platformOrigin}/mss-manager`}:{enabled:false,reason:'not_configured'};
  function issueGrant({sessionToken,user,artist}) {
    if(!config)throw new Error('Stream Manager is not configured');
    if(!user || !['artist','admin'].includes(user.role))throw new Error('Role is not authorized');
    if(!artist || Number(artist.user_id)!==Number(user.id))throw new Error('Artist is not owned by this account');
    if(config.mappings[String(artist.id)]!==artist.channel_name)throw new Error('Artist channel is not configured');
    const iat=Math.floor(now()/1000);
    const claims={iss:config.issuer,aud:config.audience,purpose:'manager',channel:artist.channel_name,artistId:Number(artist.id),sub:`mss-user:${user.id}`,sid:crypto.createHash('sha256').update(sessionToken).digest('base64url'),jti:randomBytes(18).toString('base64url'),iat,exp:iat+TTL};
    for(const [id,entry] of grants)if(entry.expiresAt<=now())grants.delete(id);
    if(grants.size>=registryCapacity)throw new Error('Stream Manager grant capacity reached');
    grants.set(claims.jti,{sessionToken,expiresAt:claims.exp*1000});
    const body=Buffer.from(JSON.stringify(claims)).toString('base64url');
    return {grant:`${body}.${crypto.sign(null,Buffer.from(body),config.privateKey).toString('base64url')}`,expiresIn:TTL,platformOrigin:config.platformOrigin};
  }
  async function introspect({authorization,grant,lookup}) {
    if(!config || !safeEqual(authorization,`Bearer ${config.introspectionToken}`) || typeof lookup!=='function')return inactive;
    try {
      const [body,signature,...rest]=String(grant || '').split('.'); if(rest.length || !body || !signature)return inactive;
      const publicKey=crypto.createPublicKey(config.privateKey);
      if(!crypto.verify(null,Buffer.from(body),publicKey,Buffer.from(signature,'base64url')))return inactive;
      const claims=JSON.parse(Buffer.from(body,'base64url')); const current=Math.floor(now()/1000);
      if(claims.iss!==config.issuer || claims.aud!==config.audience || claims.purpose!=='manager' || claims.exp<=current || claims.iat>current || claims.exp-claims.iat!==TTL || config.mappings[String(claims.artistId)]!==claims.channel)return inactive;
      const registered=grants.get(claims.jti);
      if(!registered || registered.expiresAt<=now()){grants.delete(claims.jti);return inactive;}
      const state=await lookup(claims,registered.sessionToken);
      if(!state?.session || !(new Date(state.session.expires_at).getTime()>now()) || crypto.createHash('sha256').update(state.session.token).digest('base64url')!==claims.sid)return inactive;
      if(!state.user || state.user.is_disabled || !['artist','admin'].includes(state.user.role) || `mss-user:${state.user.id}`!==claims.sub)return inactive;
      if(!state.artist || state.artist.is_disabled || Number(state.artist.id)!==claims.artistId || Number(state.artist.user_id)!==Number(state.user.id) || state.artist.channel_name!==claims.channel)return inactive;
      return {active:true,channel:claims.channel,artistId:claims.artistId,displayName:state.artist.name};
    } catch { return inactive; }
  }
  return {publicConfig,issueGrant,introspect};
}

// Lock order is shared advisory mutation lock -> user -> session -> artist.
// The first unlocked session lookup identifies the user; every value used for
// signing is then re-read under row locks in this transaction.
export async function issueGrantForCurrentOwner({db,manager,sessionToken,artistId,now=Date.now}){
 return db.transaction(async trx=>{
  await trx.raw('SELECT pg_advisory_xact_lock(1297306453)');
  const initial=await trx('sessions').where({token:sessionToken}).first();
  if(!initial)throw new Error('Current session is not authorized');
  const user=await trx('users').where({id:initial.user_id}).forUpdate().first();
  const session=await trx('sessions').where({token:sessionToken,user_id:initial.user_id}).forUpdate().first();
  if(!session||!(new Date(session.expires_at).getTime()>now())||!user||user.is_disabled||!['artist','admin'].includes(user.role))throw new Error('Current session is not authorized');
  const artist=await trx('artists').where({id:artistId,user_id:user.id}).forUpdate().first();
  if(!artist||artist.is_disabled)throw new Error('Artist ownership required');
  return manager.issueGrant({sessionToken,user,artist});
 });
}
