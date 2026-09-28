export function shopToday(timeZone='Asia/Colombo',now=new Date()){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
 return `${parts.year}-${parts.month}-${parts.day}`;
}
export function reportRange(preset='month',timeZone='Asia/Colombo',now=new Date()){
 const to=shopToday(timeZone,now),day=new Date(`${to}T12:00:00Z`);
 if(preset==='today')return {from:to,to};
 if(preset==='7days'){day.setUTCDate(day.getUTCDate()-6);return {from:day.toISOString().slice(0,10),to};}
 if(preset==='year')return {from:to.slice(0,4)+'-01-01',to};
 return {from:to.slice(0,7)+'-01',to};
}
