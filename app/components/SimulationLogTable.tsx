'use client';

import React, { useState } from 'react';
import { SimulationLogEntry, HitDetail, AdditionalDamageEntry, HealingEntry, ShieldEntry, DotDetonationEntry, DamageTakenEntry, EquipmentEffectEntry, EffectSummary } from '@/app/types';

interface SimulationLogTableProps {
  logs: SimulationLogEntry[];
}

const HitDetailsRow: React.FC<{ hitDetails: HitDetail[] }> = ({ hitDetails }) => {
  if (!hitDetails || hitDetails.length === 0) return null;

  // 係数名のマッピング
  const multiplierLabels: Record<string, string> = {
    baseDmg: '基礎ダメ',
    critMult: '会心系数',
    dmgBoostMult: '与ダメ係数',
    defMult: '防御係数',
    resMult: '耐性係数',
    vulnMult: '被ダメ係数',
    brokenMult: '撃破係数'
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 p-2 bg-gray-100 dark:bg-gray-900 rounded">
      {hitDetails.map((hit, idx) => (
        <div
          key={idx}
          className={`relative group flex items-center gap-2 px-2 py-1 rounded text-xs cursor-help ${hit.isCrit ? 'bg-yellow-200 dark:bg-yellow-800 border-l-4 border-yellow-500' : 'bg-gray-200 dark:bg-gray-700'
            }`}
        >
          <span className="font-semibold">Hit {hit.hitIndex + 1}:</span>
          <span className="text-gray-600 dark:text-gray-300">{(hit.multiplier * 100).toFixed(0)}%</span>
          <span className="font-bold">{Math.round(hit.damage)}</span>
          {hit.isCrit ? (
            <span className="text-yellow-600 dark:text-yellow-400 font-bold">✓ 会心</span>
          ) : (
            <span className="text-gray-400">-</span>
          )}
          {hit.targetName && <span className="text-gray-500 text-xs">({hit.targetName})</span>}

          {/* ダメージ係数ツールチップ */}
          {hit.breakdownMultipliers && (
            <div className="absolute z-50 bottom-full left-0 mb-1 hidden group-hover:block">
              <div className="bg-gray-800 dark:bg-gray-950 text-white text-xs p-2 rounded shadow-lg border border-gray-600 min-w-[200px]">
                <div className="font-semibold mb-1 text-yellow-400">📊 ダメージ計算式</div>
                <div className="space-y-0.5">
                  {Object.entries(hit.breakdownMultipliers).map(([key, value]) => (
                    <div key={key} className="flex justify-between">
                      <span className="text-gray-300">{multiplierLabels[key] || key}:</span>
                      <span className="font-mono">
                        {key === 'baseDmg'
                          ? Math.round(value as number).toLocaleString()
                          : (value as number).toFixed(4)
                        }
                      </span>
                    </div>
                  ))}
                </div>
                <div className="border-t border-gray-600 mt-1 pt-1 flex justify-between font-bold">
                  <span>最終ダメージ:</span>
                  <span className="text-green-400">{Math.round(hit.damage).toLocaleString()}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

// 付加ダメージ詳細コンポーネント
const AdditionalDamageDetails: React.FC<{ entries: AdditionalDamageEntry[] }> = ({ entries }) => {
  if (!entries || entries.length === 0) return null;

  return (
    <div className="space-y-1">
      <div className="text-xs font-semibold text-blue-600 dark:text-blue-400">付加ダメージ:</div>
      {entries.map((entry, idx) => (
        <div key={idx} className="flex items-center gap-2 px-2 py-1 bg-blue-50 dark:bg-blue-900/30 rounded text-xs border-l-2 border-blue-400">
          <span className="text-blue-600 dark:text-blue-400">[{entry.source}]</span>
          <span>{entry.name}</span>
          <span className="font-bold text-red-500">{Math.round(entry.damage)}</span>
          {entry.isCrit && <span className="text-yellow-600 dark:text-yellow-400 font-bold">✓ 会心</span>}
          <span className="text-gray-500">→ {entry.target}</span>
        </div>
      ))}
    </div>
  );
};

// 回復詳細コンポーネント
const HealingDetails: React.FC<{ entries: HealingEntry[] }> = ({ entries }) => {
  if (!entries || entries.length === 0) return null;

  return (
    <div className="space-y-1">
      <div className="text-xs font-semibold text-green-600 dark:text-green-400">回復:</div>
      {entries.map((entry, idx) => (
        <div key={idx} className="flex items-center gap-2 px-2 py-1 bg-green-50 dark:bg-green-900/30 rounded text-xs border-l-2 border-green-400">
          <span className="text-green-600 dark:text-green-400">[{entry.source}]</span>
          <span>{entry.name}</span>
          <span className="font-bold text-green-500">+{Math.round(entry.amount)}</span>
          <span className="text-gray-500">→ {entry.target}</span>
        </div>
      ))}
    </div>
  );
};

// シールド詳細コンポーネント
const ShieldDetails: React.FC<{ entries: ShieldEntry[] }> = ({ entries }) => {
  if (!entries || entries.length === 0) return null;

  return (
    <div className="space-y-1">
      <div className="text-xs font-semibold text-purple-600 dark:text-purple-400">シールド:</div>
      {entries.map((entry, idx) => (
        <div key={idx} className="flex items-center gap-2 px-2 py-1 bg-purple-50 dark:bg-purple-900/30 rounded text-xs border-l-2 border-purple-400">
          <span className="text-purple-600 dark:text-purple-400">[{entry.source}]</span>
          <span>{entry.name}</span>
          <span className="font-bold text-purple-500">{Math.round(entry.amount)}</span>
          <span className="text-gray-500">→ {entry.target}</span>
        </div>
      ))}
    </div>
  );
};

// 被ダメ詳細コンポーネント
const DamageTakenDetails: React.FC<{ entries: DamageTakenEntry[] }> = ({ entries }) => {
  if (!entries || entries.length === 0) return null;

  return (
    <div className="space-y-1">
      <div className="text-xs font-semibold text-orange-600 dark:text-orange-400">被ダメ:</div>
      {entries.map((entry, idx) => (
        <div key={idx} className="flex items-center gap-2 px-2 py-1 bg-orange-50 dark:bg-orange-900/30 rounded text-xs border-l-2 border-orange-400">
          <span className="text-orange-600 dark:text-orange-400">[{entry.source}]</span>
          <span>{entry.type === 'self' ? '自傷' : entry.type === 'dot' ? entry.dotType || 'DoT' : '敵'}</span>
          <span className="font-bold text-orange-500">-{Math.round(entry.damage)}</span>
        </div>
      ))}
    </div>
  );
};

// 装備効果詳細コンポーネント
const EquipmentEffectDetails: React.FC<{ entries: EquipmentEffectEntry[] }> = ({ entries }) => {
  if (!entries || entries.length === 0) return null;

  const typeIcon = (type: string) => {
    switch (type) {
      case 'lightcone': return '💎';
      case 'relic': return '🏛️';
      case 'ornament': return '🔮';
      default: return '⚡';
    }
  };

  return (
    <div className="space-y-1">
      <div className="text-xs font-semibold text-cyan-600 dark:text-cyan-400">装備効果:</div>
      {entries.map((entry, idx) => (
        <div key={idx} className="flex items-center gap-2 px-2 py-1 bg-cyan-50 dark:bg-cyan-900/30 rounded text-xs border-l-2 border-cyan-400">
          <span>{typeIcon(entry.type)}</span>
          <span className="text-cyan-600 dark:text-cyan-400">[{entry.source}]</span>
          <span>{entry.name}</span>
          {entry.target && <span className="text-gray-500">→ {entry.target}</span>}
        </div>
      ))}
    </div>
  );
};

// 統計名のフォーマット関数（共通）
const formatStatName = (key: string) => {
  const map: { [key: string]: string } = {
    atk_pct: '攻撃%',
    atk: '攻撃',
    crit_rate: '会心率',
    crit_dmg: '会心ダメ',
    all_type_dmg_boost: '与ダメ',
    def_ignore: '防御無視',
    res_pen: '耐性貫通',
    spd_pct: '速度%',
    spd: '速度',
    speed: '速度',
    hp_pct: 'HP%',
    hp: 'HP',
    def_pct: '防御%',
    def: '防御',
    break_effect: '撃破特効',
    weakness_break_efficiency: '撃破効率',
    effect_hit_rate: '効果命中',
    effect_res: '効果抵抗',
    dmg_taken_boost: '被ダメ',
    def_reduction: '防御ダウン',
    res_reduction: '耐性ダウン',
    max_ep: '最大EP',
    aggro: 'ヘイト',
  };
  return map[key] || key;
};

// 値のフォーマット関数（共通）
const formatStatValue = (key: string, value: number) => {
  const nonPercentStats = ['hp', 'atk', 'def', 'spd', 'speed', 'aggro', 'max_ep'];
  const isPercent = !nonPercentStats.includes(key);

  if (isPercent) {
    return `${value > 0 ? '+' : ''}${(value * 100).toFixed(1)}%`;
  } else {
    return `${value > 0 ? '+' : ''}${value.toFixed(1)}`;
  }
};

// 統計サマリーコンポーネント
const StatSummary: React.FC<{ stats: { [key: string]: number }, effects: EffectSummary[], customTitle?: string }> = ({ stats, effects, customTitle = "📊 ステータス:" }) => {
  if (!stats || Object.keys(stats).length === 0) return null;

  // 定数ステータスのキー（実数表示する項目）
  const CONSTANT_STATS = ['hp', 'atk', 'def', 'spd', 'hp_current', 'ep_current', 'shield_current'];

  return (
    <div className="mt-1 p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded border border-yellow-200 dark:border-yellow-800 text-xs">
      <div className="font-semibold text-yellow-800 dark:text-yellow-200 mb-1 flex items-center gap-1">
        <span>{customTitle}</span>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {Object.entries(stats).map(([key, value]) => {
          // 値が0に近い場合は表示しない
          if (value === undefined || value === null || isNaN(value) || Math.abs(value) < 0.0001) return null;

          const formattedValue = formatStatValue(key, value);

          // 内訳の計算
          const contributors = effects.filter(e => e.modifiers?.some(m => m.stat === key))
            .map(e => {
              const mod = e.modifiers!.find(m => m.stat === key);
              return mod ? { name: e.name, value: mod.value } : null;
            })
            .filter((c): c is { name: string; value: number } => c !== null);

          return (
            <div key={key} className="relative group cursor-help text-gray-700 dark:text-gray-300 flex items-center">
              <span className="opacity-75 mr-0.5">{formatStatName(key)}</span>
              <span className="font-bold">{formattedValue}</span>

              {/* ツールチップ: 内訳表示 */}
              {contributors.length > 0 && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50 w-max max-w-xs pointer-events-none">
                  <div className="bg-gray-800 dark:bg-gray-700 text-white text-xs rounded py-1 px-2 shadow-xl border border-gray-600">
                    <div className="font-bold mb-1 border-b border-gray-500 pb-1">{formatStatName(key)} 内訳</div>
                    {contributors.map((c, i) => (
                      <div key={i} className="flex justify-between gap-4">
                        <span>{c.name}</span>
                        <span className="font-mono">
                          {formatStatValue(key, c.value)}
                        </span>
                      </div>
                    ))}
                  </div>
                  {/* 矢印 */}
                  <div className="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[4px] border-t-gray-800 dark:border-t-gray-700 absolute left-1/2 -translate-x-1/2 top-full"></div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// 効果リストコンポーネント
const EffectList: React.FC<{ effects: EffectSummary[], title: string, stats?: { [key: string]: number }, emptyMessage?: string, statsTitle?: string }> = ({ effects, title, stats, emptyMessage = "なし", statsTitle }) => {
  if (!effects || (effects.length === 0 && !stats)) return (
    <div className="flex flex-col gap-1 min-h-[24px]">
      <div className="font-semibold text-xs text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700 pb-0.5 mb-0.5 w-fit">{title}</div>
      <span className="text-gray-400 italic text-xs">{emptyMessage}</span>
    </div>
  );

  return (
    <div className="flex flex-col gap-1">
      <div className="font-semibold text-xs text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700 pb-0.5 mb-0.5 w-fit">{title}</div>
      <div className="flex flex-wrap gap-1.5 items-center">
        {effects.map((e, i) => (
          <div key={i} className="group relative cursor-help bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 rounded flex items-center gap-1 text-xs hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">
            <span>{e.name}</span>
            <span className="text-gray-500 dark:text-gray-400 text-[10px]">{e.duration !== '∞' ? `(${e.duration}T)` : '(∞)'}</span>

            {/* Tooltip */}
            <div className="invisible group-hover:visible absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 pointer-events-none">
              <div className="bg-gray-800 dark:bg-gray-700 text-white text-xs rounded py-1 px-2 whitespace-nowrap shadow-xl border border-gray-600">
                {e.owner && <div className="font-semibold text-gray-300 mb-0.5">From: {e.owner}</div>}
                {e.modifiers && e.modifiers.length > 0 ? (
                  <div className="flex flex-col gap-0.5">
                    {e.modifiers.map((m, idx) => (
                      <div key={idx} className="flex gap-2 justify-between">
                        <span>{formatStatName(m.stat)}:</span>
                        <span>{formatStatValue(m.stat, m.value)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-gray-400">効果なし</div>
                )}
              </div>
              {/* Arrow */}
              <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800 dark:border-t-gray-700"></div>
            </div>
          </div>
        ))}
      </div>
      {stats && <StatSummary stats={stats} effects={effects} customTitle={statsTitle} />}
    </div>
  );
};

const SimulationLogTable: React.FC<SimulationLogTableProps> = ({ logs }) => {
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  const toggleRow = (index: number) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedRows(newExpanded);
  };

  // ログに詳細があるかどうかを判定
  const hasLogDetails = (log: SimulationLogEntry): boolean => {
    const hasHitDetails = log.hitDetails && log.hitDetails.length > 0;
    const hasDetails = log.logDetails && (
      (log.logDetails.primaryDamage && log.logDetails.primaryDamage.hitDetails.length > 0) ||
      (log.logDetails.additionalDamage && log.logDetails.additionalDamage.length > 0) ||
      (log.logDetails.healing && log.logDetails.healing.length > 0) ||
      (log.logDetails.shields && log.logDetails.shields.length > 0) ||
      (log.logDetails.damageTaken && log.logDetails.damageTaken.length > 0) ||
      (log.logDetails.equipmentEffects && log.logDetails.equipmentEffects.length > 0)
    );
    return hasHitDetails || !!hasDetails;
  };

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm text-left text-gray-500 dark:text-gray-400">
        <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
          <tr>
            <th scope="col" className="px-2 py-3 w-8"></th>
            <th scope="col" className="px-4 py-3">キャラ名</th>
            <th scope="col" className="px-4 py-3">行動時間</th>
            <th scope="col" className="px-4 py-3">行動の種類</th>
            <th scope="col" className="px-4 py-3">SP</th>
            <th scope="col" className="px-4 py-3">EP</th>
            <th scope="col" className="px-4 py-3">与ダメ</th>
            <th scope="col" className="px-4 py-3">被ダメ</th>
            <th scope="col" className="px-4 py-3">回復</th>
            <th scope="col" className="px-4 py-3">シールド</th>
            <th scope="col" className="px-4 py-3">自身HP</th>
            <th scope="col" className="px-4 py-3">対象HP</th>
            <th scope="col" className="px-4 py-3">対象靭性</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log, index) => {
            const showToggle = hasLogDetails(log);
            const isExpanded = expandedRows.has(index);

            // 新しい集計値を使用、なければ後方互換性のため旧値を使用
            const damageDealt = log.totalDamageDealt ?? log.damageDealt ?? 0;
            const damageTaken = log.totalDamageTaken ?? 0;
            const healing = log.totalHealing ?? log.healingDone ?? 0;
            const shield = log.totalShieldGiven ?? log.shieldApplied ?? 0;

            return (
              <React.Fragment key={index}>
                <tr className="dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer" onClick={() => showToggle && toggleRow(index)}>
                  <td className="px-2 py-4 text-center">
                    {showToggle && (
                      <button
                        className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 focus:outline-none"
                        onClick={(e) => { e.stopPropagation(); toggleRow(index); }}
                      >
                        {isExpanded ? '▼' : '▶'}
                      </button>
                    )}
                  </td>
                  <th scope="row" className="px-4 py-4 font-medium text-gray-900 whitespace-nowrap dark:text-white">
                    {log.characterName || (log.sourceId ? `Unit ${log.sourceId}` : 'Unknown')}
                  </th>
                  <td className="px-4 py-4">{log.actionTime !== undefined ? log.actionTime.toFixed(2) : (log.time !== undefined ? log.time.toFixed(2) : '-')}</td>
                  <td className="px-4 py-4">
                    {log.actionType}
                    {log.details && <div className="text-xs text-gray-400">{log.details}</div>}
                  </td>
                  <td className="px-4 py-4">{log.skillPointsAfterAction ?? '-'}</td>
                  <td className="px-4 py-4">{log.currentEp !== undefined ? (Math.floor(log.currentEp * 100) / 100).toFixed(2) : '-'}</td>
                  <td className="px-4 py-4 font-bold text-red-600">
                    {damageDealt > 0 ? Math.round(damageDealt) : '-'}
                  </td>
                  <td className="px-4 py-4 text-orange-600">
                    {damageTaken > 0 ? `-${Math.round(damageTaken)}` : '-'}
                  </td>
                  <td className="px-4 py-4 text-green-600">
                    {healing > 0 ? `+${Math.round(healing)}` : '-'}
                  </td>
                  <td className="px-4 py-4 text-purple-600">
                    {shield > 0 ? Math.round(shield) : '-'}
                  </td>
                  <td className="px-4 py-4 text-xs">{log.sourceHpState ?? '-'}</td>
                  <td className="px-4 py-4 text-xs">{log.targetHpState ?? '-'}</td>
                  <td className="px-4 py-4 text-xs text-cyan-600 dark:text-cyan-400">{log.targetToughness ?? '-'}</td>
                </tr>

                {/* 詳細行（展開時のみ表示） */}
                {isExpanded && showToggle && (
                  <tr className="bg-gray-50 dark:bg-gray-800">
                    <td colSpan={13} className="px-4 py-3 space-y-3">
                      {/* プライマリダメージのヒット詳細 */}
                      {log.logDetails?.primaryDamage && log.logDetails.primaryDamage.hitDetails.length > 0 && (
                        <div>
                          <div className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">メインダメージ ({Math.round(log.logDetails.primaryDamage.totalDamage)}):</div>
                          <HitDetailsRow hitDetails={log.logDetails.primaryDamage.hitDetails} />
                        </div>
                      )}

                      {/* 後方互換性: hitDetails */}
                      {!log.logDetails?.primaryDamage && log.hitDetails && log.hitDetails.length > 0 && (
                        <div>
                          <div className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">ヒット詳細:</div>
                          <HitDetailsRow hitDetails={log.hitDetails} />
                        </div>
                      )}

                      {/* 付加ダメージ */}
                      {log.logDetails?.additionalDamage && (
                        <AdditionalDamageDetails entries={log.logDetails.additionalDamage} />
                      )}

                      {/* 被ダメージ */}
                      {log.logDetails?.damageTaken && (
                        <DamageTakenDetails entries={log.logDetails.damageTaken} />
                      )}

                      {/* 回復 */}
                      {log.logDetails?.healing && (
                        <HealingDetails entries={log.logDetails.healing} />
                      )}

                      {/* シールド */}
                      {log.logDetails?.shields && (
                        <ShieldDetails entries={log.logDetails.shields} />
                      )}

                      {/* 装備効果 */}
                      {log.logDetails?.equipmentEffects && (
                        <EquipmentEffectDetails entries={log.logDetails.equipmentEffects} />
                      )}
                    </td>
                  </tr>
                )}

                {/* 効果行 */}
                <tr className="border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                  <td colSpan={13} className="px-4 py-2 text-xs text-gray-600 dark:text-gray-300">
                    {/* 新しい表示形式: 分割表示 */}
                    {log.sourceEffects || log.targetEffects ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Source Effects */}
                        <div className="bg-gray-100/50 dark:bg-gray-700/30 p-2 rounded border border-gray-200 dark:border-gray-700">
                          <EffectList
                            effects={log.sourceEffects || []}
                            title="自身 (Source)"
                            stats={log.sourceFinalStats || log.statTotals?.source}
                            emptyMessage="自身へのバフなし"
                            statsTitle={log.sourceFinalStats ? "📊 ステータス:" : "📊 バフ合計:"}
                          />
                        </div>

                        {/* Target Effects */}
                        <div className="bg-gray-100/50 dark:bg-gray-700/30 p-2 rounded border border-gray-200 dark:border-gray-700">
                          <EffectList
                            effects={log.targetEffects || []}
                            title="対象 (Target)"
                            stats={log.targetFinalStats || log.statTotals?.target}
                            emptyMessage="ターゲットへのデバフなし"
                            statsTitle={log.targetFinalStats ? "📊 ステータス:" : "📊 バフ合計:"}
                          />
                        </div>
                      </div>
                    ) : (
                      /* 後方互換性: 旧表示形式 */
                      <div className="flex flex-wrap gap-2 min-h-[24px] items-center">
                        <span className="font-semibold">効果:</span>
                        {log.activeEffects && log.activeEffects.length > 0 ? (
                          log.activeEffects.map((e, i) => (
                            <span key={i} className="bg-gray-200 dark:bg-gray-700 px-1 rounded flex items-center gap-1">
                              {e.owner && <span className="text-gray-500 dark:text-gray-400">[From: {e.owner}]</span>}
                              <span>{e.name}</span>
                              <span className="text-gray-500 dark:text-gray-400">({typeof e.duration === 'number' ? `残${e.duration}T` : '∞'})</span>
                            </span>
                          ))
                        ) : (
                          <span className="text-gray-400 italic">なし</span>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default SimulationLogTable;
