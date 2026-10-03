// Isolated query double: never imports DB config or connects to a service.
export function memoryDb(initial={}, fail=()=>false) {
 let state=structuredClone(initial); const operations=[]; const locks=[];
 const db=table=>{
  const filters=[]; let returning=false, action=null, data, limit=Infinity, offset=0;
  const rows=()=> (state[table]||[]).filter(row=>filters.every(f=>f(row)));
  const q={
   where(key,value,third){if(typeof key==='object')filters.push(r=>Object.entries(key).every(([k,v])=>r[k]==v));else if(third!==undefined)filters.push(r=>value==='<'?r[key]<third:value==='>'?r[key]>third:r[key]===third);else filters.push(r=>r[key]==value);return q},
   whereRaw(sql, bindings){if(sql !== 'lower(username) = lower(?)' || !Array.isArray(bindings) || bindings.length !== 1)throw Error('Unsupported memory SQL: '+sql);filters.push(r=>typeof r.username==='string' && r.username.toLowerCase()===String(bindings[0]).toLowerCase());return q},
   whereIn(key,values){filters.push(r=>values.includes(r[key]));return q},whereNot(key,v){filters.push(r=>r[key]!==v);return q},
   select(){return q},orderBy(){return q},forUpdate(){locks.push(table);return q},limit(n){limit=n;return q},offset(n){offset=n;return q},
   sum(){q.first=async()=>({total:rows().reduce((n,r)=>n+Number(r.bytes),0)});return q},
   first:async()=>structuredClone(rows()[0]),count(){q.first=async()=>({count:rows().length});return q},
   update(v){action='update';data=v;return q},del(){action='delete';return q},insert(v){action='insert';data=v;return q},returning(){returning=true;return q},
   then(resolve,reject){return Promise.resolve().then(()=>{
    if(!action)return structuredClone(rows().slice(offset,offset+limit));
    operations.push({table,action,data});if(fail(table,action,data))throw Error('synthetic write failure');
    if(action==='insert'){const inserted=(Array.isArray(data)?data:[data]).map(r=>({id:Math.max(0,...(state[table]||[]).map(r=>r.id||0))+1,...r}));state[table]=[...(state[table]||[]),...inserted];return returning?inserted:inserted.length;}
    const selected=rows();if(action==='update')selected.forEach(r=>Object.assign(r,data));else state[table]=(state[table]||[]).filter(r=>!selected.includes(r));
    return returning?selected:selected.length;
   }).then(resolve,reject)}
  };return q;
 };
 db.raw=async()=>[];db.fn={now:()=>new Date()};
 db.transaction=async fn=>{const saved=structuredClone(state);try{return await fn(db)}catch(e){state=saved;throw e}};
 db.locks=locks;db.state=()=>state;db.operations=operations;return db;
}
