"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Clock3, CalendarDays, Activity, Users, DollarSign,
  ChevronLeft, Save, CheckCircle2, Circle, LogIn, LogOut,
} from "lucide-react";
import { getAdminHeaders, getAdminSession } from "@/lib/auth/adminSession";
import { ui } from "@/lib/ui";

const DAYS = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"] as const;
type Day = typeof DAYS[number];
const DAY_LABELS: Record<Day,string> = { monday:"Mon",tuesday:"Tue",wednesday:"Wed",thursday:"Thu",friday:"Fri",saturday:"Sat",sunday:"Sun" };
const DAY_FULL:   Record<Day,string> = { monday:"Monday",tuesday:"Tuesday",wednesday:"Wednesday",thursday:"Thursday",friday:"Friday",saturday:"Saturday",sunday:"Sunday" };

type Schedule = { admin_id:string } & { [K in Day as `${K}_start`]: string|null } & { [K in Day as `${K}_end`]: string|null } & { [K in Day as `${K}_off`]: boolean };
type AdminEntry = { admin_id:string; name:string; role:string; last_active_at:string|null; schedule:Schedule|null };
type TodaySession = { id:string; started_at:string; ended_at:string|null; active_seconds:number };
type SelfData = { today_seconds:number; week_seconds:number; period_seconds:number; period_start:string; period_end:string; clocked_in:boolean; session_started_at:string|null; today_sessions:TodaySession[] };
type WorkforceEntry = { user_id:string; name:string; role:string; online:boolean; last_active_at:string|null; today_hours:number; week_hours:number; period_hours:number; period_pay:number; rate:number };
type CompanyData = { online_count:number; today_seconds:number; period_seconds:number; payroll_estimate:number; period_start:string; period_end:string; workforce:WorkforceEntry[] };

function fmtSecs(s:number):string { if(s<=0)return"0m"; const m=Math.round(s/60),h=Math.floor(m/60),r=m%60; if(h===0)return`${r}m`; if(r===0)return`${h}h`; return`${h}h ${r}m`; }
function fmtTime(iso:string){ return new Date(iso).toLocaleTimeString([],{hour:"numeric",minute:"2-digit",hour12:true}); }
function fmtDate(iso:string){ return new Date(iso).toLocaleDateString([],{month:"short",day:"numeric"}); }
function lastSeenText(t:string|null){ if(!t)return"Never"; const d=Date.now()-new Date(t).getTime(); if(d<60000)return"Active now"; const m=Math.floor(d/60000); return m<60?`${m}m ago`:`${Math.floor(m/60)}h ago`; }
function isOnline(t:string|null){ return!!t&&Date.now()-new Date(t).getTime()<60000; }
function todayDayKey():Day{ return(["sunday","monday","tuesday","wednesday","thursday","friday","saturday"] as Day[])[new Date().getDay()]; }
function fmt12(t:string|null|undefined):string{ if(!t)return"—"; const[h,m]=t.split(":").map(Number); return`${h%12||12}:${String(m).padStart(2,"0")} ${h>=12?"PM":"AM"}`; }
function emptyForm():Record<string,string|boolean>{ const f:Record<string,string|boolean>={}; for(const d of DAYS){f[`${d}_start`]="09:00";f[`${d}_end`]="17:00";f[`${d}_off`]=d==="saturday"||d==="sunday";} return f; }

function StatCard({title,value,sub,icon,color="text-white"}:{title:string;value:string|number;sub?:string;icon:React.ReactNode;color?:string}){
  return(
    <div className={`${ui.card} p-5`}>
      <div className="flex items-center gap-2 text-white/40">{icon}<p className="text-[11px] uppercase tracking-wider">{title}</p></div>
      <p className={`text-3xl font-bold mt-3 ${color}`}>{value}</p>
      {sub&&<p className="text-xs text-white/30 mt-1">{sub}</p>}
    </div>
  );
}

function ScheduleEditor({admin,onClose,onSaved}:{admin:AdminEntry;onClose:()=>void;onSaved:()=>void}){
  const[form,setForm]=useState<Record<string,string|boolean>>(()=>{
    const b=emptyForm();
    if(admin.schedule){ for(const d of DAYS){b[`${d}_start`]=admin.schedule[`${d}_start`]??"09:00";b[`${d}_end`]=admin.schedule[`${d}_end`]??"17:00";b[`${d}_off`]=Boolean(admin.schedule[`${d}_off`]);} }
    return b;
  });
  const[saving,setSaving]=useState(false);
  const[saved,setSaved]=useState(false);
  const[error,setError]=useState<string|null>(null);

  async function save(){
    setSaving(true);setError(null);
    try{
      const res=await fetch("/api/admin/schedule",{method:"POST",headers:{"Content-Type":"application/json",...getAdminHeaders()},body:JSON.stringify({admin_id:admin.admin_id,...form})});
      const json=await res.json();
      if(!res.ok){setError(json.error??"Failed to save");return;}
      setSaved(true);setTimeout(()=>{onSaved();onClose();},700);
    }catch{setError("Network error");}
    finally{setSaving(false);}
  }

  return(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-[#0d1117] shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="text-white/40 hover:text-white transition"><ChevronLeft size={18}/></button>
            <div><h2 className="text-base font-semibold text-white">{admin.name}</h2><p className="text-xs text-white/40 capitalize">{admin.role.replace(/_/g," ")}</p></div>
          </div>
          <button onClick={save} disabled={saving||saved} className="flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 px-4 py-2 text-sm font-semibold text-white transition active:scale-[0.97]">
            {saved?<><CheckCircle2 size={15}/>Saved</>:saving?"Saving…":<><Save size={15}/>Save Schedule</>}
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-4 space-y-3">
          {error&&<p className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-2 text-sm text-red-300">{error}</p>}
          {DAYS.map(day=>{
            const off=Boolean(form[`${day}_off`]);
            return(
              <div key={day} className={`rounded-2xl border p-4 transition ${off?"border-white/[0.04] bg-white/[0.01] opacity-55":"border-white/10 bg-white/[0.04]"}`}>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold text-white">{DAY_FULL[day]}</p>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <span className="text-xs text-white/40">Day off</span>
                    <div onClick={()=>setForm(f=>({...f,[`${day}_off`]:!f[`${day}_off`]}))} className={`relative w-9 h-5 rounded-full cursor-pointer transition ${off?"bg-white/20":"bg-emerald-600"}`}>
                      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${off?"left-0.5":"left-[18px]"}`}/>
                    </div>
                  </label>
                </div>
                {!off&&(
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] uppercase text-white/30 tracking-wider">Start</label>
                      <input type="time" value={form[`${day}_start`] as string} onChange={e=>setForm(f=>({...f,[`${day}_start`]:e.target.value}))} className="mt-1 w-full rounded-xl bg-white/[0.06] border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500/50 transition"/>
                    </div>
                    <div>
                      <label className="text-[10px] uppercase text-white/30 tracking-wider">End</label>
                      <input type="time" value={form[`${day}_end`] as string} onChange={e=>setForm(f=>({...f,[`${day}_end`]:e.target.value}))} className="mt-1 w-full rounded-xl bg-white/[0.06] border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500/50 transition"/>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function WorkSchedulePage(){
  const ownerRoles=["owner","co_owner","super_admin"];
  const session=typeof window!=="undefined"?getAdminSession():null;
  const isOwner=ownerRoles.includes(session?.role??"");

  const[tab,setTab]=useState<"schedule"|"owner">("schedule");
  const[self,setSelf]=useState<SelfData|null>(null);
  const[company,setCompany]=useState<CompanyData|null>(null);
  const[admins,setAdmins]=useState<AdminEntry[]>([]);
  const[loading,setLoading]=useState(true);
  const[selfSchedule,setSelfSchedule]=useState<Schedule|null>(null);
  const[editingAdmin,setEditingAdmin]=useState<AdminEntry|null>(null);
  const[now,setNow]=useState(()=>new Date());
  const pollRef=useRef<ReturnType<typeof setInterval>>(undefined);

  const fetchData=useCallback(async(silent=false)=>{
    if(!silent)setLoading(true);
    try{
      const[wfRes,schRes]=await Promise.all([
        fetch("/api/admin/workforce",{headers:getAdminHeaders()}),
        fetch("/api/admin/schedule",{headers:getAdminHeaders()}),
      ]);
      const[wf,sch]=await Promise.all([wfRes.json(),schRes.json()]);
      if(wfRes.ok){setSelf(wf.self);setCompany(wf.company??null);}
      if(schRes.ok){
        if(sch.admins)setAdmins(sch.admins);
        if(sch.schedule!==undefined)setSelfSchedule(sch.schedule);
      }
    }catch{/**/}finally{if(!silent)setLoading(false);}
  },[]);

  useEffect(()=>{
    void fetchData();
    pollRef.current=setInterval(()=>void fetchData(true),30000);
    const tick=setInterval(()=>setNow(new Date()),10000);
    return()=>{clearInterval(pollRef.current);clearInterval(tick);};
  },[fetchData]);

  const ANCHOR=new Date("2026-01-05T00:00:00Z").getTime();
  const MS14=14*24*60*60*1000;
  const pidx=Math.floor((now.getTime()-ANCHOR)/MS14);
  const nextPay=new Date(ANCHOR+(pidx+1)*MS14);
  const daysLeft=Math.ceil((nextPay.getTime()-now.getTime())/(24*60*60*1000));

  const todayKey=todayDayKey();
  const todayOff=selfSchedule?Boolean(selfSchedule[`${todayKey}_off`]):null;
  const todayStart=selfSchedule?selfSchedule[`${todayKey}_start`]:null;
  const todayEnd=selfSchedule?selfSchedule[`${todayKey}_end`]:null;
  const hasSchedule=selfSchedule!==null;

  if(loading){
    return(<div className="flex items-center justify-center py-24"><div className="h-6 w-6 border-2 border-white/20 border-t-white rounded-full animate-spin"/></div>);
  }

  return(
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between fade-up">
        <div>
          <h1 className={ui.h1}>Workforce</h1>
          <p className="text-xs text-white/40 mt-1">Work schedule · hours · pay period</p>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-2.5 shrink-0">
          <span className="text-lg">💸</span>
          <div className="text-right">
            <p className="text-xs text-white/50">Next payday</p>
            <p className="text-sm font-semibold text-emerald-300">
              {nextPay.toLocaleDateString([],{weekday:"short",month:"short",day:"numeric"})}
              <span className="text-white/40 font-normal ml-1.5">· {daysLeft}d</span>
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 fade-up">
        <button onClick={()=>setTab("schedule")} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition ${tab==="schedule"?"bg-blue-600 text-white":"bg-white/[0.06] text-white/60 hover:bg-white/10 hover:text-white"}`}>
          <CalendarDays size={15}/>My Schedule
        </button>
        {isOwner&&(
          <button onClick={()=>setTab("owner")} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition ${tab==="owner"?"bg-purple-600 text-white":"bg-white/[0.06] text-white/60 hover:bg-white/10 hover:text-white"}`}>
            <Users size={15}/>Owner Dashboard
          </button>
        )}
      </div>

      {/* ── MY SCHEDULE ─────────────────────────────────────────── */}
      {tab==="schedule"&&self&&(
        <div className="space-y-5 fade-up">

          {/* Clock status */}
          <div className={`flex items-center justify-between rounded-2xl border px-5 py-4 ${self.clocked_in?"border-emerald-500/30 bg-emerald-500/[0.07]":"border-white/10 bg-white/[0.03]"}`}>
            <div className="flex items-center gap-3">
              {self.clocked_in?(
                <><span className="relative flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"/><span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-400"/></span>
                  <div><p className="text-sm font-semibold text-emerald-300">Clocked In</p>{self.session_started_at&&<p className="text-xs text-white/40">Since {fmtTime(self.session_started_at)}</p>}</div></>
              ):(
                <><span className="h-3 w-3 rounded-full bg-white/20"/><p className="text-sm text-white/50">Clocked Out</p></>
              )}
            </div>
            <div className="text-right">
              <p className="text-xs text-white/40">Pay period</p>
              <p className="text-xs text-white/60">{fmtDate(self.period_start)} → {fmtDate(self.period_end)}</p>
            </div>
          </div>

          {/* Today's shift card */}
          <div className={`${ui.card} p-5`}>
            <p className="text-[11px] uppercase tracking-wider text-white/40 mb-3">Today&apos;s Shift</p>
            {!hasSchedule?(
              <p className="text-sm text-white/30">No schedule assigned yet — contact your manager.</p>
            ):todayOff?(
              <div className="flex items-center gap-2">
                <span className="text-2xl">🌴</span>
                <div><p className="text-lg font-bold text-white/60">Day Off</p><p className="text-xs text-white/30">Enjoy your day</p></div>
              </div>
            ):(
              <div>
                <p className="text-2xl font-bold text-white">{fmt12(todayStart)} → {fmt12(todayEnd)}</p>
                <p className="text-xs text-white/40 mt-1 flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-full ${self.clocked_in?"bg-emerald-400 animate-pulse":"bg-white/20"}`}/>
                  {self.clocked_in?"Scheduled · Clocked In":"Scheduled · Not yet clocked in"}
                </p>
              </div>
            )}
          </div>

          {/* KPI row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard title="Today's Hours" value={fmtSecs(self.today_seconds)} sub="Active work time" icon={<Clock3 size={14}/>}/>
            <StatCard title="This Week"     value={fmtSecs(self.week_seconds)}  sub="Mon → today"     icon={<CalendarDays size={14}/>} color="text-blue-400"/>
            <StatCard title="Pay Period"    value={fmtSecs(self.period_seconds)} sub="14-day total"   icon={<Activity size={14}/>}    color="text-purple-400"/>
            <StatCard title="Status"        value={self.clocked_in?"Active":"Off"} icon={<Users size={14}/>} color={self.clocked_in?"text-emerald-400":"text-white/40"}/>
          </div>

          {/* Weekly schedule grid */}
          {hasSchedule&&(
            <div className={`${ui.card} p-5 space-y-3`}>
              <p className="text-[11px] uppercase tracking-wider text-white/40">Weekly Schedule</p>
              <div className="grid grid-cols-7 gap-1.5">
                {DAYS.map(day=>{
                  const off=selfSchedule?Boolean(selfSchedule[`${day}_off`]):true;
                  const s=selfSchedule?.[`${day}_start`]??null;
                  const e=selfSchedule?.[`${day}_end`]??null;
                  const isToday=day===todayKey;
                  return(
                    <div key={day} className={`rounded-xl p-2.5 text-center border transition ${isToday?"border-blue-500/40 bg-blue-500/10":off?"border-white/[0.04] bg-white/[0.02]":"border-white/10 bg-white/[0.04]"}`}>
                      <p className={`text-[11px] font-semibold uppercase tracking-wider mb-1 ${isToday?"text-blue-300":"text-white/50"}`}>{DAY_LABELS[day]}</p>
                      {off?<p className="text-[10px] text-white/20">Off</p>:<div className="space-y-0.5"><p className="text-[10px] text-white/60 leading-tight">{fmt12(s)}</p><p className="text-[10px] text-white/30">↓</p><p className="text-[10px] text-white/60 leading-tight">{fmt12(e)}</p></div>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Clock-in log */}
          <div className={`${ui.card} p-5 space-y-3`}>
            <div className="flex items-center justify-between">
              <p className="text-[11px] uppercase tracking-wider text-white/40">Today&apos;s Clock-In Log</p>
              <p className="text-xs text-white/30">{new Date().toLocaleDateString([],{weekday:"long",month:"long",day:"numeric"})}</p>
            </div>
            {self.today_sessions.length===0?(
              <p className="text-sm text-white/30 py-2 text-center">No sessions recorded today</p>
            ):(
              <div className="space-y-2">
                {self.today_sessions.map((s,i)=>(
                  <div key={s.id} className="flex items-center justify-between rounded-xl bg-white/[0.04] border border-white/[0.06] px-4 py-2.5">
                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-white/20 text-xs font-mono">#{i+1}</span>
                      <LogIn size={13} className="text-emerald-400 shrink-0"/>
                      <span className="text-white/80 font-medium">{fmtTime(s.started_at)}</span>
                      <span className="text-white/20">→</span>
                      {s.ended_at?(<><LogOut size={13} className="text-red-400/60 shrink-0"/><span className="text-white/60">{fmtTime(s.ended_at)}</span></>):(<span className="flex items-center gap-1 text-emerald-400 text-xs"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"/>Active</span>)}
                    </div>
                    <span className="text-sm font-semibold text-white/60 shrink-0">{fmtSecs(s.active_seconds)}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="border-t border-white/[0.06] pt-2.5 flex justify-between text-xs text-white/40">
              <span>Total active today</span><span className="font-semibold text-white/60">{fmtSecs(self.today_seconds)}</span>
            </div>
          </div>

          {/* Info box */}
          <div className="rounded-2xl border border-blue-500/20 bg-blue-500/[0.05] p-4 space-y-2">
            <p className="text-xs font-semibold text-blue-300 uppercase tracking-wider">How your time is tracked</p>
            <ul className="space-y-1.5 text-xs text-white/50">
              <li className="flex items-start gap-2"><CheckCircle2 size={13} className="text-emerald-400 shrink-0 mt-0.5"/>Clicking, typing, and scrolling count as active work time</li>
              <li className="flex items-start gap-2"><CheckCircle2 size={13} className="text-emerald-400 shrink-0 mt-0.5"/>Activity is recorded every 20 seconds in real-time</li>
              <li className="flex items-start gap-2"><Circle size={13} className="text-red-400/60 shrink-0 mt-0.5"/>Sitting idle or leaving the tab open does <strong className="text-white/60">not</strong> count</li>
              <li className="flex items-start gap-2"><Circle size={13} className="text-red-400/60 shrink-0 mt-0.5"/>Moving the mouse without clicking does <strong className="text-white/60">not</strong> count</li>
            </ul>
          </div>
        </div>
      )}

      {/* ── OWNER DASHBOARD ─────────────────────────────────────── */}
      {tab==="owner"&&isOwner&&(
        <div className="space-y-6 fade-up">

          {/* KPI */}
          {company&&(
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard title="Admins Online"    value={company.online_count}  sub="Active right now" icon={<Users size={14}/>}       color="text-emerald-400"/>
              <StatCard title="Hours Today"       value={fmtSecs(company.today_seconds)} sub="All staff" icon={<Clock3 size={14}/>}/>
              <StatCard title="Pay Period Hours"  value={fmtSecs(company.period_seconds)} sub={`${fmtDate(company.period_start)} → ${fmtDate(company.period_end)}`} icon={<Activity size={14}/>} color="text-blue-400"/>
              <StatCard title="Payroll Estimate"  value={`$${company.payroll_estimate.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`} sub="Current period" icon={<DollarSign size={14}/>} color="text-purple-400"/>
            </div>
          )}

          {/* ── Employee Schedule Manager ──────────────────────── */}
          <div className={`${ui.card} p-5 space-y-4`}>
            <div>
              <h2 className="text-base font-semibold text-white">Employee Schedule Manager</h2>
              <p className="text-xs text-white/40 mt-0.5">Click any admin to assign or edit their weekly shift</p>
            </div>

            <div className="space-y-2">
              {admins.map(a=>{
                const online=isOnline(a.last_active_at);
                const dayOff=a.schedule?Boolean(a.schedule[`${todayKey}_off`]):null;
                const sStart=a.schedule?.[`${todayKey}_start`]??null;
                const sEnd=a.schedule?.[`${todayKey}_end`]??null;
                const hasSched=a.schedule!==null;
                return(
                  <div key={a.admin_id} onClick={()=>setEditingAdmin(a)} className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/10 px-4 py-3 cursor-pointer transition group">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={`h-2 w-2 rounded-full shrink-0 ${online?"bg-emerald-400 animate-pulse":"bg-white/20"}`}/>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white truncate">{a.name}</p>
                        <p className="text-[11px] text-white/30 capitalize">{a.role.replace(/_/g," ")}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 ml-4">
                      {!hasSched?<span className="text-xs text-white/20 italic">No schedule</span>:dayOff?<span className="text-xs text-white/30">🌴 Off today</span>:<span className="text-xs text-white/50">{fmt12(sStart)} – {fmt12(sEnd)}</span>}
                      <div className="hidden sm:flex gap-0.5">
                        {DAYS.map(d=>{
                          const off=a.schedule?Boolean(a.schedule[`${d}_off`]):true;
                          return(<div key={d} title={`${DAY_FULL[d]}: ${off?"Off":`${fmt12(a.schedule?.[`${d}_start`])} – ${fmt12(a.schedule?.[`${d}_end`])}`}`} className={`h-4 w-4 rounded text-[8px] flex items-center justify-center font-bold ${off?"bg-white/[0.04] text-white/15":"bg-emerald-500/20 text-emerald-400"}`}>{DAY_LABELS[d][0]}</div>);
                        })}
                      </div>
                      <span className="text-white/20 group-hover:text-white/50 transition text-xs">Edit →</span>
                    </div>
                  </div>
                );
              })}
              {admins.length===0&&<p className="text-sm text-white/30 text-center py-4">No admins found</p>}
            </div>
          </div>

          {/* Live workforce table */}
          {company&&(
            <div className={`${ui.card} p-5 space-y-4`}>
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-white">Live Workforce</h2>
                <div className="flex items-center gap-1.5 text-xs text-white/40"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"/>Live · 30s refresh</div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wider text-white/30 border-b border-white/[0.06]">
                      <th className="text-left pb-3 pr-4">Admin</th><th className="text-center pb-3 pr-4">Status</th>
                      <th className="text-right pb-3 pr-4">Today</th><th className="text-right pb-3 pr-4">This Week</th>
                      <th className="text-right pb-3 pr-4">Pay Period</th><th className="text-right pb-3">Est. Pay</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {company.workforce.map(w=>(
                      <tr key={w.user_id} className="hover:bg-white/[0.02] transition">
                        <td className="py-3 pr-4"><p className="font-medium text-white">{w.name}</p><p className="text-[11px] text-white/30 capitalize mt-0.5">{w.role.replace(/_/g," ")}</p></td>
                        <td className="py-3 pr-4 text-center">
                          {w.online?(
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/25 px-2.5 py-1 text-xs font-medium text-emerald-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"/>Active</span>
                          ):(
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.04] border border-white/10 px-2.5 py-1 text-xs text-white/30"><span className="h-1.5 w-1.5 rounded-full bg-white/20"/>{lastSeenText(w.last_active_at)}</span>
                          )}
                        </td>
                        <td className="py-3 pr-4 text-right text-white/70 font-medium">{fmtSecs(w.today_hours*3600)}</td>
                        <td className="py-3 pr-4 text-right text-white/70 font-medium">{fmtSecs(w.week_hours*3600)}</td>
                        <td className="py-3 pr-4 text-right text-white/80 font-semibold">{fmtSecs(w.period_hours*3600)}</td>
                        <td className="py-3 text-right text-emerald-400 font-bold">${w.period_pay.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t border-white/10">
                    <tr><td colSpan={4} className="pt-3 text-xs text-white/30">Total</td><td className="pt-3 text-right text-white/80 font-bold">{fmtSecs(company.period_seconds)}</td><td className="pt-3 text-right text-emerald-400 font-bold">${company.payroll_estimate.toFixed(2)}</td></tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Schedule editor modal */}
      {editingAdmin&&(
        <ScheduleEditor admin={editingAdmin} onClose={()=>setEditingAdmin(null)} onSaved={()=>{setEditingAdmin(null);void fetchData(true);}}/>
      )}
    </div>
  );
}
