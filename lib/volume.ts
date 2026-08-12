import type { AppData } from "./storage";
import type { DayLog, Exercise, MuscleTargetMap, VolumeContribution, Zone } from "./types";
import { MUSCLE_LABELS, MUSCLE_ORDER, weeklyTargetFor, type MuscleGroup, type TrainingLevel } from "./muscles";
import { activeMicrocyclePattern, isActiveMicrocycleDay } from "./microcycle";
import {
  isRehabSet,
  isValidWorkingSet,
  mechanicalVolumeForSet as canonicalMechanicalVolumeForSet,
  setStimulusFactor,
} from "./trainingMetrics";

export type VolumeStatus = "under" | "in" | "over";
export type VolumeMap = Partial<Record<MuscleGroup, number>>;
export type VolumeScope = "microcycle" | "7d" | "28d";
export interface MuscleVolumeSource { exerciseId: string; name: string; direct: boolean; rawDirectSets: number; directEffectiveSets: number; indirectEffectiveSets: number; stimulusSets: number; rehabSets: number; sets?: number; contribution?: number; }
export interface MuscleVolumeRow { muscle: MuscleGroup; rawDirectSets: number; directEffectiveSets: number; indirectEffectiveSets: number; stimulusSets: number; rehabSets: number; directSets: number; /** Backward-compatible target-facing value: direct effective sets only. */ effectiveSets: number; target: { low: number; high: number }; status: VolumeStatus; sources: MuscleVolumeSource[]; }
export interface VolumeSummary { rows: MuscleVolumeRow[]; totalWorkingSets: number; totalDirectEffectiveSets: number; totalIndirectEffectiveSets: number; resistanceRecoveryLoad: number; totalMechanicalVolume: number; cardioMinutes: number; cardioStress: number; trainingDays: number; totalDirectSets: number; /** Backward-compatible target-facing total: direct effective sets only. */ totalEffectiveSets: number; }
export type VolumeAdviceBasis = "actual" | "projected" | "partial" | "uncovered" | "unconfirmed";
export interface VolumeAdviceContext { cycleRatio: number; projectionComplete: boolean; projectedDirectSets: number; evidenceConfirmed?: boolean; }
export interface VolumeAdvice { muscle: MuscleGroup; kind: "add" | "hold" | "reduce"; basis: VolumeAdviceBasis; priority: number; title: string; detail: string; suggestedDirectSets: number; projectedDirectSets?: number; primarySource?: MuscleVolumeSource; }

const round = (n: number) => Math.round(n * 100) / 100;
const zones: Record<Zone, number> = { 1: .4, 2: .6, 3: 1, 4: 1.4, 5: 1.8 };
const validZone = (zone: unknown): zone is Zone => zone === 1 || zone === 2 || zone === 3 || zone === 4 || zone === 5;
const fallback = (e: Exercise): VolumeContribution[] => e.primaryMuscle ? [{ muscle: e.primaryMuscle, weight: 1, direct: true }] : [];
export const isCountedWorkingSet = isValidWorkingSet;
export const setEffortFactor = setStimulusFactor;
export const mechanicalVolumeForSet = canonicalMechanicalVolumeForSet;
export const volumeStatus = (n:number,low:number,high:number):VolumeStatus => n<low?"under":n>high?"over":"in";
export const targetForMuscle = (m:MuscleGroup,level?:TrainingLevel,custom?:MuscleTargetMap) => custom?.[m] ?? weeklyTargetFor(m,level);

export function computeVolumeSummary(days:(DayLog|undefined)[],level?:TrainingLevel,targets?:MuscleTargetMap,targetScale=1):VolumeSummary {
  const map=new Map<MuscleGroup,MuscleVolumeRow>();
  const row=(m:MuscleGroup)=>{ let x=map.get(m); if(!x){const t=targetForMuscle(m,level,targets); x={muscle:m,rawDirectSets:0,directEffectiveSets:0,indirectEffectiveSets:0,stimulusSets:0,rehabSets:0,directSets:0,effectiveSets:0,target:{low:round(t.low*targetScale),high:round(t.high*targetScale)},status:"under",sources:[]};map.set(m,x);}return x;};
  MUSCLE_ORDER.forEach(row); let work=0,resistance=0,mechanical=0,cardioMinutes=0,cardioStress=0,trainingDays=0;
  for(const day of days){if(!day)continue;const workout=day.workout;if(workout&&workout.type!=="rest"&&workout.exercises.some(e=>e.sets.some(s=>isCountedWorkingSet(s)||isRehabSet(s))))trainingDays++;for(const item of day.cardio??[]){const mins=Math.max(0,item.minutes??0);cardioMinutes+=mins;cardioStress+=mins*zones[validZone(item.zone) ? item.zone : 2];}if(!workout||workout.type==="rest")continue;for(const exercise of workout.exercises){const contributions=exercise.volumeContributions?.length?exercise.volumeContributions:fallback(exercise);for(const set of exercise.sets){const rehab=isRehabSet(set),effort=setEffortFactor(set);if(!rehab&&!effort)continue;if(!rehab){work++;resistance+=effort;mechanical+=mechanicalVolumeForSet(set);}for(const c of contributions){const direct=!!c.direct,target=row(c.muscle);let source=target.sources.find(x=>x.exerciseId===exercise.id&&x.direct===direct);if(!source){source={exerciseId:exercise.id,name:exercise.name,direct,rawDirectSets:0,directEffectiveSets:0,indirectEffectiveSets:0,stimulusSets:0,rehabSets:0,sets:0,contribution:0};target.sources.push(source);}if(rehab){if(direct){target.rehabSets++;source.rehabSets++;}continue;}const value=effort*c.weight;if(direct){target.rawDirectSets++;target.directEffectiveSets+=value;source.rawDirectSets++;source.directEffectiveSets+=value;source.sets=(source.sets??0)+1;}else{target.indirectEffectiveSets+=value;source.indirectEffectiveSets+=value;}target.stimulusSets+=value;source.stimulusSets+=value;source.contribution=(source.contribution??0)+value;}}}}
  const rows=MUSCLE_ORDER.map(m=>{const x=row(m);x.rawDirectSets=round(x.rawDirectSets);x.directEffectiveSets=round(x.directEffectiveSets);x.indirectEffectiveSets=round(x.indirectEffectiveSets);x.stimulusSets=round(x.stimulusSets);x.rehabSets=round(x.rehabSets);x.directSets=x.rawDirectSets;x.effectiveSets=x.directEffectiveSets;x.sources=x.sources.map(s=>({...s,rawDirectSets:round(s.rawDirectSets),directEffectiveSets:round(s.directEffectiveSets),indirectEffectiveSets:round(s.indirectEffectiveSets),stimulusSets:round(s.stimulusSets),rehabSets:round(s.rehabSets),contribution:round(s.contribution??0)})).sort((a,b)=>b.stimulusSets-a.stimulusSets);x.status=volumeStatus(x.directEffectiveSets,x.target.low,x.target.high);return x;});
  const totalDirectEffectiveSets=round(rows.reduce((n,x)=>n+x.directEffectiveSets,0)),totalIndirectEffectiveSets=round(rows.reduce((n,x)=>n+x.indirectEffectiveSets,0));
  return {rows,totalWorkingSets:round(work),totalDirectEffectiveSets,totalIndirectEffectiveSets,resistanceRecoveryLoad:round(resistance),totalMechanicalVolume:Math.round(mechanical),cardioMinutes:Math.round(cardioMinutes),cardioStress:round(cardioStress),trainingDays,totalDirectSets:round(rows.reduce((n,x)=>n+x.directSets,0)),totalEffectiveSets:totalDirectEffectiveSets};
}

export const weeklyVolume=(days:(DayLog|undefined)[]):VolumeMap=>Object.fromEntries(computeVolumeSummary(days).rows.map(x=>[x.muscle,x.directEffectiveSets]));
export const dateScopeDays=(data:AppData,dates:string[])=>dates.map(date=>data.days[date]);
export function microcycleDays(data:AppData){return data.microcycle?Object.values(data.days).filter(day=>isActiveMicrocycleDay(data,day)).sort((a,b)=>a.date.localeCompare(b.date)):[];}
export function volumeScopeDays(data:AppData,scope:VolumeScope,today:string){if(scope==="microcycle")return microcycleDays(data).filter(day=>day.date<=today);const count=scope==="7d"?7:28,out:(DayLog|undefined)[]=[],start=new Date(`${today}T00:00:00`);for(let i=count-1;i>=0;i--){const d=new Date(start);d.setDate(start.getDate()-i);out.push(data.days[`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`]);}return out;}
export function volumeTargetScale(scope:VolumeScope,data?:AppData){if(scope==="28d")return 4;if(scope!=="microcycle"||!data)return 1;return round(Math.max(1,activeMicrocyclePattern(data).length)/7);}
export function volumeScopeLabel(days:(DayLog|undefined)[],locale:"zh"|"en"|"ja"="zh"){const actual=days.filter((x):x is DayLog=>!!x);if(!actual.length)return locale==="en"?"No records":locale==="ja"?"記録なし":"暂无记录";const dates=actual.map(x=>x.date).sort(),first=dates[0],last=dates.at(-1)!,range=first===last?first.slice(5).replace("-","."):`${first.slice(5).replace("-",".")}–${last.slice(5).replace("-",".")}`,count=actual.length;return locale==="en"?`${range} · ${count} ${count===1?"day":"days"} logged`:locale==="ja"?`${range} · ${count}日記録`:`${range} · ${count} 天记录`;}
export function volumeAdviceForRow(
  row: MuscleVolumeRow,
  scope: VolumeScope,
  context?: VolumeAdviceContext,
): VolumeAdvice {
  const scale = scope === "28d" ? 4 : 1;
  const current = round(row.directEffectiveSets / scale);
  const low = round(row.target.low / scale);
  const high = round(row.target.high / scale);
  const source = row.sources.find((item) => item.directEffectiveSets > 0) ?? row.sources[0];
  const label = scale > 1
    ? `近 ${scale} 周周均 ${current} 直接有效组，周目标 ${low}–${high}`
    : `当前 ${row.directEffectiveSets} 直接有效组，目标 ${row.target.low}–${row.target.high}`;

  if (scope === "microcycle" && context) {
    const projected = round(Math.max(row.directEffectiveSets, context.projectedDirectSets));
    const cycleRatio = Math.min(1, Math.max(0, context.cycleRatio));
    if (context.evidenceConfirmed === false) {
      return {
        muscle: row.muscle,
        kind: "hold",
        basis: "unconfirmed",
        priority: 0,
        title: `${MUSCLE_LABELS[row.muscle]} 等待训练记录确认`,
        detail: `${label}。当前仍有进行中或未显式结束的训练；先完成或确认该记录，再重新计算周期预测，不提前给出加减量处方。`,
        suggestedDirectSets: 0,
        projectedDirectSets: projected,
        primarySource: source,
      };
    }
    if (row.directEffectiveSets > row.target.high) {
      const excess = Math.max(1, Math.ceil(row.directEffectiveSets - row.target.high));
      return {
        muscle: row.muscle,
        kind: "reduce",
        basis: "actual",
        priority: round(excess / Math.max(row.target.high, 1)),
        title: `先降 ${MUSCLE_LABELS[row.muscle]} 容量`,
        detail: `${label}。已完成容量超过上限，下轮优先从「${source?.name ?? "主要直接动作"}」减少 ${Math.min(4, excess)} 个工作组。`,
        suggestedDirectSets: Math.min(4, excess),
        projectedDirectSets: projected,
        primarySource: source,
      };
    }
    if (projected > row.target.high) {
      const excess = Math.max(1, Math.ceil(projected - row.target.high));
      return {
        muscle: row.muscle,
        kind: "reduce",
        basis: "projected",
        priority: round(excess / Math.max(row.target.high, 1)),
        title: `${MUSCLE_LABELS[row.muscle]} 预计超过本轮上限`,
        detail: `${label}。计入剩余模板预计 ${projected} 组，下轮从对应直接动作减少 ${Math.min(4, excess)} 组；本轮记录和计划保持不变。`,
        suggestedDirectSets: Math.min(4, excess),
        projectedDirectSets: projected,
        primarySource: source,
      };
    }
    if (!context.projectionComplete) {
      return {
        muscle: row.muscle,
        kind: "hold",
        basis: "uncovered",
        priority: 0,
        title: `${MUSCLE_LABELS[row.muscle]} 暂不判断加减量`,
        detail: `${label}。部分剩余训练日没有可计算的模板，无法可靠预测完整周期；先补全计划或完成本轮，不根据当前半程数据加减组数。`,
        suggestedDirectSets: 0,
        projectedDirectSets: projected,
        primarySource: source,
      };
    }
    if (projected >= row.target.low) {
      return {
        muscle: row.muscle,
        kind: "hold",
        basis: "projected",
        priority: 0,
        title: `${MUSCLE_LABELS[row.muscle]} 预计处于目标内`,
        detail: `${label}。计入剩余模板预计 ${projected} 组，按现有计划即可进入目标范围，不需要因为当前数值偏低临时加组。`,
        suggestedDirectSets: 0,
        projectedDirectSets: projected,
        primarySource: source,
      };
    }
    if (cycleRatio < 0.7) {
      return {
        muscle: row.muscle,
        kind: "hold",
        basis: "partial",
        priority: 0,
        title: `${MUSCLE_LABELS[row.muscle]} 本轮仍在进行`,
        detail: `${label}。剩余计划完成后预计 ${projected} 组，但本轮尚未接近结束；先按计划执行，不使用早期周期数据追加组数。`,
        suggestedDirectSets: 0,
        projectedDirectSets: projected,
        primarySource: source,
      };
    }
    if (projected <= 0) {
      return {
        muscle: row.muscle,
        kind: "hold",
        basis: "projected",
        priority: 0,
        title: `${MUSCLE_LABELS[row.muscle]} 本轮未安排直接训练`,
        detail: `${label}。当前周期没有该肌群的直接训练来源，系统不会仅凭空白记录自动要求加量。`,
        suggestedDirectSets: 0,
        projectedDirectSets: projected,
      };
    }
    const gap = Math.max(1, Math.ceil(row.target.low - projected));
    return {
      muscle: row.muscle,
      kind: "add",
      basis: "projected",
      priority: round(gap / Math.max(row.target.low, 1)),
      title: `${MUSCLE_LABELS[row.muscle]} 完成本轮后仍预计不足`,
      detail: `${label}。计入剩余模板预计 ${projected} 组，仍低于下限；只在下轮对应模板增加 ${Math.min(4, gap)} 个直接工作组，再观察恢复与表现。`,
      suggestedDirectSets: Math.min(4, gap),
      projectedDirectSets: projected,
      primarySource: source,
    };
  }

  if (!row.directEffectiveSets && !row.indirectEffectiveSets) {
    return {
      muscle: row.muscle,
      kind: "hold",
      basis: "actual",
      priority: 0,
      title: `${MUSCLE_LABELS[row.muscle]} 尚无训练样本`,
      detail: `${label}。当前没有有效工作组，系统不会仅凭空白记录要求你加量；只有把它设为明确优先肌群时，才在下一个对应训练日安排 2–3 个直接工作组。`,
      suggestedDirectSets: 0,
    };
  }
  if (row.status === "under") {
    const gap = Math.max(0, low - current);
    const sets = Math.min(4, Math.max(1, Math.ceil(gap)));
    return {
      muscle: row.muscle,
      kind: "add",
      basis: "actual",
      priority: round((gap || 0.5) / Math.max(low, 1)),
      title: `优先补 ${MUSCLE_LABELS[row.muscle]}`,
      detail: `${label}。${row.directEffectiveSets <= 0 ? "没有直接有效组，不能把复合动作的连带刺激当作该肌群的补量。" : `当前主要来自「${source?.name ?? "直接动作"}」，但直接刺激仍不足。`} 下一个对应训练日先增加 ${sets} 个直接工作组，再观察恢复与表现。`,
      suggestedDirectSets: sets,
      primarySource: source,
    };
  }
  if (row.status === "over") {
    const excess = Math.max(0, current - high);
    const sets = Math.min(4, Math.max(1, Math.ceil(excess)));
    return {
      muscle: row.muscle,
      kind: "reduce",
      basis: "actual",
      priority: round((excess || 0.5) / Math.max(high, 1)),
      title: `先降 ${MUSCLE_LABELS[row.muscle]} 容量`,
      detail: `${label}。优先从「${source?.name ?? "直接动作"}」减少 ${sets} 个工作组；连带刺激只用于恢复判断，不会替代直接目标。`,
      suggestedDirectSets: sets,
      primarySource: source,
    };
  }
  return {
    muscle: row.muscle,
    kind: "hold",
    basis: "actual",
    priority: 0,
    title: `${MUSCLE_LABELS[row.muscle]} 维持当前量`,
    detail: `${label}，目前在目标内。总刺激 ${row.stimulusSets}（含 ${row.indirectEffectiveSets} 连带），下一次优先维持动作质量、次数进步和恢复，不因为“还有空间”机械堆组数。`,
    suggestedDirectSets: 0,
    primarySource: source,
  };
}
export const volumeActionPlan=(rows:MuscleVolumeRow[],scope:VolumeScope,limit=3)=>rows.map(row=>volumeAdviceForRow(row,scope)).filter(x=>x.kind!=="hold").sort((a,b)=>b.priority-a.priority||a.muscle.localeCompare(b.muscle)).slice(0,limit);
